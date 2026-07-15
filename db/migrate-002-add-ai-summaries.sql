-- Adds saved AI monthly summaries. Run once against an existing database
-- that was created from schema.sql before this table existed.
-- Not required for production — api/ai-summary.js creates this table itself
-- on first use, since this app has no automated migration runner. Kept here
-- for anyone who prefers to apply schema changes manually up front.
CREATE TABLE IF NOT EXISTS ai_summaries (
  id           BIGSERIAL PRIMARY KEY,
  student_id   TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  month        TEXT NOT NULL,
  summary      TEXT NOT NULL DEFAULT '',
  instructions TEXT NOT NULL DEFAULT '',
  behavior     TEXT NOT NULL DEFAULT '',
  updated_at   TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (student_id, month)
);
ALTER TABLE ai_summaries ADD COLUMN IF NOT EXISTS behavior TEXT NOT NULL DEFAULT '';
