-- Baytul 'Ilm Madrasah — Postgres schema
-- Mirrors the shape of the previous localStorage data model, normalized into real tables.
-- Fee/daily-record ids are now DB-generated (bigserial), removing the class of
-- id-collision bug the old client-side Date.now()-based ids were exposed to.

CREATE TABLE IF NOT EXISTS teachers (
  id       TEXT PRIMARY KEY,
  name     TEXT NOT NULL,
  phone    TEXT NOT NULL DEFAULT '',
  email    TEXT NOT NULL DEFAULT '',
  subjects JSONB NOT NULL DEFAULT '[]',
  sort_order INTEGER
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
  leave_date     DATE,
  status         TEXT NOT NULL DEFAULT 'Active',
  notes          TEXT NOT NULL DEFAULT '',
  sort_order     INTEGER
);

CREATE TABLE IF NOT EXISTS academic_years (
  year TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS settings (
  id                  INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  school_name         TEXT NOT NULL DEFAULT 'Madrasah',
  school_name_arabic  TEXT NOT NULL DEFAULT '',
  default_weekly_fee  NUMERIC(10,2) NOT NULL DEFAULT 15, -- the default fee per period (see fee_frequency)
  fee_frequency       TEXT NOT NULL DEFAULT 'weekly',  -- 'weekly' | 'monthly' | 'termly'
  currency_symbol     TEXT NOT NULL DEFAULT '£',
  logo                TEXT, -- data: URL (PNG/JPEG), downsized in the browser before upload
  icon                TEXT  -- data: URL, 512px square app icon built from the logo
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
  -- 'week' | 'month' | 'term'; week_starting holds the period's start date for each
  period        TEXT NOT NULL DEFAULT 'week'
);
CREATE UNIQUE INDEX IF NOT EXISTS fees_year_student_period_start_key ON fees (year, student_id, period, week_starting);
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

-- One saved AI monthly summary per student per month — the version that's been
-- reviewed/edited and attached to that student's report, as opposed to a fresh
-- one-off generation that only lives in memory until the page is left.
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

INSERT INTO settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
INSERT INTO academic_years (year) VALUES ('2025-26') ON CONFLICT (year) DO NOTHING;

-- Individual logins (see server/auth.js). One owner (super admin); teachers are
-- linked to a teachers row and only reach their own classes. Created by the API on
-- first use too (ensureUsersTable), like the other added tables/columns.
CREATE TABLE IF NOT EXISTS users (
  id               BIGSERIAL PRIMARY KEY,
  email            TEXT NOT NULL UNIQUE,
  password_hash    TEXT NOT NULL,
  role             TEXT NOT NULL CHECK (role IN ('owner','teacher')),
  teacher_id       TEXT UNIQUE REFERENCES teachers(id) ON DELETE CASCADE,
  active           BOOLEAN NOT NULL DEFAULT true,
  session_version  INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMP NOT NULL DEFAULT now()
);

-- A madrasah's term dates per academic year (Settings → Terms), for termly fees and reports.
CREATE TABLE IF NOT EXISTS terms (
  id          BIGSERIAL PRIMARY KEY,
  year        TEXT NOT NULL,
  name        TEXT NOT NULL,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  CHECK (end_date >= start_date)
);
