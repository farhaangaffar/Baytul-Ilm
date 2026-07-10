const { query } = require('../_db');
const { requireAuth } = require('../_auth');

module.exports = requireAuth(async (req, res) => {
  if (req.method === 'GET') {
    const { rows } = await query('SELECT year FROM academic_years ORDER BY year');
    res.status(200).json(rows.map(r => r.year));
    return;
  }

  if (req.method === 'POST') {
    const b = req.body || {};
    if (!b.year) { res.status(400).json({ error: 'year is required' }); return; }
    await query('INSERT INTO academic_years (year) VALUES ($1) ON CONFLICT (year) DO NOTHING', [b.year]);
    res.status(201).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
});
