-- Adds changelog table for activity feed

CREATE TABLE IF NOT EXISTS autonomous_arcade_changelog (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_slug   TEXT,                           -- null for site-wide changes
  game_id     UUID REFERENCES autonomous_arcade_games(id),
  icon        TEXT NOT NULL DEFAULT '🚀',     -- emoji
  message     TEXT NOT NULL,                  -- the changelog text
  change_type TEXT NOT NULL CHECK (change_type IN (
    'bug_fix', 'new_feature', 'improvement', 'tweak', 'deployment'
  )),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS aa_changelog_created_idx ON autonomous_arcade_changelog(created_at DESC);
CREATE INDEX IF NOT EXISTS aa_changelog_game_idx   ON autonomous_arcade_changelog(game_slug);
