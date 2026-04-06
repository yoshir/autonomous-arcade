# Devlog: AI Feedback Heartbeat Engine

**Date:** 2026-04-06
**Status:** Built, pending deployment
**Prereqs:** SQL migration + Vercel push

---

## What

A persistent heartbeat process that:
1. Polls Supabase every 30s for unprocessed feedback
2. Runs each item through **Gemma 7B** via local ollama
3. Posts the feedback + AI reply to Slack via **Clawdbot** (`clawdbot message send`)
4. Marks the item as processed with the AI reply text

Lives at: `heartbeat-engine/`

---

## Architecture

### Schema — Two Tables

**`autonomous_arcade_games`** — game registry
```
id        UUID PRIMARY KEY
slug      TEXT UNIQUE  -- 'aim-trainer', 'hex-match', etc.
title     TEXT
active    boolean DEFAULT true
created_at
```

**`autonomous_arcade_feedback`** — feedback with FK to games
```
id              UUID PRIMARY KEY
game_id         UUID REFERENCES autonomous_arcade_games(id)
type            TEXT  -- comment, bug, suggestion, rating
content         TEXT
rating          smallint (1-5)
page_url        TEXT
session_id      TEXT
ip_hash         TEXT
user_agent      TEXT
metadata        jsonb
ai_processed    boolean DEFAULT false
ai_reply        TEXT
ai_reply_at     timestamptz
created_at
```

**Why UUID over slug parsing:** URL-based slug lookup breaks when URLs change. FK by UUID is the right abstraction — the game page embeds `<script data-game-id="<uuid>">` and the widget posts that UUID with every submission.

### API — Dual Write

`api/feedback.js` writes to both:
- `autonomous_arcade_feedback` (new, proper schema)
- `ops_feedback` (legacy, backward compat)

### Heartbeat Engine — Clawdbot Relay

No new Slack bot token needed. The engine shells out to:
```
clawdbot message send --channel slack --target channel:C0AAX5Z85MG --message "..."
```

Uses Clawdbot's existing Slack connection. Auto-starts on Mac boot via launchd.

### Gemma vs Gemini 2.5 Flash

| Model | Cost | Capability |
|-------|------|------------|
| Gemma 7B (local ollama) | ~$0 | Solid |
| Gemini 2.5 Flash (OpenRouter) | ~$0.0002/feedback | Better reasoning |

For this volume ($1-2/month max either way), Gemma is fine. OpenRouter is a one-line config swap if you want upgrades later.

---

## Files Changed

```
api/feedback.js              -- updated to write new UUID tables + dual write
feedback-widget.js           -- added data-game-id support
heartbeat-engine/
  index.js                    -- rewritten for new schema + Clawdbot relay
  package.json                -- stripped ollama dep, uses fetch
  MIGRATION.sql               -- new tables + seed data
  ecosystem.config.cjs         -- PM2 config (optional)
  com.yoshbot.autonomous-arcade-heartbeat.plist  -- launchd agent
  .env.example                -- no env vars needed
```

---

## What's Missing

- [ ] Run `MIGRATION.sql` in Supabase SQL Editor
- [ ] Get game UUIDs from `autonomous_arcade_games`, add `data-game-id` to each game page
- [ ] Commit + push to Vercel (`main` branch, auto-deploys)
- [ ] Start heartbeat engine (`npm start` or launchd)

---

## Next

1. Ryan runs SQL migration
2. I pull UUIDs, update game pages with `data-game-id`
3. Commit + push → Vercel deploys updated widget + API
4. Heartbeat engine goes live
