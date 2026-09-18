const crypto = require('crypto');
const { query } = require('../_db');
const { verifyPassword } = require('../_password');
const { setPortalSessionCookie } = require('../_auth');

function timingSafeStringEqual(a, b) {
  const aBuf = Buffer.from(String(a));
  const bBuf = Buffer.from(String(b));
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const { email, password } = req.body || {};
  if (!email || !password) { res.status(400).json({ error: 'Email and password are required' }); return; }

  // Bootstraps the first super_admin from env vars, the same shared-secret pattern
  // /api/login already uses for the madrasah side — avoids a chicken-and-egg problem
  // where creating a super_admin account requires one to already exist.
  const superEmail = process.env.SUPER_ADMIN_EMAIL;
  const superPassword = process.env.SUPER_ADMIN_PASSWORD;
  if (superEmail && superPassword && email.toLowerCase() === superEmail.toLowerCase() && timingSafeStringEqual(password, superPassword)) {
    setPortalSessionCookie(res, { id: 'super-admin', role: 'super_admin', masjidId: null });
    res.status(200).json({ ok: true, role: 'super_admin', masjidId: null });
    return;
  }

  const { rows } = await query(
    `SELECT id, masjid_id AS "masjidId", role, password_hash AS "passwordHash" FROM portal_users WHERE lower(email) = lower($1)`,
    [email]
  );
  const user = rows[0];
  if (!user || !verifyPassword(password, user.passwordHash)) {
    res.status(401).json({ error: 'Incorrect email or password' });
    return;
  }
  setPortalSessionCookie(res, { id: user.id, role: user.role, masjidId: user.masjidId });
  res.status(200).json({ ok: true, role: user.role, masjidId: user.masjidId });
};
