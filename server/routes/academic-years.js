const { query } = require('../db');
const { requireAuth, isOwner } = require('../auth');

// Single flat file, dispatching on ?year= for item ops — Vercel's file-based
// /api routing only reliably supports plain files and single [id] segments
// outside Next.js, not the [[...params]] optional catch-all, so id-style
// operations go through a query string instead of a path segment.
// Each madrasah has its own list of years (the same label can exist in several).
// "26-27" for any date from 1 Sep 2026 to 31 Aug 2027.
function yearLabelFor(d) {
  const start = d.getUTCMonth() >= 8 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return `${String(start).slice(2)}-${String(start + 1).slice(2)}`;
}

module.exports = requireAuth(async (req, res) => {
  const mid = req.user.madrasahId;
  // Teachers can read the list of years (for the year switcher), nothing more.
  if (!isOwner(req) && (req.method !== 'GET' || req.query.action || req.query.year)) {
    res.status(403).json({ error: "You don't have access to this." }); return;
  }

  if (req.query.action === 'rename') {
    // Relabels a year everywhere it's referenced — attendance/fees/terms just store
    // the year as plain text (no FK), so they all need updating together or records
    // under the old label would silently stop showing up.
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
    const { from, to } = req.body || {};
    if (!from || !to) { res.status(400).json({ error: 'from and to are required' }); return; }
    for (const table of ['academic_years', 'attendance', 'fees', 'terms']) {
      await query(`UPDATE ${table} SET year = $2 WHERE year = $1 AND madrasah_id = $3`, [from, to, mid]);
    }
    res.status(200).json({ ok: true });
    return;
  }

  const year = req.query.year;

  if (!year) {
    if (req.method === 'GET') {
      // The current school year adds itself from 1 September — nobody has to remember —
      // written the way this madrasah writes its years ("26-27", or "2026-27").
      const label = yearLabelFor(new Date());
      const long = `20${label}`;
      const { rows: have } = await query('SELECT year FROM academic_years WHERE madrasah_id = $1', [mid]);
      if (!have.some(r => r.year === label || r.year === long)) {
        const longStyle = have.length && have.every(r => /^\d{4}-\d{2}$/.test(r.year));
        await query('INSERT INTO academic_years (madrasah_id, year) VALUES ($1, $2) ON CONFLICT (madrasah_id, year) DO NOTHING', [mid, longStyle ? long : label]);
      }
      const { rows } = await query('SELECT year FROM academic_years WHERE madrasah_id = $1 ORDER BY year', [mid]);
      res.status(200).json(rows.map(r => r.year));
      return;
    }

    if (req.method === 'POST') {
      const b = req.body || {};
      if (!b.year) { res.status(400).json({ error: 'year is required' }); return; }
      await query('INSERT INTO academic_years (madrasah_id, year) VALUES ($1, $2) ON CONFLICT (madrasah_id, year) DO NOTHING', [mid, b.year]);
      res.status(201).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (req.method === 'DELETE') {
    const { rows } = await query('SELECT count(*) FROM academic_years WHERE madrasah_id = $1', [mid]);
    if (Number(rows[0].count) <= 1) { res.status(400).json({ error: 'Must have at least one academic year' }); return; }
    await query('DELETE FROM academic_years WHERE year = $1 AND madrasah_id = $2', [year, mid]);
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}, { teacher: true });
