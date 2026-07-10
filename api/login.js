const crypto = require('crypto');
const { setSessionCookie } = require('./_auth');

function timingSafeStringEqual(a, b) {
  const aBuf = Buffer.from(String(a));
  const bBuf = Buffer.from(String(b));
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) { res.status(500).json({ error: 'Server is not configured (no ADMIN_PASSWORD set)' }); return; }
  const { password } = req.body || {};
  if (!password || !timingSafeStringEqual(password, adminPassword)) {
    res.status(401).json({ error: 'Incorrect password' });
    return;
  }
  setSessionCookie(res);
  res.status(200).json({ ok: true });
};
