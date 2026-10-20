const { query } = require('../db');
const { ensureUsersTable, getUser, teacherClassNames, teachingClassNames } = require('../auth');
const { ensureSignupColumns } = require('../newMadrasah');

// Who is signed in (and, for a teacher or class login, which classes they can see),
// which madrasah they belong to, plus whether the first owner account still needs
// creating so the login screen can say so.
// The terms version heads must have agreed to (TERMS_VERSION in src/lib/legal.js).
const TERMS_VERSION = '2026-10';
let termsReady = false;
async function ensureTermsColumns() {
  if (termsReady) return;
  await query('ALTER TABLE madaaris ADD COLUMN IF NOT EXISTS terms_version TEXT');
  await query('ALTER TABLE madaaris ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP');
  await query('ALTER TABLE madaaris ADD COLUMN IF NOT EXISTS terms_accepted_by TEXT');
  termsReady = true;
}

module.exports = async (req, res) => {
  await ensureUsersTable();
  await ensureTermsColumns();
  await ensureSignupColumns(); // madaaris.kind
  const user = await getUser(req);

  // POST ?action=accept-terms — the head agrees to the terms for their madrasah.
  if (req.query.action === 'accept-terms') {
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
    if (!user || user.role !== 'owner') { res.status(403).json({ error: "You don't have access to this." }); return; }
    await query('UPDATE madaaris SET terms_version = $1, terms_accepted_at = now(), terms_accepted_by = $2 WHERE id = $3',
      [TERMS_VERSION, user.login, user.madrasahId]);
    res.status(200).json({ ok: true });
    return;
  }

  const { rows } = await query(`SELECT 1 FROM users WHERE role = 'owner' LIMIT 1`);
  const setupRequired = rows.length === 0;
  if (!user) { res.status(200).json({ authenticated: false, setupRequired }); return; }
  const classNames = user.role === 'teacher' ? await teacherClassNames(user) : null;
  const { rows: [m] } = await query('SELECT code, name, kind, terms_version FROM madaaris WHERE id = $1', [user.madrasahId]);
  // Heads agree to the terms once per version; not the platform owner (they wrote them) or a demo.
  // A Darul Uloom teacher on boarding duty also gets the Boarding page; one on maintenance, the Maintenance page.
  let boardingDuty = false, maintenanceDuty = false, maintenanceOnly = false;
  if (user.role === 'teacher' && user.teacherId && m.kind === 'darul_uloom') {
    await require('./teachers').ensure();
    const { rows: t } = await query('SELECT boarding_duty, maintenance_duty FROM teachers WHERE id = $1 AND madrasah_id = $2', [user.teacherId, user.madrasahId]);
    boardingDuty = !!t[0]?.boarding_duty;
    maintenanceDuty = !!t[0]?.maintenance_duty;
    // Staff who are only on maintenance (no class, no lessons) open on the Maintenance page and don't see the teaching pages.
    if (maintenanceDuty && !classNames.length) maintenanceOnly = !(await teachingClassNames(user)).length;
  }
  const termsNeeded = user.role === 'owner' && !user.platformAdmin && !user.demo && m.terms_version !== TERMS_VERSION;
  res.status(200).json({
    authenticated: true, setupRequired,
    user: {
      login: user.login, role: user.role, teacherId: user.teacherId, classId: user.classId, classNames,
      platformAdmin: user.platformAdmin, demo: user.demo, madrasah: { code: m.code, name: m.name, kind: m.kind }, termsNeeded, boardingDuty, maintenanceDuty, maintenanceOnly,
    },
  });
};

module.exports.TERMS_VERSION = TERMS_VERSION; // routes/signup.js records it when a madrasah signs itself up
