-- Darul Uloom course: year groups (classes.course_order), subjects & kitaabs, and the
-- "Move everyone up" log. The API makes these itself on first use (server/routes/course.js);
-- this file is only for running by hand.
ALTER TABLE classes ADD COLUMN IF NOT EXISTS course_order INTEGER;
CREATE TABLE IF NOT EXISTS du_subjects (
  id          BIGSERIAL PRIMARY KEY,
  madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
  class_id    TEXT NOT NULL,
  subject     TEXT NOT NULL,
  kitaab      TEXT NOT NULL DEFAULT '',
  teacher_id  TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_du_subjects_madrasah ON du_subjects (madrasah_id, class_id);
CREATE TABLE IF NOT EXISTS du_year_moves (
  id          BIGSERIAL PRIMARY KEY,
  madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
  moved_at    TIMESTAMP NOT NULL DEFAULT now(),
  undone      BOOLEAN NOT NULL DEFAULT false,
  changes     JSONB NOT NULL
);
