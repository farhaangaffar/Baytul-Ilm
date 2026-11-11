-- Pupil logins (a school's Islamic Studies, stage 4). The API does this itself on first use (server/pupils.js
-- ensurePupilTables()); this file is for doing it by hand. Only widens what's allowed — no existing row changes.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_role_check' AND pg_get_constraintdef(oid) LIKE '%pupil%') THEN
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
    ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('owner','teacher','parent','pupil'));
  END IF;
END $$;
ALTER TABLE users ADD COLUMN IF NOT EXISTS student_id TEXT REFERENCES students(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS users_student_key ON users (student_id) WHERE student_id IS NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_logins INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP;
