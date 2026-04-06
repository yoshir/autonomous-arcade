-- Migration: autonomous-arcade proper schema
-- Run in Supabase → SQL Editor

-- ─── Games registry ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS autonomous_arcade_games (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT UNIQUE NOT NULL,
  title       TEXT,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ─── Feedback (replaces ops_feedback entries for autonomous-arcade) ───────────
CREATE TABLE IF NOT EXISTS autonomous_arcade_feedback (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id         UUID REFERENCES autonomous_arcade_games(id),
  type            TEXT NOT NULL CHECK (type IN ('comment', 'bug', 'suggestion', 'rating')),
  content         TEXT,
  rating          smallint CHECK (rating BETWEEN 1 AND 5),
  session_id      TEXT,
  page_url        TEXT,
  ip_hash         TEXT,
  user_agent      TEXT,
  metadata        jsonb DEFAULT '{}',
  ai_processed    boolean NOT NULL DEFAULT false,
  ai_reply        TEXT,
  ai_reply_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS aa_feedback_game_id_idx     ON autonomous_arcade_feedback(game_id);
CREATE INDEX IF NOT EXISTS aa_feedback_created_idx     ON autonomous_arcade_feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS aa_feedback_unprocessed_idx ON autonomous_arcade_feedback(ai_processed) WHERE ai_processed = false;

-- ─── Seed existing games ──────────────────────────────────────────────────────
INSERT INTO autonomous_arcade_games (slug, title) VALUES
  ('aim-trainer',  'Aim Trainer'),
  ('hex-match',    'Hex Match'),
  ('pulse-run',    'Pulse Run'),
  ('reflex-test',  'Reflex Test'),
  ('type-racer',   'Type Racer')
ON CONFLICT (slug) DO NOTHING;
