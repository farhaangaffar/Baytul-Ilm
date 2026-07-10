const { query } = require('../_db');
const { requireAuth } = require('../_auth');

const FIELD_MAP = {
  forename: 'forename', surname: 'surname', dob: 'dob', class: 'class',
  parent1Name: 'parent1_name', parent1Phone: 'parent1_phone',
  parent2Name: 'parent2_name', parent2Phone: 'parent2_phone',
  weeklyFee: 'weekly_fee', enrollDate: 'enroll_date', status: 'status', notes: 'notes',
};

module.exports = requireAuth(async (req, res) => {
  const { id } = req.query;

  if (req.method === 'PATCH') {
    const b = req.body || {};
    const sets = [];
    const values = [];
    Object.entries(b).forEach(([key, val]) => {
      const col = FIELD_MAP[key];
      if (!col) return;
      values.push(val);
      sets.push(`${col} = $${values.length}`);
    });
    if (!sets.length) { res.status(400).json({ error: 'No valid fields to update' }); return; }
    values.push(id);
    const { rows } = await query(`UPDATE students SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING id`, values);
    if (!rows.length) { res.status(404).json({ error: 'Student not found' }); return; }
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'DELETE') {
    await query('DELETE FROM students WHERE id = $1', [id]);
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
});
