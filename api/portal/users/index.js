const crypto = require('crypto');
const { query } = require('../../_db');
const { hashPassword } = require('../../_password');
const { requireSuperAdmin } = require('../../_auth');

function genId() { return crypto.randomBytes(8).toString('hex'); }

// Super-admin-only: lets our team see and create portal login accounts —
// including handing a masjid its own masjid_admin login for the portal.
module.exports = requireSuperAdmin(async (req, res) => {
  if (req.method === 'GET') {
    const { rows } = await query(
      `SELECT id, masjid_id AS "masjidId", role, email, created_at AS "createdAt" FROM portal_users ORDER BY created_at DESC`
    );
    res.status(200).json(rows);
    return;
  }

  if (req.method === 'POST') {
    const { masjidId, role, email, password } = req.body || {};
    if (!email || !password || !role) { res.status(400).json({ error: 'email, password and role are required' }); return; }
    if (!['masjid_admin', 'super_admin'].includes(role)) { res.status(400).json({ error: 'Invalid role' }); return; }
    if (role === 'masjid_admin' && !masjidId) { res.status(400).json({ error: 'masjidId is required for a masjid_admin' }); return; }
    const id = genId();
    try {
      await query(
        `INSERT INTO portal_users (id, masjid_id, role, email, password_hash) VALUES ($1,$2,$3,$4,$5)`,
        [id, role === 'masjid_admin' ? masjidId : null, role, email, hashPassword(password)]
      );
    } catch (err) {
      if (err.code === '23505') { res.status(409).json({ error: 'That email is already in use' }); return; }
      throw err;
    }
    res.status(201).json({ id });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
});
