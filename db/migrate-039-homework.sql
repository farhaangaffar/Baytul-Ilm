-- Homework set for one child on one day. Own table, not a daily_records column, so
-- deleting a day's homework can never also wipe that day's behaviour comment (or vice versa).
CREATE TABLE IF NOT EXISTS homework (
  id          BIGSERIAL PRIMARY KEY,
  madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
  student_id  TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  text        TEXT NOT NULL DEFAULT '',
  updated_by  TEXT,
  UNIQUE (student_id, date)
);
CREATE INDEX IF NOT EXISTS idx_homework_madrasah ON homework (madrasah_id);
