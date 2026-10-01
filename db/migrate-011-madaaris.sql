-- Many madaaris in one database.
--
-- Every row of school data gets a madrasah_id, and everything already in the
-- database becomes madrasah 1 (named and coded after its own Settings), so the
-- original madrasah carries on exactly as before. Nothing is deleted. Logins get a
-- username that only has to be unique within its own madrasah, a login can belong to
-- a whole class (a shared class login), and the original owner becomes the platform
-- owner.
--
-- Run this ONCE, deliberately, against a database before the code that needs it is
-- deployed there (take a Backup from Settings first). It runs as one transaction, so
-- it either all happens or none of it does, and it's safe to re-run: every step
-- checks whether it's already been done. Until it has run, the API answers every
-- request with "the database needs updating" (see api/router.js).

BEGIN;

CREATE TABLE IF NOT EXISTS madaaris (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  code        TEXT NOT NULL UNIQUE,      -- typed on the sign-in screen, e.g. 'baytul-ilm'
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMP NOT NULL DEFAULT now()
);

-- Tables and columns that older databases might not have yet (their routes used to
-- create them on first use), so this script never depends on those having run.
CREATE TABLE IF NOT EXISTS ai_summaries (
  id           BIGSERIAL PRIMARY KEY,
  student_id   TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  month        TEXT NOT NULL,
  summary      TEXT NOT NULL DEFAULT '',
  instructions TEXT NOT NULL DEFAULT '',
  updated_at   TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (student_id, month)
);
ALTER TABLE ai_summaries ADD COLUMN IF NOT EXISTS behavior TEXT NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS terms (
  id          BIGSERIAL PRIMARY KEY,
  year        TEXT NOT NULL,
  name        TEXT NOT NULL,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  CHECK (end_date >= start_date)
);
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
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS late_time TEXT;
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS sort_order INTEGER;
ALTER TABLE students ADD COLUMN IF NOT EXISTS leave_date DATE;
ALTER TABLE fees ADD COLUMN IF NOT EXISTS period TEXT NOT NULL DEFAULT 'week';
ALTER TABLE fees DROP CONSTRAINT IF EXISTS fees_year_student_id_week_starting_key;
CREATE UNIQUE INDEX IF NOT EXISTS fees_year_student_period_start_key ON fees (year, student_id, period, week_starting);
ALTER TABLE settings ADD COLUMN IF NOT EXISTS currency_symbol TEXT NOT NULL DEFAULT '£';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS logo TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS icon TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS fee_frequency TEXT NOT NULL DEFAULT 'weekly';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS report_period TEXT NOT NULL DEFAULT 'monthly';

-- The original madrasah becomes number 1.
INSERT INTO madaaris (id, name, code)
SELECT 1,
       COALESCE((SELECT school_name FROM settings ORDER BY id LIMIT 1), 'Madrasah'),
       COALESCE(NULLIF(trim(BOTH '-' FROM lower(regexp_replace(
         (SELECT school_name FROM settings ORDER BY id LIMIT 1), '[^a-zA-Z0-9]+', '-', 'g'))), ''), 'madrasah')
WHERE NOT EXISTS (SELECT 1 FROM madaaris);
SELECT setval(pg_get_serial_sequence('madaaris', 'id'), (SELECT max(id) FROM madaaris));

-- madrasah_id on every table of school data. Existing rows get 1; the default is
-- then dropped so anything that forgets to say which madrasah fails loudly.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['teachers','classes','students','academic_years','settings','attendance','fees','daily_records','ai_summaries','terms','users'] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS madrasah_id INTEGER NOT NULL DEFAULT 1 REFERENCES madaaris(id)', t);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN madrasah_id DROP DEFAULT', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['teachers','classes','students','attendance','fees','daily_records','ai_summaries','terms'] LOOP
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (madrasah_id)', 'idx_' || t || '_madrasah', t);
  END LOOP;
END $$;

-- Academic years: the same label ("26-27") can exist in every madrasah.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
    WHERE i.indrelid = 'academic_years'::regclass AND i.indisprimary AND a.attname = 'madrasah_id'
  ) THEN
    ALTER TABLE academic_years DROP CONSTRAINT IF EXISTS academic_years_pkey;
    ALTER TABLE academic_years ADD PRIMARY KEY (madrasah_id, year);
  END IF;
END $$;

-- Settings: one row per madrasah (a new madrasah's row uses its own id) instead of a single row 1.
ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_id_check;
CREATE UNIQUE INDEX IF NOT EXISTS settings_madrasah_key ON settings (madrasah_id);
-- Older databases default these to the original madrasah's own name; new ones start neutral.
-- (Only the defaults change — madrasah 1's saved name is untouched.)
ALTER TABLE settings ALTER COLUMN school_name SET DEFAULT 'Madrasah';
ALTER TABLE settings ALTER COLUMN school_name_arabic SET DEFAULT '';

-- Logins: 'login' is a username or an email address, unique within its madrasah.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'email')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'login') THEN
    ALTER TABLE users RENAME COLUMN email TO login;
  END IF;
END $$;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
CREATE UNIQUE INDEX IF NOT EXISTS users_madrasah_login_key ON users (madrasah_id, login);
ALTER TABLE users ADD COLUMN IF NOT EXISTS class_id TEXT UNIQUE REFERENCES classes(id) ON DELETE CASCADE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS platform_admin BOOLEAN NOT NULL DEFAULT false;
-- The original madrasah's owner runs the platform.
UPDATE users SET platform_admin = true
WHERE id = (SELECT id FROM users WHERE role = 'owner' AND madrasah_id = 1 ORDER BY id LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM users WHERE platform_admin);

-- AI requests per madrasah, counted on the platform owner's Madaaris page.
CREATE TABLE IF NOT EXISTS ai_usage (
  id           BIGSERIAL PRIMARY KEY,
  madrasah_id  INTEGER NOT NULL REFERENCES madaaris(id),
  kind         TEXT NOT NULL,   -- 'summary' | 'ask'
  created_at   TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_madrasah_time ON ai_usage (madrasah_id, created_at);

COMMIT;
