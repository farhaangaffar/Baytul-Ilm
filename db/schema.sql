-- Baytul 'Ilm Madrasah — Postgres schema
-- Mirrors the shape of the previous localStorage data model, normalized into real tables.
-- Fee/daily-record ids are now DB-generated (bigserial), removing the class of
-- id-collision bug the old client-side Date.now()-based ids were exposed to.

CREATE TABLE IF NOT EXISTS teachers (
  id       TEXT PRIMARY KEY,
  name     TEXT NOT NULL,
  phone    TEXT NOT NULL DEFAULT '',
  email    TEXT NOT NULL DEFAULT '',
  subjects JSONB NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS classes (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  teacher_id TEXT REFERENCES teachers(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS students (
  id             TEXT PRIMARY KEY,
  forename       TEXT NOT NULL,
  surname        TEXT NOT NULL,
  dob            DATE,
  class          TEXT NOT NULL,
  parent1_name   TEXT NOT NULL DEFAULT '',
  parent1_phone  TEXT NOT NULL DEFAULT '',
  parent2_name   TEXT NOT NULL DEFAULT '',
  parent2_phone  TEXT NOT NULL DEFAULT '',
  weekly_fee     NUMERIC(10,2) NOT NULL DEFAULT 15,
  enroll_date    DATE,
  status         TEXT NOT NULL DEFAULT 'Active',
  notes          TEXT NOT NULL DEFAULT '',
  sort_order     INTEGER
);

CREATE TABLE IF NOT EXISTS academic_years (
  year TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS settings (
  id                  INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  school_name         TEXT NOT NULL DEFAULT 'Baytul ''Ilm Madrasah',
  school_name_arabic  TEXT NOT NULL DEFAULT 'بيت العلم',
  default_weekly_fee  NUMERIC(10,2) NOT NULL DEFAULT 15
);

CREATE TABLE IF NOT EXISTS attendance (
  id         BIGSERIAL PRIMARY KEY,
  year       TEXT NOT NULL,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  date       DATE NOT NULL,
  status     TEXT NOT NULL CHECK (status IN ('P','L','A')),
  UNIQUE (year, student_id, date)
);
CREATE INDEX IF NOT EXISTS idx_attendance_year_date ON attendance (year, date);

CREATE TABLE IF NOT EXISTS fees (
  id            BIGSERIAL PRIMARY KEY,
  year          TEXT NOT NULL,
  student_id    TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  week_starting DATE NOT NULL,
  amount        NUMERIC(10,2) NOT NULL,
  status        TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Paid')),
  paid_date     DATE,
  UNIQUE (year, student_id, week_starting)
);
CREATE INDEX IF NOT EXISTS idx_fees_year_week ON fees (year, week_starting);

CREATE TABLE IF NOT EXISTS daily_records (
  id         BIGSERIAL PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  date       DATE NOT NULL,
  comment    TEXT NOT NULL DEFAULT '',
  positive   TEXT NOT NULL DEFAULT '',
  negative   TEXT NOT NULL DEFAULT '',
  UNIQUE (student_id, date)
);

INSERT INTO settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
INSERT INTO academic_years (year) VALUES ('2025-26') ON CONFLICT (year) DO NOTHING;
