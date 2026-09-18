const { getPortalUser } = require('../_auth');

module.exports = async (req, res) => {
  const user = getPortalUser(req);
  if (!user) { res.status(200).json({ authenticated: false }); return; }
  res.status(200).json({ authenticated: true, role: user.role, masjidId: user.masjidId });
};
