const { query } = require('../../_db');
const { requireSuperAdmin } = require('../../_auth');

module.exports = requireSuperAdmin(async (req, res) => {
  if (req.method !== 'DELETE') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const { id } = req.query;
  await query(`DELETE FROM portal_users WHERE id = $1`, [id]);
  res.status(200).json({ ok: true });
});
