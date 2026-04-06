-- pg_net trigger for autonomous_arcade_feedback
-- Run this in Supabase Dashboard → SQL Editor
-- Fires on every new insert → calls the process-feedback Edge Function

-- 1. Enable pg_net (required once per database)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Create wrapper function
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

-- 3. Attach trigger (replaces any existing one)
DROP TRIGGER IF EXISTS on_feedback_insert ON autonomous_arcade_feedback;
CREATE TRIGGER on_feedback_insert
  AFTER INSERT ON autonomous_arcade_feedback
  FOR EACH ROW EXECUTE FUNCTION notify_feedback_insert();
