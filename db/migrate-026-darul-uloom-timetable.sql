-- Darul Uloom timetable (server/routes/timetable.js creates these itself on first use).
CREATE TABLE IF NOT EXISTS du_periods (
  id          BIGSERIAL PRIMARY KEY,
  madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
  name        TEXT NOT NULL,
  starts      TEXT NOT NULL,            -- 'HH:MM'
  ends        TEXT NOT NULL,
  is_break    BOOLEAN NOT NULL DEFAULT false,
  days        TEXT NOT NULL DEFAULT ''  -- '' = every school day, else e.g. '1,2,3,4'
);
CREATE INDEX IF NOT EXISTS idx_du_periods_madrasah ON du_periods (madrasah_id);
CREATE TABLE IF NOT EXISTS du_lessons (
  id          BIGSERIAL PRIMARY KEY,
  madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
  day         INTEGER NOT NULL,         -- 0 = Sunday … 6 = Saturday
  period_id   BIGINT NOT NULL,
  class_id    TEXT NOT NULL,
  subject_id  BIGINT,                   -- du_subjects.id when it's one of the year's books
  subject     TEXT NOT NULL,
  kitaab      TEXT NOT NULL DEFAULT '',
  teacher_id  TEXT,
  room        TEXT NOT NULL DEFAULT '',
  UNIQUE (madrasah_id, day, period_id, class_id)
);
-- What each lesson covered, per class (an Aalim year goes through its books together).
CREATE TABLE IF NOT EXISTS du_lesson_logs (
  id          BIGSERIAL PRIMARY KEY,
  madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
  class_id    TEXT NOT NULL,
  date        DATE NOT NULL,
  subject_id  BIGINT,
  subject     TEXT NOT NULL,
  kitaab      TEXT NOT NULL DEFAULT '',
  covered     TEXT NOT NULL,            -- e.g. 'Pages 34–36'
  notes       TEXT NOT NULL DEFAULT '', -- for the head
  teacher_id  TEXT,
  updated_at  TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (madrasah_id, class_id, date, subject, kitaab)
);
