-- Lesson resources (a school's Islamic Studies, stage 3): links on a surah, du'aa or practical.
-- The API makes this itself on first use (server/routes/studies.js ensure()); this file is for doing it by hand.
CREATE TABLE IF NOT EXISTS is_links (
  id            BIGSERIAL PRIMARY KEY,
  madrasah_id   INTEGER NOT NULL REFERENCES madaaris(id),
  item_id       BIGINT NOT NULL,
  name          TEXT NOT NULL,
  url           TEXT NOT NULL,
  added_by      TEXT NOT NULL DEFAULT '',
  added_by_user TEXT NOT NULL DEFAULT '',
  added_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_is_links_madrasah ON is_links (madrasah_id, item_id);
