const { query } = require('../db');
const {
  ensureUsersTable, hashPassword, verifyPassword, timingSafeStringEqual, normalizeEmail,
  validateNewCredentials, setSessionCookie, getUser,
} = require('../auth');

// Sign-in and everything around it, as ?action= variants of one route:
//  (none)           POST {email, password} — normal sign-in. Before an owner account
//                   exists, the school's old shared password (ADMIN_PASSWORD) instead
//                   answers { setupRequired: true } so the owner can create their account.
//  setup            POST {recoveryKey, email, password} — creates the owner account
//                   (only while none exists).
//  recover          POST {recoveryKey, password} — resets a forgotten owner password.
//  change-password  POST {currentPassword, newPassword} — any signed-in user.
// ADMIN_PASSWORD is the recovery key; once the owner account exists it never signs
// anyone in by itself.

function recoveryKeyMatches(key) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  return !!adminPassword && !!key && timingSafeStringEqual(key, adminPassword);
}

async function findOwner() {
  const { rows } = await query(`SELECT * FROM users WHERE role = 'owner' LIMIT 1`);
  return rows[0] || null;
}

function publicUser(u) {
  return { email: u.email, role: u.role };
}

// Spend the same scrypt time when the email isn't registered, so response timing
// doesn't reveal which emails have logins.
const DUMMY_HASH = hashPassword('not-a-real-password');

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!process.env.ADMIN_PASSWORD) { res.status(500).json({ error: 'Server is not configured (no ADMIN_PASSWORD set)' }); return; }
  await ensureUsersTable();
  const b = req.body || {};
  const action = req.query.action;

  if (action === 'setup') {
    if (await findOwner()) { res.status(409).json({ error: 'The owner account has already been set up — sign in instead.' }); return; }
    if (!recoveryKeyMatches(b.recoveryKey)) { res.status(401).json({ error: 'The school password is incorrect.' }); return; }
    const email = normalizeEmail(b.email);
    const problem = validateNewCredentials(email, b.password);
    if (problem) { res.status(400).json({ error: problem }); return; }
    const { rows } = await query(
      `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'owner') RETURNING *`,
      [email, hashPassword(b.password)]
    );
    setSessionCookie(res, rows[0]);
    res.status(200).json({ ok: true, user: publicUser(rows[0]) });
    return;
  }

  if (action === 'recover') {
    const owner = await findOwner();
    if (!owner) { res.status(400).json({ error: 'No owner account exists yet — sign in with the school password to set one up.' }); return; }
    if (!recoveryKeyMatches(b.recoveryKey)) { res.status(401).json({ error: 'The recovery key is incorrect.' }); return; }
    if (String(b.password || '').length < 8) { res.status(400).json({ error: 'Password must be at least 8 characters.' }); return; }
    const { rows } = await query(
      `UPDATE users SET password_hash = $1, session_version = session_version + 1, active = true
       WHERE id = $2 RETURNING *`,
      [hashPassword(b.password), owner.id]
    );
    setSessionCookie(res, rows[0]);
    res.status(200).json({ ok: true, user: publicUser(rows[0]) });
    return;
  }

  if (action === 'change-password') {
    const me = await getUser(req);
    if (!me) { res.status(401).json({ error: 'Not authenticated' }); return; }
    const { rows: [row] } = await query('SELECT * FROM users WHERE id = $1', [me.id]);
    if (!verifyPassword(b.currentPassword, row.password_hash)) { res.status(401).json({ error: 'Your current password is incorrect.' }); return; }
    if (String(b.newPassword || '').length < 8) { res.status(400).json({ error: 'Password must be at least 8 characters.' }); return; }
    const { rows } = await query(
      `UPDATE users SET password_hash = $1, session_version = session_version + 1 WHERE id = $2 RETURNING *`,
      [hashPassword(b.newPassword), me.id]
    );
    setSessionCookie(res, rows[0]); // this device stays signed in; every other device is signed out
    res.status(200).json({ ok: true });
    return;
  }

  if (action) { res.status(404).json({ error: 'Not found' }); return; }

  // Normal sign-in.
  if (!(await findOwner())) {
    if (recoveryKeyMatches(b.password)) { res.status(200).json({ setupRequired: true }); return; }
    res.status(401).json({ error: 'Incorrect password' });
    return;
  }
  const email = normalizeEmail(b.email);
  const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
  const user = rows[0];
  const ok = verifyPassword(b.password || '', user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok || !user.active) {
    res.status(401).json({ error: user && ok && !user.active ? 'This login has been switched off — ask the madrasah office.' : 'Incorrect email or password' });
    return;
  }
  setSessionCookie(res, user);
  res.status(200).json({ ok: true, user: publicUser(user) });
};
