-- Run this in Supabase Dashboard → SQL Editor
-- Adds AI processing columns to ops_feedback

ALTER TABLE ops_feedback
  ADD COLUMN IF NOT EXISTS ai_processed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_reply text,
  ADD COLUMN IF NOT EXISTS ai_reply_at timestamptz;

-- Index for fast unprocessed feedback queries
CREATE INDEX IF NOT EXISTS ops_feedback_ai_processed_idx
  ON ops_feedback (ai_processed) WHERE ai_processed = false;
