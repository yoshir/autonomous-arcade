# pg_net + Ollama Setup Guide

**Status:** ✅ DEPLOYED — 2026-04-06

## Overview

Replaced Supabase polling with pg_net trigger for instant feedback processing.

## Architecture

```
Feedback inserted → pg_net trigger → Edge Function → Ollama → Slack (clawdbot)
```

## What's Done

- [x] GitHub repo: https://github.com/yoshir/autonomous-arcade
- [x] Ollama listening on `0.0.0.0:11434` — Tailscale URL: `http://ryans-macbook-pro-2.taila8cf65.ts.net:11434`
- [x] `OLLAMA_HOST=0.0.0.0` added to `homebrew.mxcl.ollama.plist` — Ollama restarted
- [x] Tailscale verified: `curl http://ryans-macbook-pro-2.taila8cf65.ts.net:11434/api/tags` → all 3 models ✅
- [x] Edge Function `process-feedback` deployed to Supabase
- [x] `OLLAMA_BASE_URL` secret set: `http://ryans-macbook-pro-2.taila8cf65.ts.net:11434`
- [x] `SLACK_CHANNEL` secret set: `C0AAX5Z85MG`

## Setup Components

### 1. Edge Function: `supabase/functions/process-feedback/index.ts`
Deployed to Supabase. Receives pg_net HTTP POST, runs Gemma, posts to Slack.

**Environment variables (set via `supabase secrets`):**
- `OLLAMA_BASE_URL` — `http://ryans-macbook-pro-2.taila8cf65.ts.net:11434`
- `OLLAMA_MODEL` — defaults to `gemma4:31b`
- `SUPABASE_SERVICE_ROLE_KEY` — injected automatically by Supabase
- `SLACK_CHANNEL` — `C0AAX5Z85MG`

### 2. Ollama config
`OLLAMA_HOST=0.0.0.0` in `~/Library/LaunchAgents/homebrew.mxcl.ollama.plist`

Verified reachable via Tailscale on `http://ryans-macbook-pro-2.taila8cf65.ts.net:11434`

### 3. pg_net Trigger: `heartbeat-engine/pg_net_trigger.sql`
Run in Supabase Dashboard → SQL Editor.

```sql
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION notify_feedback_insert()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://ildvhztonjaensqkmxsk.supabase.co/functions/v1/process-feedback',
    body := json_build_object(
      'id',         NEW.id,
      'type',       NEW.type,
      'content',    NEW.content,
      'rating',     NEW.rating,
      'page_url',   NEW.page_url,
      'session_id', NEW.session_id,
      'metadata',   NEW.metadata
    )::text,
    headers := '{"Content-Type": "application/json"}'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_feedback_insert ON autonomous_arcade_feedback;
CREATE TRIGGER on_feedback_insert
  AFTER INSERT ON autonomous_arcade_feedback
  FOR EACH ROW EXECUTE FUNCTION notify_feedback_insert();
```

### 4. Heartbeat Engine
Stripped to status-only (posts to Slack every 30s). No longer polls for feedback.

## What's Missing (Ryan Action Required)

1. **Supabase SQL Editor** — run:
   - `heartbeat-engine/MIGRATION.sql` (creates tables + seeds games)
   - `heartbeat-engine/pg_net_trigger.sql` (attaches pg_net trigger)

2. **Game pages** — add `data-game-id="<uuid>"` to each game's feedback widget script tag. I'll pull UUIDs after migration.

## Files

| File | Purpose |
|---|---|
| `supabase/functions/process-feedback/index.ts` | Edge Function (deployed) |
| `heartbeat-engine/pg_net_trigger.sql` | DB trigger — run in SQL Editor |
| `heartbeat-engine/MIGRATION.sql` | Schema + seed data — run in SQL Editor |
| `heartbeat-engine/index.js` | Status-only heartbeat (no polling) |
| `feedback-widget.js` | Updated with `data-game-id` support |

## Troubleshooting

**Edge Function returns "Connection refused" to Ollama:**
→ Verify Ollama is listening on 0.0.0.0: `lsof -i :11434` should show `*:11434`
→ Verify Tailscale: `curl http://ryans-macbook-pro-2.taila8cf65.ts.net:11434/api/tags`

**pg_net not firing:**
→ Check `pg_net` extension: `SELECT net.http_post();` in SQL Editor should not error

**Slack not posting:**
→ Verify `clawdbot` is in PATH on the local machine (Edge Functionshells out via `clawdbot message send`)
