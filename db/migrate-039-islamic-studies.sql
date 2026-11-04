-- A school's Islamic Studies trackers (server/routes/studies.js). The API adds these itself on first use; this file is
-- for running by hand. Nothing existing changes.
ALTER TABLE classes ADD COLUMN IF NOT EXISTS year_group INTEGER;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS studies_seeded BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS is_items (
  id          BIGSERIAL PRIMARY KEY,
  madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
  kind        TEXT NOT NULL,
  name        TEXT NOT NULL,
  detail      TEXT NOT NULL DEFAULT '',
  year_group  INTEGER NOT NULL DEFAULT 0,
  sort        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_is_items_madrasah ON is_items (madrasah_id);
CREATE TABLE IF NOT EXISTS is_progress (
  madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
  student_id  TEXT NOT NULL,
  item_id     BIGINT NOT NULL,
  level       SMALLINT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (student_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_is_progress_madrasah ON is_progress (madrasah_id, item_id);
