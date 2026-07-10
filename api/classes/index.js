const { query } = require('../_db');
const { requireAuth } = require('../_auth');

module.exports = requireAuth(async (req, res) => {
  if (req.method === 'GET') {
    const { rows } = await query('SELECT id, name, teacher_id AS "teacherId" FROM classes ORDER BY name');
    res.status(200).json(rows);
    return;
  }

  if (req.method === 'POST') {
    const b = req.body || {};
    if (!b.name) { res.status(400).json({ error: 'name is required' }); return; }
    const id = 'C' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const { rows } = await query(
      'INSERT INTO classes (id, name, teacher_id) VALUES ($1,$2,$3) RETURNING id, name, teacher_id AS "teacherId"',
      [id, b.name, b.teacherId || null]
    );
    res.status(201).json(rows[0]);
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
});
