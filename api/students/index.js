const { query } = require('../_db');
const { requireAuth } = require('../_auth');

function toClient(row) {
  return {
    id: row.id,
    forename: row.forename,
    surname: row.surname,
    dob: row.dob,
    class: row.class,
    parent1Name: row.parent1_name,
    parent1Phone: row.parent1_phone,
    parent2Name: row.parent2_name,
    parent2Phone: row.parent2_phone,
    weeklyFee: Number(row.weekly_fee),
    enrollDate: row.enroll_date,
    status: row.status,
    notes: row.notes,
  };
}

module.exports = requireAuth(async (req, res) => {
  if (req.method === 'GET') {
    const { rows } = await query('SELECT * FROM students ORDER BY forename, surname');
    res.status(200).json(rows.map(toClient));
    return;
  }

  if (req.method === 'POST') {
    const b = req.body || {};
    if (!b.forename || !b.surname || !b.class) { res.status(400).json({ error: 'forename, surname and class are required' }); return; }
    const id = 'S' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const { rows } = await query(
      `INSERT INTO students (id, forename, surname, dob, class, parent1_name, parent1_phone, parent2_name, parent2_phone, weekly_fee, enroll_date, status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [id, b.forename, b.surname, b.dob || null, b.class,
       b.parent1Name || '', b.parent1Phone || '', b.parent2Name || '', b.parent2Phone || '',
       b.weeklyFee ?? 15, b.enrollDate || null, b.status || 'Active', b.notes || '']
    );
    res.status(201).json(toClient(rows[0]));
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
});
