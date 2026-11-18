const { signOutSession } = require('../auth');
const { query } = require('../db');

// Sign out of the place in use on this device — another place it's signed in to (Switch) takes over, if any.
// ?all=1 (or body { all: true }) signs out of every place on this device.
module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const all = req.query.all === '1' || !!(req.body || {}).all;
  const next = await signOutSession(req, res, all);
  // The place that took over — its code, so the device shows its name and logo.
  const m = next ? (await query('SELECT code FROM madaaris WHERE id = $1', [next.madrasahId])).rows[0] : null;
  res.status(200).json({ ok: true, stillSignedIn: !!next, madrasah: m || null });
};
