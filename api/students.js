const { query } = require('./_db');
const { requireAuth } = require('./_auth');

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

const FIELD_MAP = {
  forename: 'forename', surname: 'surname', dob: 'dob', class: 'class',
  parent1Name: 'parent1_name', parent1Phone: 'parent1_phone',
  parent2Name: 'parent2_name', parent2Phone: 'parent2_phone',
  weeklyFee: 'weekly_fee', enrollDate: 'enroll_date', status: 'status', notes: 'notes',
};

// Single flat file, dispatching on ?id= for item ops — Vercel's file-based
// /api routing only reliably supports plain files and single [id] segments
// outside Next.js, not the [[...params]] optional catch-all, so id-style
// operations go through a query string instead of a path segment.
module.exports = requireAuth(async (req, res) => {
  const id = req.query.id;
  const action = req.query.action;

  if (action === 'reorder') {
    // Persists a manually-dragged card order. sort_order is nulled out for any
    // student not included (e.g. after a merge), so they fall back to
    // alphabetical and sort after everyone with an explicit position.
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || !ids.length) { res.status(400).json({ error: 'ids[] is required' }); return; }
    for (let i = 0; i < ids.length; i++) {
      await query('UPDATE students SET sort_order = $1 WHERE id = $2', [i, ids[i]]);
    }
    res.status(200).json({ ok: true });
    return;
  }

  if (!id) {
    if (req.method === 'GET') {
      const { rows } = await query('SELECT * FROM students ORDER BY sort_order NULLS LAST, forename, surname');
      res.status(200).json(rows.map(toClient));
      return;
    }

    if (req.method === 'POST') {
      const b = req.body || {};
      if (!b.forename || !b.surname || !b.class) { res.status(400).json({ error: 'forename, surname and class are required' }); return; }
      // Preserve a client-supplied id when restoring a backup, so records that reference the
      // original student id (fees, attendance, daily records) still resolve after import.
      const newId = b.id || 'S' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const { rows } = await query(
        `INSERT INTO students (id, forename, surname, dob, class, parent1_name, parent1_phone, parent2_name, parent2_phone, weekly_fee, enroll_date, status, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
        [newId, b.forename, b.surname, b.dob || null, b.class,
         b.parent1Name || '', b.parent1Phone || '', b.parent2Name || '', b.parent2Phone || '',
         b.weeklyFee ?? 15, b.enrollDate || null, b.status || 'Active', b.notes || '']
      );
      res.status(201).json(toClient(rows[0]));
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
