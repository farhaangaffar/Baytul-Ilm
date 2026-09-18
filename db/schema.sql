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

-- ── Masjid portal ──
-- A separate multi-tenant slice of the schema: many masaajid, each with its own
-- salaah times and talks that its own portal_users account can edit. Fields that
-- are sensitive or dispute-prone (sect, khutbah language, verification) are only
-- ever written by a super_admin, never exposed as editable on a masjid_admin's
-- own portal pages.

CREATE TABLE IF NOT EXISTS masaajid (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  address           TEXT NOT NULL DEFAULT '',
  city              TEXT NOT NULL DEFAULT '',
  postcode          TEXT NOT NULL DEFAULT '',
  country           TEXT NOT NULL DEFAULT 'UK',
  latitude          NUMERIC(9,6),
  longitude         NUMERIC(9,6),
  sect              TEXT NOT NULL DEFAULT 'unspecified'
                      CHECK (sect IN ('deobandi','barelwi','ahle_hadith','shia','other','unspecified')),
  khutbah_language  TEXT NOT NULL DEFAULT 'unspecified'
                      CHECK (khutbah_language IN ('english','arabic','urdu','mixed','other','unspecified')),
  phone             TEXT NOT NULL DEFAULT '',
  email             TEXT NOT NULL DEFAULT '',
  website           TEXT NOT NULL DEFAULT '',
  verified          BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMP NOT NULL DEFAULT now(),
  updated_at        TIMESTAMP NOT NULL DEFAULT now()
);

-- One row per masjid holding its *current* iqamah/azaan times — a masjid_admin
-- overwrites this whenever times change, rather than the app tracking a full
-- history or a monthly timetable (kept out of scope for v1).
CREATE TABLE IF NOT EXISTS salaah_times (
  masjid_id      TEXT PRIMARY KEY REFERENCES masaajid(id) ON DELETE CASCADE,
  fajr_azaan     TIME,
  fajr_iqamah    TIME,
  zuhr_azaan     TIME,
  zuhr_iqamah    TIME,
  asr_azaan      TIME,
  asr_iqamah     TIME,
  maghrib_azaan  TIME,
  maghrib_iqamah TIME,
  isha_azaan     TIME,
  isha_iqamah    TIME,
  jumuah_khutbah TIME,
  jumuah_iqamah  TIME,
  notes          TEXT NOT NULL DEFAULT '',
  updated_at     TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS talks (
  id          BIGSERIAL PRIMARY KEY,
  masjid_id   TEXT NOT NULL REFERENCES masaajid(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  speaker     TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  language    TEXT NOT NULL DEFAULT 'unspecified'
                CHECK (language IN ('english','arabic','urdu','mixed','other','unspecified')),
  date        DATE NOT NULL,
  start_time  TIME NOT NULL,
  end_time    TIME,
  created_at  TIMESTAMP NOT NULL DEFAULT now(),
  updated_at  TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_talks_masjid_date ON talks (masjid_id, date);

-- Portal login accounts. masjid_id is NULL for a super_admin (our team, who can
-- manage every masjid); a masjid_admin is scoped to exactly one masjid and can
-- only ever touch that masjid's salaah_times/talks rows.
CREATE TABLE IF NOT EXISTS portal_users (
  id            TEXT PRIMARY KEY,
  masjid_id     TEXT REFERENCES masaajid(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('masjid_admin','super_admin')),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT now(),
  CHECK (role = 'super_admin' OR masjid_id IS NOT NULL)
);
