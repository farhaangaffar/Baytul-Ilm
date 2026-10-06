const { query } = require('../db');
const { requireAuth, isOwner } = require('../auth');

// Days the madrasah is closed (Eid, a snow day, a teacher training day…), set by the head in
// Settings → Days off. Attendance shows them as closed instead of asking for a register.
//   GET                      → [{ date, name }] (head and teachers)
//   POST { date, name }      → add or rename one (head only)
//   DELETE ?date=YYYY-MM-DD  → remove one (head only)
let ready = false;
async function ensureTable() {
  if (ready) return;
  await query(`CREATE TABLE IF NOT EXISTS days_off (
    madrasah_id  INTEGER NOT NULL REFERENCES madaaris(id),
    date         DATE NOT NULL,
    name         TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (madrasah_id, date)
  )`);
  ready = true;
}
const ISO = /^\d{4}-\d{2}-\d{2}$/;

module.exports = requireAuth(async (req, res) => {
  await ensureTable();
  const mid = req.user.madrasahId;
  if (req.method === 'GET') {
    const { rows } = await query('SELECT date, name FROM days_off WHERE madrasah_id = $1 ORDER BY date', [mid]);
    res.status(200).json(rows);
    return;
  }
  if (!isOwner(req)) { res.status(403).json({ error: "You don't have access to this." }); return; }
  if (req.method === 'POST') {
    const { date, name } = req.body || {};
    if (!ISO.test(String(date || ''))) { res.status(400).json({ error: 'Choose a date' }); return; }
    const label = String(name || '').trim().slice(0, 60) || 'Closed';
    await query(`INSERT INTO days_off (madrasah_id, date, name) VALUES ($1, $2, $3)
                 ON CONFLICT (madrasah_id, date) DO UPDATE SET name = EXCLUDED.name`, [mid, date, label]);
    res.status(200).json({ ok: true, date, name: label });
    return;
  }
  if (req.method === 'DELETE') {
    const date = String(req.query.date || '');
    if (!ISO.test(date)) { res.status(400).json({ error: 'date is required' }); return; }
    await query('DELETE FROM days_off WHERE madrasah_id = $1 AND date = $2', [mid, date]);
    res.status(200).json({ ok: true });
    return;
  }
  res.status(405).json({ error: 'Method not allowed' });
}, { teacher: true });

module.exports.ensure = ensureTable;
