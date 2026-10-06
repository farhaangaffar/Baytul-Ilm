const { query } = require('../db');
const { requireAuth, isOwner } = require('../auth');

// Days the madrasah is closed (Eid, a snow day, a teacher training day…) — kind 'off' — and
// extra days it opens outside its normal school days (a Saturday in Ramadhaan) — kind
// 'extra' — set by the head in Settings → Days off & extra days. Attendance shows closed days
// as closed, and asks for a register on extra days.
//   GET                          → [{ date, name, kind }] (head and teachers)
//   POST { date, to?, name, kind } → add or change one, or a range date..to (head only) — a
//                                    closed range is every day; an open range only the days that
//                                    aren't already school days (e.g. the weekends of Ramadhaan)
//   DELETE ?date=YYYY-MM-DD[&to=…][&kind=…] → remove one, or that kind's days in a range (head only)
let ready = false;
async function ensureTable() {
  if (ready) return;
  await query(`CREATE TABLE IF NOT EXISTS days_off (
    madrasah_id  INTEGER NOT NULL REFERENCES madaaris(id),
    date         DATE NOT NULL,
    name         TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (madrasah_id, date)
  )`);
  await query(`ALTER TABLE days_off ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'off'`);
  ready = true;
}
const ISO = /^\d{4}-\d{2}-\d{2}$/;
// Every date from `from` to `to` (inclusive), at most 92 days; [from] when there's no valid `to`.
function datesBetween(from, to) {
  if (!ISO.test(String(to || '')) || to <= from) return [from];
  const out = [];
  for (let d = new Date(from + 'T12:00:00Z'); out.length < 92; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    if (iso > to) break;
    out.push(iso);
  }
  return out;
}

module.exports = requireAuth(async (req, res) => {
  await ensureTable();
  const mid = req.user.madrasahId;
  if (req.method === 'GET') {
    const { rows } = await query('SELECT date, name, kind FROM days_off WHERE madrasah_id = $1 ORDER BY date', [mid]);
    res.status(200).json(rows);
    return;
  }
  if (!isOwner(req)) { res.status(403).json({ error: "You don't have access to this." }); return; }
  if (req.method === 'POST') {
    const { date, name } = req.body || {};
    const kind = req.body?.kind === 'extra' ? 'extra' : 'off';
    if (!ISO.test(String(date || ''))) { res.status(400).json({ error: 'Choose a date' }); return; }
    const label = String(name || '').trim().slice(0, 60) || (kind === 'extra' ? 'Extra day' : 'Closed');
    let dates = datesBetween(date, req.body?.to);
    if (kind === 'extra' && dates.length > 1) {
      const { rows } = await query('SELECT school_days FROM settings WHERE madrasah_id = $1', [mid]);
      const usual = rows[0]?.school_days || [1, 2, 3, 4];
      dates = dates.filter(d => !usual.includes(new Date(d + 'T12:00:00Z').getUTCDay()));
      if (!dates.length) { res.status(400).json({ error: 'Those are already school days' }); return; }
    }
    await query(`INSERT INTO days_off (madrasah_id, date, name, kind)
                 SELECT $1, d::date, $3, $4 FROM unnest($2::text[]) AS d
                 ON CONFLICT (madrasah_id, date) DO UPDATE SET name = EXCLUDED.name, kind = EXCLUDED.kind`, [mid, dates, label, kind]);
    res.status(200).json({ ok: true, date, dates, name: label, kind });
    return;
  }
  if (req.method === 'DELETE') {
    const date = String(req.query.date || '');
    if (!ISO.test(date)) { res.status(400).json({ error: 'date is required' }); return; }
    const kind = ['off', 'extra'].includes(req.query.kind) ? req.query.kind : null;
    await query('DELETE FROM days_off WHERE madrasah_id = $1 AND date = ANY($2::date[]) AND ($3::text IS NULL OR kind = $3)',
      [mid, datesBetween(date, String(req.query.to || '')), kind]);
    res.status(200).json({ ok: true });
    return;
  }
  res.status(405).json({ error: 'Method not allowed' });
}, { teacher: true });

module.exports.ensure = ensureTable;
