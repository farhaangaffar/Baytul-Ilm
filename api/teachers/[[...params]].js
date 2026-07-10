const { query } = require('../_db');
const { requireAuth } = require('../_auth');

const FIELD_MAP = { name: 'name', phone: 'phone', email: 'email' };

module.exports = requireAuth(async (req, res) => {
  const params = req.query.params || [];
  const id = params[0];

  if (!id) {
    if (req.method === 'GET') {
      const { rows } = await query('SELECT id, name, phone, email, subjects FROM teachers ORDER BY name');
      res.status(200).json(rows);
      return;
    }

    if (req.method === 'POST') {
      const b = req.body || {};
      if (!b.name) { res.status(400).json({ error: 'name is required' }); return; }
      const newId = b.id || 'T' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const { rows } = await query(
        'INSERT INTO teachers (id, name, phone, email, subjects) VALUES ($1,$2,$3,$4,$5) RETURNING id, name, phone, email, subjects',
        [newId, b.name, b.phone || '', b.email || '', JSON.stringify(b.subjects || [])]
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
    Object.entries(b).forEach(([key, val]) => {
      if (key === 'subjects') { values.push(JSON.stringify(val)); sets.push(`subjects = $${values.length}`); return; }
      const col = FIELD_MAP[key];
      if (!col) return;
      values.push(val);
      sets.push(`${col} = $${values.length}`);
    });
    if (!sets.length) { res.status(400).json({ error: 'No valid fields to update' }); return; }
    values.push(id);
    const { rows } = await query(`UPDATE teachers SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING id`, values);
    if (!rows.length) { res.status(404).json({ error: 'Teacher not found' }); return; }
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'DELETE') {
    await query('DELETE FROM teachers WHERE id = $1', [id]);
    await query('UPDATE classes SET teacher_id = NULL WHERE teacher_id = $1', [id]);
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
});
