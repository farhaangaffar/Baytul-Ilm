const { query } = require('../_db');
const { requireAuth } = require('../_auth');

module.exports = requireAuth(async (req, res) => {
  const params = req.query.params || [];
  const id = params[0];

  if (!id) {
    if (req.method === 'GET') {
      const { rows } = await query('SELECT id, name, teacher_id AS "teacherId" FROM classes ORDER BY name');
      res.status(200).json(rows);
      return;
    }

    if (req.method === 'POST') {
      const b = req.body || {};
      if (!b.name) { res.status(400).json({ error: 'name is required' }); return; }
      const newId = b.id || 'C' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const { rows } = await query(
        'INSERT INTO classes (id, name, teacher_id) VALUES ($1,$2,$3) RETURNING id, name, teacher_id AS "teacherId"',
        [newId, b.name, b.teacherId || null]
      );
      res.status(201).json(rows[0]);
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (req.method === 'PATCH') {
    const b = req.body || {};
    const sets = [];
    const values = [];
    if (b.name !== undefined) { values.push(b.name); sets.push(`name = $${values.length}`); }
    if (b.teacherId !== undefined) { values.push(b.teacherId || null); sets.push(`teacher_id = $${values.length}`); }
    if (!sets.length) { res.status(400).json({ error: 'No valid fields to update' }); return; }
    values.push(id);
    const { rows } = await query(`UPDATE classes SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING id`, values);
    if (!rows.length) { res.status(404).json({ error: 'Class not found' }); return; }
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'DELETE') {
    await query('DELETE FROM classes WHERE id = $1', [id]);
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
});
