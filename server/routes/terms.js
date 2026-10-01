const { query } = require('../db');
const { requireAuth, isOwner } = require('../auth');

// A madrasah's own term dates for each academic year (Settings → Terms). Used when
// fees are charged termly, and for termly reports. Teachers can read them (the Fees
// page shows terms); only the owner can change them.

let ready = false;
async function ensureTable() {
  if (ready) return;
  await query(`
    CREATE TABLE IF NOT EXISTS terms (
      id          BIGSERIAL PRIMARY KEY,
      year        TEXT NOT NULL,
      name        TEXT NOT NULL,
      start_date  DATE NOT NULL,
      end_date    DATE NOT NULL,
      CHECK (end_date >= start_date)
    )
  `);
  ready = true;
}

function toClient(r) {
  return { id: String(r.id), year: r.year, name: r.name, startDate: r.start_date, endDate: r.end_date };
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
function validate(b, partial) {
  if (!partial || b.name !== undefined) { if (!String(b.name || '').trim()) return 'Give the term a name, e.g. Autumn.'; }
  for (const k of ['startDate', 'endDate']) {
    if ((!partial || b[k] !== undefined) && !ISO.test(String(b[k] || ''))) return 'Choose a start and end date.';
  }
  if (b.startDate && b.endDate && b.endDate < b.startDate) return 'The term must end after it starts.';
  return null;
}

module.exports = requireAuth(async (req, res) => {
  await ensureTable();
  const id = req.query.id;
  if (!isOwner(req) && (req.method !== 'GET' || id)) { res.status(403).json({ error: "You don't have access to this." }); return; }

  if (!id) {
    if (req.method === 'GET') {
      const { year } = req.query;
      const { rows } = year
        ? await query('SELECT * FROM terms WHERE year = $1 ORDER BY start_date', [year])
        : await query('SELECT * FROM terms ORDER BY start_date');
      res.status(200).json(rows.map(toClient));
      return;
    }
    if (req.method === 'POST') {
      const b = req.body || {};
      if (!b.year) { res.status(400).json({ error: 'year is required' }); return; }
      const problem = validate(b, false);
      if (problem) { res.status(400).json({ error: problem }); return; }
      const { rows } = await query(
        'INSERT INTO terms (year, name, start_date, end_date) VALUES ($1,$2,$3,$4) RETURNING *',
        [b.year, String(b.name).trim(), b.startDate, b.endDate]
      );
      res.status(201).json(toClient(rows[0]));
      return;
    }
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (req.method === 'PATCH') {
    const b = req.body || {};
    const { rows: found } = await query('SELECT * FROM terms WHERE id = $1', [id]);
    if (!found.length) { res.status(404).json({ error: 'Term not found' }); return; }
    const merged = {
      name: b.name ?? found[0].name,
      startDate: b.startDate ?? found[0].start_date,
      endDate: b.endDate ?? found[0].end_date,
    };
    const problem = validate(merged, false);
    if (problem) { res.status(400).json({ error: problem }); return; }
    const { rows } = await query(
      'UPDATE terms SET name = $1, start_date = $2, end_date = $3 WHERE id = $4 RETURNING *',
      [String(merged.name).trim(), merged.startDate, merged.endDate, id]
    );
    res.status(200).json(toClient(rows[0]));
    return;
  }

  if (req.method === 'DELETE') {
    await query('DELETE FROM terms WHERE id = $1', [id]);
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}, { teacher: true });
