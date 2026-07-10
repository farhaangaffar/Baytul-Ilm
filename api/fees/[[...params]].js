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

// Consolidates /api/fees (collection), /api/fees/:id (item), /api/fees/add-month
// (batch insert) and /api/fees/week (holiday-week bulk delete) into one function —
// see the note in students/[[...params]].js on why these are merged.
module.exports = requireAuth(async (req, res) => {
  const params = req.query.params || [];
  const first = params[0];

  if (!first) {
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
    return;
  }

  if (first === 'add-month') {
    // Batch-adds fee records for every (week x active student in a class), skipping any
    // that already exist. The DB's unique(year, student_id, week_starting) constraint
    // enforces this atomically per-student-per-week — no client-side gap/duplicate bugs.
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
    const { year, weeks, students } = req.body || {};
    if (!year || !Array.isArray(weeks) || !Array.isArray(students) || !weeks.length || !students.length) {
      res.status(400).json({ error: 'year, weeks[] and students[] ({id, weeklyFee}) are required' });
      return;
    }
    let created = 0;
    for (const week of weeks) {
      for (const s of students) {
        const { rowCount } = await query(
          `INSERT INTO fees (year, student_id, week_starting, amount, status) VALUES ($1,$2,$3,$4,'Pending')
           ON CONFLICT (year, student_id, week_starting) DO NOTHING`,
          [year, s.id, week, s.weeklyFee ?? 15]
        );
        created += rowCount;
      }
    }
    res.status(200).json({ ok: true, created });
    return;
  }

  if (first === 'week') {
    // Deletes every fee record for a given week across every student in a class —
    // used for holiday weeks that shouldn't be billed.
    if (req.method !== 'DELETE') { res.status(405).json({ error: 'Method not allowed' }); return; }
    const { year, weekStarting, className } = req.body || {};
    if (!year || !weekStarting || !className) { res.status(400).json({ error: 'year, weekStarting and className are required' }); return; }
    await query(
      `DELETE FROM fees WHERE year = $1 AND week_starting = $2
       AND student_id IN (SELECT id FROM students WHERE class = $3)`,
      [year, weekStarting, className]
    );
    res.status(200).json({ ok: true });
    return;
  }

  // /api/fees/:id
  const id = first;
  if (req.method === 'PATCH') {
    const b = req.body || {};
    const sets = [];
    const values = [];
    if (b.status !== undefined) {
      values.push(b.status); sets.push(`status = $${values.length}`);
      values.push(b.status === 'Paid' ? new Date().toISOString().slice(0, 10) : null);
      sets.push(`paid_date = $${values.length}`);
    }
    if (b.amount !== undefined) { values.push(b.amount); sets.push(`amount = $${values.length}`); }
    if (!sets.length) { res.status(400).json({ error: 'No valid fields to update' }); return; }
    values.push(id);
    const { rows } = await query(`UPDATE fees SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING id`, values);
    if (!rows.length) { res.status(404).json({ error: 'Fee record not found' }); return; }
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'DELETE') {
    await query('DELETE FROM fees WHERE id = $1', [id]);
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
});
