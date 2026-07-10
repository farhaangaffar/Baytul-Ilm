const { query } = require('./_db');
const { requireAuth } = require('./_auth');

module.exports = requireAuth(async (req, res) => {
  if (req.method === 'GET') {
    const { studentId } = req.query;
    if (studentId) {
      const { rows } = await query('SELECT date, comment, positive, negative FROM daily_records WHERE student_id = $1', [studentId]);
      const out = {};
      rows.forEach(r => { out[r.date] = { comment: r.comment, positive: r.positive, negative: r.negative }; });
      res.status(200).json(out);
      return;
    }
    const { rows } = await query('SELECT student_id, date, comment, positive, negative FROM daily_records');
    const out = {};
    rows.forEach(r => {
      if (!out[r.student_id]) out[r.student_id] = {};
      out[r.student_id][r.date] = { comment: r.comment, positive: r.positive, negative: r.negative };
    });
    res.status(200).json(out);
    return;
  }

  if (req.method === 'PUT') {
    const { studentId, date, comment, positive, negative } = req.body || {};
    if (!studentId || !date) { res.status(400).json({ error: 'studentId and date are required' }); return; }
    // Fields omitted from the body come through as null here, so a fresh INSERT falls back
    // to '' (satisfying the NOT NULL columns) while an UPDATE preserves the existing value.
    await query(
      `INSERT INTO daily_records (student_id, date, comment, positive, negative)
       VALUES ($1, $2, COALESCE($3,''), COALESCE($4,''), COALESCE($5,''))
       ON CONFLICT (student_id, date) DO UPDATE SET
         comment = COALESCE($3, daily_records.comment),
         positive = COALESCE($4, daily_records.positive),
         negative = COALESCE($5, daily_records.negative)`,
      [studentId, date, comment ?? null, positive ?? null, negative ?? null]
    );
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'DELETE') {
    const { studentId, date } = req.body || {};
    if (!studentId || !date) { res.status(400).json({ error: 'studentId and date are required' }); return; }
    await query('DELETE FROM daily_records WHERE student_id = $1 AND date = $2', [studentId, date]);
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
});
