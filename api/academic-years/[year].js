const { query } = require('../_db');
const { requireAuth } = require('../_auth');

module.exports = requireAuth(async (req, res) => {
  const { year } = req.query;

  if (req.method === 'DELETE') {
    const { rows } = await query('SELECT count(*) FROM academic_years');
    if (Number(rows[0].count) <= 1) { res.status(400).json({ error: 'Must have at least one academic year' }); return; }
    await query('DELETE FROM academic_years WHERE year = $1', [year]);
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
});
