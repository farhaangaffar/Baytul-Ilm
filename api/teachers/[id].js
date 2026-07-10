const { query } = require('../_db');
const { requireAuth } = require('../_auth');

const FIELD_MAP = { name: 'name', phone: 'phone', email: 'email' };

module.exports = requireAuth(async (req, res) => {
  const { id } = req.query;

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
