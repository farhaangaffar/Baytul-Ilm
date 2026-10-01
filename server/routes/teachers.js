const { query } = require('../db');
const { requireAuth } = require('../auth');

const FIELD_MAP = { name: 'name', phone: 'phone', email: 'email' };

// sort_order (manual card order on Classes & Teachers) was added after the table
// already existed in production — self-heal once per cold start, as elsewhere.
let sortReady = false;
async function ensureSortOrderColumn() {
  if (sortReady) return;
  await query('ALTER TABLE teachers ADD COLUMN IF NOT EXISTS sort_order INTEGER');
  sortReady = true;
}

// Single flat file, dispatching on ?id= for item ops — see students.js for why.
module.exports = requireAuth(async (req, res) => {
  const id = req.query.id;
  const mid = req.user.madrasahId;
  await ensureSortOrderColumn();

  if (req.query.action === 'reorder') {
    // Persists a manually-dragged card order, same as students' reorder: anyone not
    // in the list falls back to alphabetical after those with a position.
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || !ids.length) { res.status(400).json({ error: 'ids[] is required' }); return; }
    for (let i = 0; i < ids.length; i++) {
      await query('UPDATE teachers SET sort_order = $1 WHERE id = $2 AND madrasah_id = $3', [i, ids[i], mid]);
    }
    res.status(200).json({ ok: true });
    return;
  }

  if (!id) {
    if (req.method === 'GET') {
      const { rows } = await query('SELECT id, name, phone, email, subjects FROM teachers WHERE madrasah_id = $1 ORDER BY sort_order NULLS LAST, name', [mid]);
      res.status(200).json(rows);
      return;
    }

    if (req.method === 'POST') {
      const b = req.body || {};
      if (!b.name) { res.status(400).json({ error: 'name is required' }); return; }
      const newId = b.id || 'T' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const { rows } = await query(
        'INSERT INTO teachers (id, madrasah_id, name, phone, email, subjects) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, name, phone, email, subjects',
        [newId, mid, b.name, b.phone || '', b.email || '', JSON.stringify(b.subjects || [])]
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
    values.push(id, mid);
    const { rows } = await query(`UPDATE teachers SET ${sets.join(', ')} WHERE id = $${values.length - 1} AND madrasah_id = $${values.length} RETURNING id`, values);
    if (!rows.length) { res.status(404).json({ error: 'Teacher not found' }); return; }
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'DELETE') {
    const { rowCount } = await query('DELETE FROM teachers WHERE id = $1 AND madrasah_id = $2', [id, mid]);
    if (rowCount) await query('UPDATE classes SET teacher_id = NULL WHERE teacher_id = $1 AND madrasah_id = $2', [id, mid]);
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
});
