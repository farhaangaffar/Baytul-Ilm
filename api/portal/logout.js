const { clearPortalSessionCookie } = require('../_auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  clearPortalSessionCookie(res);
  res.status(200).json({ ok: true });
};
