const { query } = require('../db');
const { requireAuth, isOwner, teacherScope } = require('../auth');

// A fee record covers one billing period: a week (weekStarting = its Monday), a
// calendar month (the 1st) or a term (the term's start date), per the madrasah's fee
// frequency in Settings. The date column keeps its original name, week_starting, but
// holds the period's start date for every kind.
let periodReady = false;
async function ensurePeriodColumn() {
  if (periodReady) return;
  await query(`ALTER TABLE fees ADD COLUMN IF NOT EXISTS period TEXT NOT NULL DEFAULT 'week'`);
  // Uniqueness now includes the period kind, so a month record dated the 1st can't
  // collide with a week record on a Monday the 1st after a frequency switch.
  await query(`ALTER TABLE fees DROP CONSTRAINT IF EXISTS fees_year_student_id_week_starting_key`);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS fees_year_student_period_start_key ON fees (year, student_id, period, week_starting)`);
  periodReady = true;
}
const PERIODS = ['week', 'month', 'term'];

function toClient(row) {
  return {
    id: String(row.id),
    studentId: row.student_id,
    period: row.period || 'week',
    weekStarting: row.week_starting,
    amount: Number(row.amount),
    status: row.status,
    paidDate: row.paid_date,
  };
}

// Monday of the week containing dateStr — mirrors getMondayOf() in src/lib/store.js.
// Kept as a local copy rather than a shared import: that module is written for the
// browser (fetch-based apiFetch etc.) and isn't meant to be required from serverless
// functions.
function mondayOf(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  return d.toISOString().split('T')[0];
}

// Single flat file, dispatching on ?action= (add-month / week) and ?id= for
// item ops — Vercel's file-based /api routing only reliably supports plain
// files and single [id] segments outside Next.js, not the [[...params]]
// optional catch-all, so everything here goes through query strings.
// Teachers may see their own classes' fees and mark a week as Paid — nothing else
// (no amounts, no adding/removing weeks, no un-marking). Everything else is owner-only.
module.exports = requireAuth(async (req, res) => {
  const { action, id } = req.query;
  await ensurePeriodColumn();
  const scope = await teacherScope(req);
  if (!isOwner(req)) {
    const b = req.body || {};
    const readingList = !action && !id && req.method === 'GET';
    const markingPaid = !action && id && req.method === 'PATCH'
      && b.status === 'Paid' && Object.keys(b).every(k => k === 'status');
    if (!readingList && !markingPaid) { res.status(403).json({ error: "You don't have access to this." }); return; }
    if (markingPaid) {
      const { rows } = await query('SELECT student_id FROM fees WHERE id = $1', [id]);
      if (!rows.length) { res.status(404).json({ error: 'Fee record not found' }); return; }
      if (!scope.studentIds.has(rows[0].student_id)) { res.status(403).json({ error: "You don't have access to this." }); return; }
    }
  }

  if (action === 'add-month') {
    // Batch-adds fee records for every (week x active student in a class), skipping any
    // that already exist. The DB's unique(year, student_id, week_starting) constraint
    // enforces this atomically per-student-per-week — no client-side gap/duplicate bugs.
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
    // Weekly: weeks[] of Mondays (as before). Monthly/termly: period ('month'|'term')
    // plus periods[] of { start, endExclusive }, one record per period per student.
    const { year, weeks, students, period = 'week', periods } = req.body || {};
    if (!PERIODS.includes(period)) { res.status(400).json({ error: 'Unknown period' }); return; }
    if (period !== 'week') {
      if (!year || !Array.isArray(periods) || !Array.isArray(students) || !periods.length || !students.length) {
        res.status(400).json({ error: 'year, periods[] and students[] are required' });
        return;
      }
      let created = 0;
      for (const p of periods) {
        for (const s of students) {
          // Not billed for a period that ended before they enrolled.
          if (s.enrollDate && s.enrollDate >= p.endExclusive) continue;
          const { rowCount } = await query(
            `INSERT INTO fees (year, student_id, period, week_starting, amount, status) VALUES ($1,$2,$3,$4,$5,'Pending')
             ON CONFLICT (year, student_id, period, week_starting) DO NOTHING`,
            [year, s.id, period, p.start, s.weeklyFee ?? 15]
          );
          created += rowCount;
        }
      }
      res.status(200).json({ ok: true, created });
      return;
    }
    if (!year || !Array.isArray(weeks) || !Array.isArray(students) || !weeks.length || !students.length) {
      res.status(400).json({ error: 'year, weeks[] and students[] ({id, weeklyFee}) are required' });
      return;
    }
    let created = 0;
    for (const week of weeks) {
      for (const s of students) {
        // Skip weeks that fall entirely before the student's enrollment week, so a
        // mid-month starter isn't billed for weeks before they joined — bill from the
        // Monday of the week they enrolled in (in full; no pro-rating a partial week).
        // No enrollDate on file (older records) falls back to billing every week.
        if (s.enrollDate && week < mondayOf(s.enrollDate)) continue;
        const { rowCount } = await query(
          `INSERT INTO fees (year, student_id, period, week_starting, amount, status) VALUES ($1,$2,'week',$3,$4,'Pending')
           ON CONFLICT (year, student_id, period, week_starting) DO NOTHING`,
          [year, s.id, week, s.weeklyFee ?? 15]
        );
        created += rowCount;
      }
    }
    res.status(200).json({ ok: true, created });
    return;
  }

  if (action === 'delete-month') {
    // Mirrors add-month: deletes every fee record across a set of weeks for one class in
    // a single request, rather than making the client loop the single-week delete below.
    if (req.method !== 'DELETE') { res.status(405).json({ error: 'Method not allowed' }); return; }
    // weeks[] holds the period start dates — Mondays for weekly, or the month/term
    // start(s) when period is 'month'/'term'.
    const { year, weeks, className, period = 'week' } = req.body || {};
    if (!year || !Array.isArray(weeks) || !weeks.length || !className || !PERIODS.includes(period)) {
      res.status(400).json({ error: 'year, weeks[] and className are required' });
      return;
    }
    const { rowCount } = await query(
      `DELETE FROM fees WHERE year = $1 AND week_starting = ANY($2::date[]) AND period = $4
       AND student_id IN (SELECT id FROM students WHERE class = $3)`,
      [year, weeks, className, period]
    );
    res.status(200).json({ ok: true, deleted: rowCount });
    return;
  }

  if (action === 'cancel-remaining') {
    // Deletes a single student's own unpaid (Pending) weeks from a given date onward —
    // used when a student leaves and still has future weeks already sitting on their
    // account from when "Add month" ran for the whole class. Deliberately scoped to
    // Pending only: anything already Paid is left alone, so the record stays accurate.
    if (req.method !== 'DELETE') { res.status(405).json({ error: 'Method not allowed' }); return; }
    const { studentId, fromDate } = req.body || {};
    if (!studentId || !fromDate) { res.status(400).json({ error: 'studentId and fromDate are required' }); return; }
    const { rowCount } = await query(
      `DELETE FROM fees WHERE student_id = $1 AND week_starting >= $2 AND status = 'Pending'`,
      [studentId, fromDate]
    );
    res.status(200).json({ ok: true, deleted: rowCount });
    return;
  }

  if (action === 'week') {
    // Deletes every fee record for a given week across every student in a class —
    // used for holiday weeks that shouldn't be billed.
    if (req.method !== 'DELETE') { res.status(405).json({ error: 'Method not allowed' }); return; }
    const { year, weekStarting, className } = req.body || {};
    if (!year || !weekStarting || !className) { res.status(400).json({ error: 'year, weekStarting and className are required' }); return; }
    await query(
      `DELETE FROM fees WHERE year = $1 AND week_starting = $2 AND period = 'week'
       AND student_id IN (SELECT id FROM students WHERE class = $3)`,
      [year, weekStarting, className]
    );
    res.status(200).json({ ok: true });
    return;
  }

  if (!id) {
    if (req.method === 'GET') {
      const { year } = req.query;
      if (!year) { res.status(400).json({ error: 'year is required' }); return; }
      const { rows } = await query('SELECT * FROM fees WHERE year = $1', [year]);
      res.status(200).json(rows.filter(r => !scope || scope.studentIds.has(r.student_id)).map(toClient));
      return;
    }

    if (req.method === 'POST') {
      const b = req.body || {};
      if (!b.studentId || !b.weekStarting || !b.year) { res.status(400).json({ error: 'studentId, weekStarting and year are required' }); return; }
      const period = PERIODS.includes(b.period) ? b.period : 'week';
      const { rows } = await query(
        `INSERT INTO fees (year, student_id, period, week_starting, amount, status) VALUES ($1,$2,$3,$4,$5,'Pending')
         ON CONFLICT (year, student_id, period, week_starting) DO NOTHING RETURNING *`,
        [b.year, b.studentId, period, b.weekStarting, b.amount ?? 15]
      );
      if (!rows.length) { res.status(200).json({ ok: true, created: false }); return; }
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
}, { teacher: true });
