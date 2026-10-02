-- Madrasah management app — Postgres schema
-- Mirrors the shape of the previous localStorage data model, normalized into real tables.
-- Fee/daily-record ids are now DB-generated (bigserial), removing the class of
-- id-collision bug the old client-side Date.now()-based ids were exposed to.
--
-- Many madaaris share one database: every table of school data carries madrasah_id,
-- and the API limits every query to the signed-in person's madrasah. A database made
-- before that was added is brought to this shape by db/migrate-011-madaaris.sql.

CREATE TABLE IF NOT EXISTS madaaris (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  code        TEXT NOT NULL UNIQUE,      -- typed on the sign-in screen, e.g. 'baytul-ilm'
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS teachers (
  id          TEXT PRIMARY KEY,
  madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL DEFAULT '',
  email       TEXT NOT NULL DEFAULT '',
  subjects    JSONB NOT NULL DEFAULT '[]',
  sort_order  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_teachers_madrasah ON teachers (madrasah_id);

CREATE TABLE IF NOT EXISTS classes (
  id          TEXT PRIMARY KEY,
  madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
  name        TEXT NOT NULL,
  teacher_id  TEXT REFERENCES teachers(id) ON DELETE SET NULL,
  quran_type  TEXT  -- 'hifz' | 'nazira' | 'qaida', or NULL: what Qur'an progress is recorded
);
CREATE INDEX IF NOT EXISTS idx_classes_madrasah ON classes (madrasah_id);

CREATE TABLE IF NOT EXISTS students (
  id             TEXT PRIMARY KEY,
  madrasah_id    INTEGER NOT NULL REFERENCES madaaris(id),
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
CREATE INDEX IF NOT EXISTS idx_students_madrasah ON students (madrasah_id);

CREATE TABLE IF NOT EXISTS academic_years (
  madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
  year        TEXT NOT NULL,
  PRIMARY KEY (madrasah_id, year)
);

-- One row per madrasah; a madrasah's settings row uses the madrasah's own id.
CREATE TABLE IF NOT EXISTS settings (
  id                  INTEGER PRIMARY KEY,
  madrasah_id         INTEGER NOT NULL UNIQUE REFERENCES madaaris(id),
  school_name         TEXT NOT NULL DEFAULT 'Madrasah',
  school_name_arabic  TEXT NOT NULL DEFAULT '',
  default_weekly_fee  NUMERIC(10,2) NOT NULL DEFAULT 15, -- the default fee per period (see fee_frequency)
  fee_frequency       TEXT NOT NULL DEFAULT 'weekly',  -- 'weekly' | 'monthly' | 'termly'
  report_period       TEXT NOT NULL DEFAULT 'monthly', -- 'monthly' | 'termly' (Reports / AI summaries)
  currency_symbol     TEXT NOT NULL DEFAULT '£',
  logo                TEXT, -- data: URL (PNG/JPEG), downsized in the browser before upload
  icon                TEXT, -- data: URL, 512px square app icon built from the logo
  parent_portal       BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS attendance (
  id          BIGSERIAL PRIMARY KEY,
  madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
  year        TEXT NOT NULL,
  student_id  TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('P','L','A')),
  late_time   TEXT,  -- 'HH:MM' a student was marked Late, stamped on the day
  UNIQUE (year, student_id, date)
);
CREATE INDEX IF NOT EXISTS idx_attendance_year_date ON attendance (year, date);
CREATE INDEX IF NOT EXISTS idx_attendance_madrasah ON attendance (madrasah_id);

CREATE TABLE IF NOT EXISTS fees (
  id            BIGSERIAL PRIMARY KEY,
  madrasah_id   INTEGER NOT NULL REFERENCES madaaris(id),
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
CREATE INDEX IF NOT EXISTS idx_fees_madrasah ON fees (madrasah_id);

CREATE TABLE IF NOT EXISTS daily_records (
  id          BIGSERIAL PRIMARY KEY,
  madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
  student_id  TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  comment     TEXT NOT NULL DEFAULT '',
  positive    TEXT NOT NULL DEFAULT '',
  negative    TEXT NOT NULL DEFAULT '',
  UNIQUE (student_id, date)
);
CREATE INDEX IF NOT EXISTS idx_daily_records_madrasah ON daily_records (madrasah_id);

-- One saved AI summary per student per report period ('YYYY-MM' or 'term:<id>') — the
-- version that's been reviewed/edited and attached to that student's report, as opposed
-- to a fresh one-off generation that only lives in memory until the page is left.
CREATE TABLE IF NOT EXISTS ai_summaries (
  id           BIGSERIAL PRIMARY KEY,
  madrasah_id  INTEGER NOT NULL REFERENCES madaaris(id),
  student_id   TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  month        TEXT NOT NULL,
  summary      TEXT NOT NULL DEFAULT '',
  instructions TEXT NOT NULL DEFAULT '',
  behavior     TEXT NOT NULL DEFAULT '',
  updated_at   TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (student_id, month)
);
CREATE INDEX IF NOT EXISTS idx_ai_summaries_madrasah ON ai_summaries (madrasah_id);

-- Individual logins (see server/auth.js). login is a username or email address,
-- unique within its madrasah. Each madrasah has an owner (its head); a teacher login
-- belongs to one teacher or to one class (a shared class login). The platform owner
-- (platform_admin) can also add and manage madaaris.
CREATE TABLE IF NOT EXISTS users (
  id               BIGSERIAL PRIMARY KEY,
  madrasah_id      INTEGER NOT NULL REFERENCES madaaris(id),
  login            TEXT NOT NULL,
  password_hash    TEXT NOT NULL,
  role             TEXT NOT NULL CONSTRAINT users_role_check CHECK (role IN ('owner','teacher','parent')),
  teacher_id       TEXT UNIQUE REFERENCES teachers(id) ON DELETE CASCADE,
  class_id         TEXT UNIQUE REFERENCES classes(id) ON DELETE CASCADE,
  platform_admin   BOOLEAN NOT NULL DEFAULT false,
  active           BOOLEAN NOT NULL DEFAULT true,
  session_version  INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMP NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_madrasah_login_key ON users (madrasah_id, login);

-- A madrasah's term dates per academic year (Settings → Terms), for termly fees and reports.
CREATE TABLE IF NOT EXISTS terms (
  id          BIGSERIAL PRIMARY KEY,
  madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
  year        TEXT NOT NULL,
  name        TEXT NOT NULL,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS idx_terms_madrasah ON terms (madrasah_id);

-- Qur'an progress, recorded on Daily records (server/routes/quran.js): one entry per
-- student per day per kind — hifz sabaq / sabqi / manzil, nazira reading, qaida lesson.
CREATE TABLE IF NOT EXISTS quran_progress (
  id           BIGSERIAL PRIMARY KEY,
  madrasah_id  INTEGER NOT NULL REFERENCES madaaris(id),
  student_id   TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  date         DATE NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('sabaq','sabqi','manzil','reading','lesson')),
  from_surah   INTEGER, from_ayah INTEGER, to_surah INTEGER, to_ayah INTEGER,
  lesson       TEXT NOT NULL DEFAULT '',
  grade        TEXT CHECK (grade IN ('good','weak','repeat')),
  note         TEXT NOT NULL DEFAULT '',
  unit         TEXT NOT NULL DEFAULT 'ayah',  -- 'ayah' or 'quarter' (recorded in juz quarters)
  updated_at   TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (student_id, date, kind)
);
CREATE INDEX IF NOT EXISTS idx_quran_progress_madrasah ON quran_progress (madrasah_id);

-- Juz a student had already memorised before records started here.
CREATE TABLE IF NOT EXISTS quran_students (
  student_id   TEXT PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  madrasah_id  INTEGER NOT NULL REFERENCES madaaris(id),
  prior_juz    INTEGER[] NOT NULL DEFAULT '{}'
);

-- Parent portal: which children each family login covers, and absences parents report.
CREATE TABLE IF NOT EXISTS parent_students (
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id   TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  madrasah_id  INTEGER NOT NULL REFERENCES madaaris(id),
  PRIMARY KEY (user_id, student_id)
);
CREATE TABLE IF NOT EXISTS absence_reports (
  id           BIGSERIAL PRIMARY KEY,
  madrasah_id  INTEGER NOT NULL REFERENCES madaaris(id),
  student_id   TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  date         DATE NOT NULL,
  reason       TEXT NOT NULL,
  note         TEXT NOT NULL DEFAULT '',
  reported_by  BIGINT REFERENCES users(id) ON DELETE SET NULL,
  seen         BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (student_id, date)
);
CREATE INDEX IF NOT EXISTS idx_absence_reports_madrasah_date ON absence_reports (madrasah_id, date);

-- AI requests per madrasah, counted on the platform owner's Madaaris page.
CREATE TABLE IF NOT EXISTS ai_usage (
  id           BIGSERIAL PRIMARY KEY,
  madrasah_id  INTEGER NOT NULL REFERENCES madaaris(id),
  kind         TEXT NOT NULL,   -- 'summary' | 'ask'
  created_at   TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_madrasah_time ON ai_usage (madrasah_id, created_at);

-- The first madrasah. Its owner account is created from the sign-in screen with
-- ADMIN_PASSWORD, and becomes the platform owner.
INSERT INTO madaaris (id, name, code) VALUES (1, 'Madrasah', 'madrasah') ON CONFLICT (id) DO NOTHING;
SELECT setval(pg_get_serial_sequence('madaaris', 'id'), (SELECT max(id) FROM madaaris));
INSERT INTO settings (id, madrasah_id) VALUES (1, 1) ON CONFLICT (id) DO NOTHING;
INSERT INTO academic_years (madrasah_id, year) VALUES (1, '25-26') ON CONFLICT DO NOTHING;
