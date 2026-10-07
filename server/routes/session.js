const { query } = require('../db');
const { ensureUsersTable, getUser, teacherClassNames } = require('../auth');

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
  const { rows: [m] } = await query('SELECT code, name, terms_version FROM madaaris WHERE id = $1', [user.madrasahId]);
  // Heads agree to the terms once per version; not the platform owner (they wrote them) or a demo.
  const termsNeeded = user.role === 'owner' && !user.platformAdmin && !user.demo && m.terms_version !== TERMS_VERSION;
  res.status(200).json({
    authenticated: true, setupRequired,
    user: {
      login: user.login, role: user.role, teacherId: user.teacherId, classId: user.classId, classNames,
      platformAdmin: user.platformAdmin, demo: user.demo, madrasah: { code: m.code, name: m.name }, termsNeeded,
    },
  });
};
