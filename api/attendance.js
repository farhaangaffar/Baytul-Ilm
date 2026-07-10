const { query } = require('./_db');
const { requireAuth } = require('./_auth');

module.exports = requireAuth(async (req, res) => {
  if (req.method === 'GET') {
    const { year } = req.query;
    if (!year) { res.status(400).json({ error: 'year is required' }); return; }
    const { rows } = await query('SELECT student_id, date, status FROM attendance WHERE year = $1', [year]);
    const out = {};
    rows.forEach(r => {
      if (!out[r.student_id]) out[r.student_id] = {};
      out[r.student_id][r.date] = r.status;
    });
    res.status(200).json(out);
    return;
  }

  if (req.method === 'PUT') {
    const { studentId, date, status, year } = req.body || {};
    if (!studentId || !date || !year) { res.status(400).json({ error: 'studentId, date and year are required' }); return; }
    if (!status) {
      await query('DELETE FROM attendance WHERE year=$1 AND student_id=$2 AND date=$3', [year, studentId, date]);
    } else {
      await query(
        `INSERT INTO attendance (year, student_id, date, status) VALUES ($1,$2,$3,$4)
         ON CONFLICT (year, student_id, date) DO UPDATE SET status = EXCLUDED.status`,
        [year, studentId, date, status]
      );
    }
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
});
