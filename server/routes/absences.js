const { query } = require('../db');
const { requireAuth, accessScope } = require('../auth');
const { ensureParentTables } = require('../parents');

// Absences parents have reported through the parent portal, for staff: shown on the
// Attendance page so the teacher knows before marking the register (they still mark
// it themselves). Teachers see their own classes' only.
//   GET ?from=YYYY-MM-DD  → reports for that date onwards (default: today)
//   PATCH ?id=            → mark one as seen
module.exports = requireAuth(async (req, res) => {
  await ensureParentTables();
  const mid = req.user.madrasahId;
  const scope = await accessScope(req);

  if (req.method === 'GET') {
    const from = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.from || '')) ? req.query.from : new Date().toISOString().slice(0, 10);
    const { rows } = await query(
      'SELECT id, student_id, date, reason, note, seen, created_at FROM absence_reports WHERE madrasah_id = $1 AND date >= $2 ORDER BY date, created_at',
      [mid, from]
    );
    res.status(200).json(rows.filter(r => scope.studentIds.has(r.student_id)).map(r => ({
      id: String(r.id), studentId: r.student_id, date: r.date, reason: r.reason, note: r.note, seen: r.seen, reportedAt: r.created_at,
    })));
    return;
  }

  if (req.method === 'PATCH' && req.query.id) {
    const { rows } = await query('SELECT student_id FROM absence_reports WHERE id = $1 AND madrasah_id = $2', [req.query.id, mid]);
    if (!rows.length || !scope.studentIds.has(rows[0].student_id)) { res.status(404).json({ error: 'Not found' }); return; }
    await query('UPDATE absence_reports SET seen = true WHERE id = $1 AND madrasah_id = $2', [req.query.id, mid]);
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}, { teacher: true });
