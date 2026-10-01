const { query } = require('../db');
const {
  ensureUsersTable, hashPassword, verifyPassword, timingSafeStringEqual, normalizeLogin,
  validateNewCredentials, setSessionCookie, getUser,
} = require('../auth');

// Sign-in and everything around it, as ?action= variants of one route:
//  (none)           POST {code?, login, password} — normal sign-in. code is the
//                   madrasah's code (remembered on each device after the first sign-in);
//                   without it, the username/password pair must match exactly one login
//                   across all madaaris. Before any owner account exists, the old shared
//                   password (ADMIN_PASSWORD) instead answers { setupRequired: true } so the
//                   first owner can create their account.
//  setup            POST {recoveryKey, login, password} — creates the first owner (madrasah 1,
//                   and the platform owner) — only while no owner exists.
//  recover          POST {recoveryKey, password} — resets a forgotten platform-owner password.
//                   (Other madaaris' heads are reset by the platform owner.)
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

async function findPlatformOwner() {
  const { rows } = await query(`SELECT * FROM users WHERE platform_admin ORDER BY id LIMIT 1`);
  return rows[0] || null;
}

async function madrasahOf(u) {
  const { rows } = await query('SELECT code, name, active FROM madaaris WHERE id = $1', [u.madrasah_id]);
  return rows[0];
}

function publicUser(u) {
  return { login: u.login, role: u.role };
}

// Spend the same scrypt time when the username isn't registered, so response timing
// doesn't reveal which usernames have logins.
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
    const login = normalizeLogin(b.login ?? b.email);
    const problem = validateNewCredentials(login, b.password);
    if (problem) { res.status(400).json({ error: problem }); return; }
    const { rows } = await query(
      `INSERT INTO users (madrasah_id, login, password_hash, role, platform_admin) VALUES (1, $1, $2, 'owner', true) RETURNING *`,
      [login, hashPassword(b.password)]
    );
    setSessionCookie(res, rows[0]);
    res.status(200).json({ ok: true, user: publicUser(rows[0]), madrasah: await madrasahOf(rows[0]) });
    return;
  }

  if (action === 'recover') {
    const owner = await findPlatformOwner();
    if (!owner) { res.status(400).json({ error: 'No owner account exists yet — sign in with the school password to set one up.' }); return; }
    if (!recoveryKeyMatches(b.recoveryKey)) { res.status(401).json({ error: 'The recovery key is incorrect.' }); return; }
    if (String(b.password || '').length < 8) { res.status(400).json({ error: 'Password must be at least 8 characters.' }); return; }
    const { rows } = await query(
      `UPDATE users SET password_hash = $1, session_version = session_version + 1, active = true
       WHERE id = $2 RETURNING *`,
      [hashPassword(b.password), owner.id]
    );
    setSessionCookie(res, rows[0]);
    res.status(200).json({ ok: true, user: publicUser(rows[0]), madrasah: await madrasahOf(rows[0]) });
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
  const login = normalizeLogin(b.login ?? b.email);
  const code = String(b.code || '').trim().toLowerCase();
  const { rows: candidates } = code
    ? await query('SELECT u.* FROM users u JOIN madaaris m ON m.id = u.madrasah_id WHERE lower(m.code) = $1 AND u.login = $2', [code, login])
    : await query('SELECT * FROM users WHERE login = $1', [login]);
  // Same username in more than one madrasah: whichever one the password belongs to.
  const matches = candidates.filter(u => verifyPassword(b.password || '', u.password_hash));
  if (!candidates.length) verifyPassword(b.password || '', DUMMY_HASH);
  if (matches.length > 1) {
    res.status(400).json({ error: 'Please enter your madrasah code as well — ask the madrasah office if you don\'t know it.', needCode: true });
    return;
  }
  const user = matches[0];
  if (!user) {
    res.status(401).json({ error: code ? 'Incorrect madrasah code, username or password' : 'Incorrect username or password' });
    return;
  }
  const madrasah = await madrasahOf(user);
  if (!user.active) { res.status(401).json({ error: 'This login has been switched off — ask the madrasah office.' }); return; }
  if (!madrasah.active && !user.platform_admin) { res.status(401).json({ error: "This madrasah's access has been switched off." }); return; }
  setSessionCookie(res, user);
  res.status(200).json({ ok: true, user: publicUser(user), madrasah: { code: madrasah.code, name: madrasah.name } });
};
