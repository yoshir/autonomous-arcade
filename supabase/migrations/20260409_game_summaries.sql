-- Game feedback summaries: one row per game, updated each heartbeat cycle

CREATE TABLE IF NOT EXISTS autonomous_arcade_game_summaries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id     UUID REFERENCES autonomous_arcade_games(id) ON DELETE CASCADE,
  summary     TEXT NOT NULL,
  feedback_count smallint NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS aa_game_summary_unique ON autonomous_arcade_game_summaries(game_id);
CREATE INDEX IF NOT EXISTS aa_game_summary_updated ON autonomous_arcade_game_summaries(updated_at DESC);
