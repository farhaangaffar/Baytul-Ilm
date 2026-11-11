const { query } = require('./db');

// Pupil logins (a school's Islamic Studies, stage 4). A pupil login is a users row with role 'pupil', linked to one
// pupil (users.student_id, one login each). The school gives each pupil their username and password; the head (Head of
// Islamic Studies) types them in or imports a class from a spreadsheet (server/routes/pupil-logins.js). Pupils never
// pass requireAuth (owner/teacher only), so every staff route is closed to them; they only use server/routes/pupil.js,
// which reads their own homework and marks. A pupil who has left can't sign in. After too many wrong passwords a
// pupil login rests for a while (users.failed_logins / locked_until, server/routes/login.js).
//
// Created on first use; db/migrate-043-pupil-logins.sql is the same for manual setups.

let ready = false;
async function ensurePupilTables() {
  if (ready) return;
  await require('./parents').ensureParentTables(); // the 'parent' role first, so the constraint below keeps it
  // Allow the 'pupil' role (only widens what's allowed — no existing row changes).
  await query(`DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'users_role_check' AND pg_get_constraintdef(oid) LIKE '%pupil%'
    ) THEN
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
      ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('owner','teacher','parent','pupil'));
    END IF;
  END $$`);
  await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS student_id TEXT REFERENCES students(id) ON DELETE CASCADE');
  await query('CREATE UNIQUE INDEX IF NOT EXISTS users_student_key ON users (student_id) WHERE student_id IS NOT NULL');
  await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP');
  await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_logins INTEGER NOT NULL DEFAULT 0');
  await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP');
  ready = true;
}

// After this many wrong passwords in a row, a pupil login rests for LOCK_MINUTES.
const MAX_TRIES = 10;
const LOCK_MINUTES = 15;

module.exports = { ensurePupilTables, MAX_TRIES, LOCK_MINUTES };
