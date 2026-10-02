const { query } = require('./db');

// Parent portal storage. A parent login is a users row with role 'parent', linked to
// one or more students (their children) in its own madrasah. Parents never pass
// requireAuth (owner/teacher only), so every staff route is closed to them by default;
// they only use server/routes/parent.js, which reads their own children's records.
//
// Created on first use, like the other added tables; db/migrate-013-parents.sql is
// the same for manual setups.

let ready = false;
async function ensureParentTables() {
  if (ready) return;
  // Allow the 'parent' role (only widens what's allowed — no existing row changes).
  await query(`DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'users_role_check' AND pg_get_constraintdef(oid) LIKE '%parent%'
    ) THEN
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
      ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('owner','teacher','parent'));
    END IF;
  END $$`);
  await query(`
    CREATE TABLE IF NOT EXISTS parent_students (
      user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      student_id   TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      madrasah_id  INTEGER NOT NULL REFERENCES madaaris(id),
      PRIMARY KEY (user_id, student_id)
    )
  `);
  // Absences a parent tells the madrasah about; teachers see them on Attendance and
  // mark the register themselves.
  await query(`
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
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS idx_absence_reports_madrasah_date ON absence_reports (madrasah_id, date)');
  await query(`ALTER TABLE settings ADD COLUMN IF NOT EXISTS parent_portal BOOLEAN NOT NULL DEFAULT false`);
  ready = true;
}

// The ids of a parent's own children (current or left) — the only students they may see.
async function childIds(user) {
  await ensureParentTables();
  const { rows } = await query(
    `SELECT ps.student_id FROM parent_students ps JOIN students s ON s.id = ps.student_id
     WHERE ps.user_id = $1 AND ps.madrasah_id = $2 AND s.madrasah_id = $2`,
    [user.id, user.madrasahId]
  );
  return new Set(rows.map(r => r.student_id));
}

async function portalOn(madrasahId) {
  await ensureParentTables();
  const { rows } = await query('SELECT parent_portal FROM settings WHERE madrasah_id = $1', [madrasahId]);
  return !!rows[0]?.parent_portal;
}

const ABSENCE_REASONS = ['Ill', 'Appointment', 'Family', 'Holiday', 'Other'];

module.exports = { ensureParentTables, childIds, portalOn, ABSENCE_REASONS };
