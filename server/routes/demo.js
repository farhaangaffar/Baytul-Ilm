const crypto = require('crypto');
const { query } = require('../db');
const { getUser, setSessionCookie } = require('../auth');
const { ensureAllTables, clearExpired, tooMany, createDemo } = require('../demo');

// "Try the demo": POST {role: 'head' | 'teacher' | 'parent'} signs the visitor in to a
// private demo madrasah as that person (server/demo.js). Someone already in a demo
// just switches person within it; anyone else gets a fresh one. No password involved —
// demo logins can't be signed in to any other way.

const ROLE_SQL = {
  head: `role = 'owner'`,
  teacher: `role = 'teacher'`,
  parent: `role = 'parent'`,
};

// Who's starting demos, only to limit how many one address starts — kept as a hash.
function ipHash(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  return crypto.createHmac('sha256', process.env.SESSION_SECRET || 'demo').update(ip).digest('hex').slice(0, 16);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const role = (req.body || {}).role;
  if (!ROLE_SQL[role]) { res.status(400).json({ error: 'Choose head, teacher or parent.' }); return; }
  await ensureAllTables();

  const me = await getUser(req);
  let mid = me && me.demo ? me.madrasahId : null;
  if (!mid) {
    // Demos are only offered once the site is set up (its first owner exists).
    const { rows: real } = await query(
      `SELECT 1 FROM users u JOIN madaaris m ON m.id = u.madrasah_id WHERE u.role = 'owner' AND m.demo_until IS NULL LIMIT 1`);
    if (!real.length) { res.status(400).json({ error: 'The demo is not available yet.' }); return; }
    await clearExpired();
    const hash = ipHash(req);
    const busy = await tooMany(hash);
    if (busy) { res.status(429).json({ error: busy }); return; }
    mid = await createDemo(hash);
  }

  const { rows } = await query(`SELECT * FROM users WHERE madrasah_id = $1 AND ${ROLE_SQL[role]} AND active ORDER BY id LIMIT 1`, [mid]);
  if (!rows.length) { res.status(404).json({ error: 'That demo login has been removed — leave the demo and start a new one.' }); return; }
  setSessionCookie(res, rows[0]);
  res.status(200).json({ ok: true });
};
