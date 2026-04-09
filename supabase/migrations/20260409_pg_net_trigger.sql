-- Migration: pg_net trigger + conversation threading
-- Adds parent_id for reply threads, plus pg_net trigger for real-time AI replies

-- ─── Add parent_id for conversation threading ────────────────────────────────
ALTER TABLE autonomous_arcade_feedback
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES autonomous_arcade_feedback(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS aa_feedback_parent_idx ON autonomous_arcade_feedback(parent_id);

-- ─── pg_net trigger: fire edge function on new feedback insert ────────────────
-- Drop existing trigger if any (idempotent)
DROP TRIGGER IF EXISTS on_autonomous_arcade_feedback_insert ON autonomous_arcade_feedback;
DROP FUNCTION IF EXISTS pg_net_feedback_notify();

CREATE OR REPLACE FUNCTION pg_net_feedback_notify()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://ildvhztonjaensqkmxsk.supabase.co/functions/v1/process-feedback',
    headers := json_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := json_build_object(
      'id',         NEW.id,
      'type',       NEW.type,
      'content',    NEW.content,
      'rating',     NEW.rating,
      'session_id', NEW.session_id,
      'page_url',   NEW.page_url,
      'parent_id',  NEW.parent_id
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_autonomous_arcade_feedback_insert
  AFTER INSERT ON autonomous_arcade_feedback
  FOR EACH ROW EXECUTE FUNCTION pg_net_feedback_notify();
