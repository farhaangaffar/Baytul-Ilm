const { query } = require('../db');
const { requireAuth, isOwner, teacherScope } = require('../auth');

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
    leaveDate: row.leave_date,
    status: row.status,
    notes: row.notes,
  };
}

const FIELD_MAP = {
  forename: 'forename', surname: 'surname', dob: 'dob', class: 'class',
  parent1Name: 'parent1_name', parent1Phone: 'parent1_phone',
  parent2Name: 'parent2_name', parent2Phone: 'parent2_phone',
  weeklyFee: 'weekly_fee', enrollDate: 'enroll_date', leaveDate: 'leave_date',
  status: 'status', notes: 'notes',
};

// Self-healing: adds leave_date if this DB was created before the column existed
// (same pattern as ai_summaries.behavior in api/ai-summary.js) — no manual
// production migration step needed, even though db/migrate-003-*.sql exists too
// for anyone who prefers to apply schema changes by hand.
async function ensureLeaveDateColumn() {
  await query('ALTER TABLE students ADD COLUMN IF NOT EXISTS leave_date DATE');
}

// Single flat file, dispatching on ?id= for item ops — Vercel's file-based
// /api routing only reliably supports plain files and single [id] segments
// outside Next.js, not the [[...params]] optional catch-all, so id-style
// operations go through a query string instead of a path segment.
// Everything is limited to the signed-in person's madrasah.
module.exports = requireAuth(async (req, res) => {
  const id = req.query.id;
  const action = req.query.action;
  const mid = req.user.madrasahId;
  await ensureLeaveDateColumn();

  // Teachers can only list their own classes' current students; every change is owner-only.
  if (!isOwner(req)) {
    if (action || id || req.method !== 'GET') { res.status(403).json({ error: "You don't have access to this." }); return; }
    const scope = await teacherScope(req);
    const { rows } = await query(
      `SELECT * FROM students WHERE madrasah_id = $1 AND class = ANY($2) AND status <> 'Inactive' ORDER BY sort_order NULLS LAST, forename, surname`,
      [mid, scope.classNames]
    );
    res.status(200).json(rows.map(toClient));
    return;
  }

  if (action === 'reorder') {
    // Persists a manually-dragged card order. sort_order is nulled out for any
    // student not included (e.g. after a merge), so they fall back to
    // alphabetical and sort after everyone with an explicit position.
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || !ids.length) { res.status(400).json({ error: 'ids[] is required' }); return; }
    for (let i = 0; i < ids.length; i++) {
      await query('UPDATE students SET sort_order = $1 WHERE id = $2 AND madrasah_id = $3', [i, ids[i], mid]);
    }
    res.status(200).json({ ok: true });
    return;
  }

  // Many students at once, from a spreadsheet (Students → Import). Body:
  // { students: [{ forename, surname, class, dob, parent1Name, …, weeklyFee, enrollDate, status }],
  //   newClasses: ['Class name', …] } — classes to create first (names the sheet used that
  // the madrasah doesn't have yet). Each student's class must then exist, or be the waiting list.
  if (action === 'import') {
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
    const list = Array.isArray(req.body?.students) ? req.body.students : [];
    if (!list.length) { res.status(400).json({ error: 'No students to add' }); return; }
    if (list.length > 1000) { res.status(400).json({ error: 'Up to 1000 students at a time' }); return; }
    const str = (v, n = 120) => String(v ?? '').trim().slice(0, n);
    const iso = v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null);
    const newClasses = [...new Set((Array.isArray(req.body?.newClasses) ? req.body.newClasses : []).map(c => str(c, 60)).filter(Boolean))];
    const { rows: have } = await query('SELECT name FROM classes WHERE madrasah_id = $1', [mid]);
    const known = new Set(have.map(r => r.name));
    for (const name of newClasses) {
      if (known.has(name) || name === 'Waiting list') continue;
      await query('INSERT INTO classes (id, madrasah_id, name) VALUES ($1, $2, $3)',
        ['C' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), mid, name]);
      known.add(name);
    }
    const rows = [];
    for (const [i, b] of list.entries()) {
      const forename = str(b.forename), surname = str(b.surname), cls = str(b.class, 60);
      if (!forename || !surname) { res.status(400).json({ error: `Row ${i + 1}: a forename and surname are needed` }); return; }
      if (cls !== 'Waiting list' && !known.has(cls)) { res.status(400).json({ error: `Row ${i + 1}: class "${cls}" not found` }); return; }
      const fee = Number(b.weeklyFee);
      const status = cls === 'Waiting list' ? 'Waiting list' : (b.status === 'Inactive' ? 'Inactive' : 'Active');
      rows.push({
        id: 'S' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + i.toString(36),
        forename, surname, class: cls, dob: iso(b.dob),
        parent1_name: str(b.parent1Name), parent1_phone: str(b.parent1Phone, 40),
        parent2_name: str(b.parent2Name), parent2_phone: str(b.parent2Phone, 40),
        weekly_fee: Number.isFinite(fee) && fee >= 0 ? fee : 15,
        enroll_date: status === 'Waiting list' ? null : iso(b.enrollDate),
        leave_date: status === 'Inactive' ? iso(b.leaveDate) : null,
        status, notes: str(b.notes, 1000),
      });
    }
    await query(
      `INSERT INTO students (id, madrasah_id, forename, surname, dob, class, parent1_name, parent1_phone, parent2_name, parent2_phone, weekly_fee, enroll_date, leave_date, status, notes)
       SELECT r.id, $1, r.forename, r.surname, r.dob, r.class, r.parent1_name, r.parent1_phone, r.parent2_name, r.parent2_phone, r.weekly_fee, r.enroll_date, r.leave_date, r.status, r.notes
       FROM json_to_recordset($2::json) AS r(id text, forename text, surname text, dob date, class text, parent1_name text, parent1_phone text,
            parent2_name text, parent2_phone text, weekly_fee numeric, enroll_date date, leave_date date, status text, notes text)`,
      [mid, JSON.stringify(rows)]
    );
    res.status(200).json({ ok: true, added: rows.length, classesAdded: newClasses.filter(n => n !== 'Waiting list').length });
    return;
  }

  // All-time summary for a set of students (attendance P/L/A, fees paid/owed, daily
  // record count) — spans every academic year, not just the currently-loaded one, so
  // it's computed here rather than reusing the per-year getAttendance/getFees calls.
  // Used for the "students who have left" cards on the Students page, which show a
  // whole-history summary right on the card instead of linking out to other pages.
  if (action === 'totals') {
    if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
    const requested = String(req.query.ids || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!requested.length) { res.status(400).json({ error: 'ids= is required (comma-separated student ids)' }); return; }
    // Only this madrasah's students, whatever ids were asked for.
    const { rows: own } = await query('SELECT id FROM students WHERE id = ANY($1) AND madrasah_id = $2', [requested, mid]);
    const ids = own.map(r => r.id);
    const [attRes, feeRes, recRes] = await Promise.all([
      query(
        `SELECT student_id,
                COUNT(*) FILTER (WHERE status='P') AS present,
                COUNT(*) FILTER (WHERE status='L') AS late,
                COUNT(*) FILTER (WHERE status='A') AS absent
         FROM attendance WHERE student_id = ANY($1) AND madrasah_id = $2 GROUP BY student_id`,
        [ids, mid]
      ),
      query(
        `SELECT student_id,
                COALESCE(SUM(amount) FILTER (WHERE status='Paid'), 0) AS paid,
                COALESCE(SUM(amount) FILTER (WHERE status!='Paid'), 0) AS owed
         FROM fees WHERE student_id = ANY($1) AND madrasah_id = $2 GROUP BY student_id`,
        [ids, mid]
      ),
      query(
        `SELECT student_id, COUNT(*) AS records_count
         FROM daily_records WHERE student_id = ANY($1) AND madrasah_id = $2 GROUP BY student_id`,
        [ids, mid]
      ),
    ]);
    const totals = {};
    for (const sid of ids) totals[sid] = { present: 0, late: 0, absent: 0, paid: 0, owed: 0, recordsCount: 0 };
    for (const r of attRes.rows) Object.assign(totals[r.student_id], { present: Number(r.present), late: Number(r.late), absent: Number(r.absent) });
    for (const r of feeRes.rows) Object.assign(totals[r.student_id], { paid: Number(r.paid), owed: Number(r.owed) });
    for (const r of recRes.rows) totals[r.student_id].recordsCount = Number(r.records_count);
    res.status(200).json(totals);
    return;
  }

  if (!id) {
    if (req.method === 'GET') {
      const { rows } = await query('SELECT * FROM students WHERE madrasah_id = $1 ORDER BY sort_order NULLS LAST, forename, surname', [mid]);
      res.status(200).json(rows.map(toClient));
      return;
    }

    if (req.method === 'POST') {
      const b = req.body || {};
      if (!b.forename || !b.surname || !b.class) { res.status(400).json({ error: 'forename, surname and class are required' }); return; }
      // Preserve a client-supplied id when restoring a backup, so records that reference the
      // original student id (fees, attendance, daily records) still resolve after import.
      const newId = b.id || 'S' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      if (b.id) {
        const { rows: taken } = await query('SELECT 1 FROM students WHERE id = $1', [b.id]);
        if (taken.length) { res.status(409).json({ error: 'A student with this id already exists.' }); return; }
      }
      const { rows } = await query(
        `INSERT INTO students (id, madrasah_id, forename, surname, dob, class, parent1_name, parent1_phone, parent2_name, parent2_phone, weekly_fee, enroll_date, leave_date, status, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
        [newId, mid, b.forename, b.surname, b.dob || null, b.class,
         b.parent1Name || '', b.parent1Phone || '', b.parent2Name || '', b.parent2Phone || '',
         b.weeklyFee ?? 15, b.enrollDate || null, b.leaveDate || null, b.status || 'Active', b.notes || '']
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
    values.push(id, mid);
    const { rows } = await query(`UPDATE students SET ${sets.join(', ')} WHERE id = $${values.length - 1} AND madrasah_id = $${values.length} RETURNING id`, values);
    if (!rows.length) { res.status(404).json({ error: 'Student not found' }); return; }
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'DELETE') {
    await query('DELETE FROM students WHERE id = $1 AND madrasah_id = $2', [id, mid]);
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}, { teacher: true });

// Used by the demo (server/demo.js) to make sure its tables exist before filling them.
module.exports.ensure = ensureLeaveDateColumn;
