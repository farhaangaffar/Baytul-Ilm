-- Parent portal. New tables, one new Settings column, and the 'parent' role allowed on
-- logins — nothing existing changes. The API does this itself on first use
-- (server/parents.js); this file is for manual setups. Needs db/migrate-011-madaaris.sql.

-- Allow parent logins.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('owner','teacher','parent'));

-- Which children each family login covers.
CREATE TABLE IF NOT EXISTS parent_students (
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id   TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  madrasah_id  INTEGER NOT NULL REFERENCES madaaris(id),
  PRIMARY KEY (user_id, student_id)
);

-- Absences a parent tells the madrasah about (shown to teachers on Attendance).
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

-- Each madrasah switches the parent portal on in Settings.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS parent_portal BOOLEAN NOT NULL DEFAULT false;
