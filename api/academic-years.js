const { query } = require('./_db');
const { requireAuth } = require('./_auth');

// Single flat file, dispatching on ?year= for item ops — Vercel's file-based
// /api routing only reliably supports plain files and single [id] segments
// outside Next.js, not the [[...params]] optional catch-all, so id-style
// operations go through a query string instead of a path segment.
module.exports = requireAuth(async (req, res) => {
  const year = req.query.year;

  if (!year) {
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
    return;
  }

  if (req.method === 'DELETE') {
    const { rows } = await query('SELECT count(*) FROM academic_years');
    if (Number(rows[0].count) <= 1) { res.status(400).json({ error: 'Must have at least one academic year' }); return; }
    await query('DELETE FROM academic_years WHERE year = $1', [year]);
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
});
