const { query } = require('../_db');
const { requireAuth } = require('../_auth');

function toClient(row) {
  return {
    id: String(row.id),
    studentId: row.student_id,
    weekStarting: row.week_starting,
    amount: Number(row.amount),
    status: row.status,
    paidDate: row.paid_date,
  };
}

module.exports = requireAuth(async (req, res) => {
  if (req.method === 'GET') {
    const { year } = req.query;
    if (!year) { res.status(400).json({ error: 'year is required' }); return; }
    const { rows } = await query('SELECT * FROM fees WHERE year = $1', [year]);
    res.status(200).json(rows.map(toClient));
    return;
  }

  if (req.method === 'POST') {
    const b = req.body || {};
    if (!b.studentId || !b.weekStarting || !b.year) { res.status(400).json({ error: 'studentId, weekStarting and year are required' }); return; }
    const { rows } = await query(
      `INSERT INTO fees (year, student_id, week_starting, amount, status) VALUES ($1,$2,$3,$4,'Pending')
       ON CONFLICT (year, student_id, week_starting) DO NOTHING RETURNING *`,
      [b.year, b.studentId, b.weekStarting, b.amount ?? 15]
    );
    if (!rows.length) { res.status(200).json({ ok: true, created: false }); return; }
    res.status(201).json(toClient(rows[0]));
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
});
