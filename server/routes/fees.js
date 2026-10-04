const { query } = require('../db');
const { requireAuth, isOwner, accessScope } = require('../auth');

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
  // Periods someone removed on purpose (e.g. an August with no classes) — for a whole
  // class or one student — so adding fees automatically never puts them back.
  await query(`CREATE TABLE IF NOT EXISTS fee_skips (
    madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
    period      TEXT NOT NULL,
    start_date  DATE NOT NULL,
    class       TEXT NOT NULL DEFAULT '',
    student_id  TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (madrasah_id, period, start_date, class, student_id)
  )`);
  periodReady = true;
}

const isoDay = d => d.toISOString().slice(0, 10);
// "26-27" for a date from 1 Sep 2026 to 31 Aug 2027 (the year a month's fees go under).
function yearLabelOf(iso) {
  const [y, m] = iso.split('-').map(Number);
  const start = m >= 9 ? y : y - 1;
  return `${String(start).slice(2)}-${String(start + 1).slice(2)}`;
}
function plusDays(iso, n) { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return isoDay(d); }

// The month or term running today, for adding fees automatically: { period, start,
// endExclusive, year } — or null (weekly fees, switched off, or no term today).
async function currentAutoPeriod(mid) {
  const { rows } = await query('SELECT fee_frequency, fee_auto FROM settings WHERE madrasah_id = $1', [mid]).catch(() => ({ rows: [] }));
  const st = rows[0];
  if (!st || st.fee_auto === false) return null;
  const today = isoDay(new Date());
  if (st.fee_frequency === 'monthly') {
    const start = today.slice(0, 8) + '01';
    const [y, m] = today.split('-').map(Number);
    const endExclusive = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
    return { period: 'month', start, endExclusive, year: yearLabelOf(start) };
  }
  if (st.fee_frequency === 'termly') {
    const { rows: terms } = await query(
      'SELECT year, start_date, end_date FROM terms WHERE madrasah_id = $1 AND start_date <= $2 AND end_date >= $2 ORDER BY start_date LIMIT 1', [mid, today]
    ).catch(() => ({ rows: [] }));
    const t = terms[0];
    if (!t) return null;
    return { period: 'term', start: t.start_date, endExclusive: plusDays(t.end_date, 1), year: t.year };
  }
  return null;
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
  const mid = req.user.madrasahId;
  await ensurePeriodColumn();
  // Which students this person may touch — every student id in a request is checked
  // against it (owners: their whole madrasah; teachers: their own classes).
  const scope = await accessScope(req);
  if (!isOwner(req)) {
    const b = req.body || {};
    const readingList = !action && !id && req.method === 'GET';
    const markingPaid = !action && id && req.method === 'PATCH'
      && b.status === 'Paid' && Object.keys(b).every(k => k === 'status');
    // Both only ever bill their own classes' students (checked below).
    const autoOrPayWeek = (action === 'auto' || action === 'pay-week') && req.method === 'POST';
    if (!readingList && !markingPaid && !autoOrPayWeek) { res.status(403).json({ error: "You don't have access to this." }); return; }
    if (markingPaid) {
      const { rows } = await query('SELECT student_id FROM fees WHERE id = $1 AND madrasah_id = $2', [id, mid]);
      if (!rows.length) { res.status(404).json({ error: 'Fee record not found' }); return; }
      if (!scope.studentIds.has(rows[0].student_id)) { res.status(403).json({ error: "You don't have access to this." }); return; }
    }
  }

  if (action === 'auto') {
    // Monthly / termly: this month's (or term's) fees for every current student, at each
    // student's own fee — once, when the period starts. Safe to call any number of
    // times: existing records and removed periods (fee_skips) are left alone.
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
    const p = await currentAutoPeriod(mid);
    if (!p) { res.status(200).json({ ok: true, created: 0 }); return; }
    await query('INSERT INTO academic_years (madrasah_id, year) VALUES ($1, $2) ON CONFLICT (madrasah_id, year) DO NOTHING', [mid, p.year]);
    const { rows: students } = await query(
      `SELECT s.id, s.weekly_fee FROM students s
       WHERE s.madrasah_id = $1 AND s.status = 'Active' AND (s.enroll_date IS NULL OR s.enroll_date < $3)
         AND NOT EXISTS (SELECT 1 FROM fee_skips k WHERE k.madrasah_id = $1 AND k.period = $2 AND k.start_date = $4
                         AND (k.student_id = s.id OR (k.student_id = '' AND k.class = s.class)))`,
      [mid, p.period, p.endExclusive, p.start]
    );
    let created = 0;
    for (const s of students.filter(x => scope.studentIds.has(x.id))) {
      const { rowCount } = await query(
        `INSERT INTO fees (madrasah_id, year, student_id, period, week_starting, amount, status) VALUES ($1,$2,$3,$4,$5,$6,'Pending')
         ON CONFLICT (year, student_id, period, week_starting) DO NOTHING`,
        [mid, p.year, s.id, p.period, p.start, s.weekly_fee]
      );
      created += rowCount;
    }
    res.status(200).json({ ok: true, created });
    return;
  }

  if (action === 'pay-week') {
    // Weekly: the first time anyone in a class is marked paid for a week, that week
    // starts for the whole class (everyone else then owes it) and this student is paid.
    // Weeks nobody pays (holidays) are never charged.
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
    const { year, studentId, weekStarting } = req.body || {};
    if (!year || !studentId || !/^\d{4}-\d{2}-\d{2}$/.test(String(weekStarting || ''))) {
      res.status(400).json({ error: 'year, studentId and weekStarting are required' }); return;
    }
    if (!scope.studentIds.has(studentId)) { res.status(403).json({ error: "You don't have access to this." }); return; }
    const week = mondayOf(weekStarting);
    const { rows: me } = await query('SELECT class FROM students WHERE id = $1 AND madrasah_id = $2', [studentId, mid]);
    if (!me.length) { res.status(404).json({ error: 'Student not found' }); return; }
    const { rows: classmates } = await query(
      `SELECT id, weekly_fee FROM students WHERE madrasah_id = $1 AND class = $2 AND status = 'Active'
         AND (enroll_date IS NULL OR enroll_date < $3)`,
      [mid, me[0].class, plusDays(week, 7)]
    );
    // The student being paid is always included (even if their enrol date is later).
    const ids = new Set(classmates.map(c => c.id));
    if (!ids.has(studentId)) {
      const { rows } = await query('SELECT id, weekly_fee FROM students WHERE id = $1 AND madrasah_id = $2', [studentId, mid]);
      classmates.push(...rows);
    }
    for (const c of classmates.filter(x => scope.studentIds.has(x.id))) {
      await query(
        `INSERT INTO fees (madrasah_id, year, student_id, period, week_starting, amount, status) VALUES ($1,$2,$3,'week',$4,$5,'Pending')
         ON CONFLICT (year, student_id, period, week_starting) DO NOTHING`,
        [mid, year, c.id, week, c.weekly_fee]
      );
    }
    await query(
      `UPDATE fees SET status = 'Paid', paid_date = $5 WHERE madrasah_id = $1 AND year = $2 AND student_id = $3 AND period = 'week' AND week_starting = $4`,
      [mid, year, studentId, week, isoDay(new Date())]
    );
    res.status(200).json({ ok: true });
    return;
  }

  if (action === 'add-month') {
    // Batch-adds fee records for every (week x active student in a class), skipping any
    // that already exist. The DB's unique(year, student_id, week_starting) constraint
    // enforces this atomically per-student-per-week — no client-side gap/duplicate bugs.
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
    // Weekly: weeks[] of Mondays (as before). Monthly/termly: period ('month'|'term')
    // plus periods[] of { start, endExclusive }, one record per period per student.
    const { year, weeks, period = 'week', periods } = req.body || {};
    const sent = req.body?.students;
    if (!Array.isArray(sent) || !sent.length) { res.status(400).json({ error: 'students[] ({id, weeklyFee}) is required' }); return; }
    // Only students of this madrasah are ever billed, whatever ids were sent.
    const students = sent.filter(s => scope.studentIds.has(s?.id));
    if (!students.length) { res.status(200).json({ ok: true, created: 0 }); return; }
    if (!PERIODS.includes(period)) { res.status(400).json({ error: 'Unknown period' }); return; }
    if (period !== 'week') {
      if (!year || !Array.isArray(periods) || !Array.isArray(students) || !periods.length || !students.length) {
        res.status(400).json({ error: 'year, periods[] and students[] are required' });
        return;
      }
      // Added back by hand: forget it was ever removed, for these students and their classes.
      const { rows: cls } = await query('SELECT DISTINCT class FROM students WHERE id = ANY($1) AND madrasah_id = $2', [students.map(s => s.id), mid]);
      for (const p of periods) {
        await query(`DELETE FROM fee_skips WHERE madrasah_id = $1 AND period = $2 AND start_date = $3 AND (student_id = ANY($4) OR class = ANY($5))`,
          [mid, period, p.start, students.map(s => s.id), cls.map(c => c.class)]);
      }
      let created = 0;
      for (const p of periods) {
        for (const s of students) {
          // Not billed for a period that ended before they enrolled.
          if (s.enrollDate && s.enrollDate >= p.endExclusive) continue;
          const { rowCount } = await query(
            `INSERT INTO fees (madrasah_id, year, student_id, period, week_starting, amount, status) VALUES ($6,$1,$2,$3,$4,$5,'Pending')
             ON CONFLICT (year, student_id, period, week_starting) DO NOTHING`,
            [year, s.id, period, p.start, s.weeklyFee ?? 15, mid]
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
          `INSERT INTO fees (madrasah_id, year, student_id, period, week_starting, amount, status) VALUES ($5,$1,$2,'week',$3,$4,'Pending')
           ON CONFLICT (year, student_id, period, week_starting) DO NOTHING`,
          [year, s.id, week, s.weeklyFee ?? 15, mid]
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
      `DELETE FROM fees WHERE year = $1 AND week_starting = ANY($2::date[]) AND period = $4 AND madrasah_id = $5
       AND student_id IN (SELECT id FROM students WHERE class = $3 AND madrasah_id = $5)`,
      [year, weeks, className, period, mid]
    );
    if (period !== 'week') {
      for (const start of weeks) {
        await query(`INSERT INTO fee_skips (madrasah_id, period, start_date, class) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [mid, period, start, className]);
      }
    }
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
    if (!scope.studentIds.has(studentId)) { res.status(403).json({ error: "You don't have access to this." }); return; }
    const { rowCount } = await query(
      `DELETE FROM fees WHERE student_id = $1 AND week_starting >= $2 AND status = 'Pending' AND madrasah_id = $3`,
      [studentId, fromDate, mid]
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
      `DELETE FROM fees WHERE year = $1 AND week_starting = $2 AND period = 'week' AND madrasah_id = $4
       AND student_id IN (SELECT id FROM students WHERE class = $3 AND madrasah_id = $4)`,
      [year, weekStarting, className, mid]
    );
    res.status(200).json({ ok: true });
    return;
  }

  if (!id) {
    if (req.method === 'GET') {
      const { year } = req.query;
      if (!year) { res.status(400).json({ error: 'year is required' }); return; }
      const { rows } = await query('SELECT * FROM fees WHERE year = $1 AND madrasah_id = $2', [year, mid]);
      res.status(200).json(rows.filter(r => scope.studentIds.has(r.student_id)).map(toClient));
      return;
    }

    if (req.method === 'POST') {
      const b = req.body || {};
      if (!b.studentId || !b.weekStarting || !b.year) { res.status(400).json({ error: 'studentId, weekStarting and year are required' }); return; }
      if (!scope.studentIds.has(b.studentId)) { res.status(403).json({ error: "You don't have access to this." }); return; }
      const period = PERIODS.includes(b.period) ? b.period : 'week';
      const { rows } = await query(
        `INSERT INTO fees (madrasah_id, year, student_id, period, week_starting, amount, status) VALUES ($6,$1,$2,$3,$4,$5,'Pending')
         ON CONFLICT (year, student_id, period, week_starting) DO NOTHING RETURNING *`,
        [b.year, b.studentId, period, b.weekStarting, b.amount ?? 15, mid]
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
    values.push(id, mid);
    const { rows } = await query(`UPDATE fees SET ${sets.join(', ')} WHERE id = $${values.length - 1} AND madrasah_id = $${values.length} RETURNING id`, values);
    if (!rows.length) { res.status(404).json({ error: 'Fee record not found' }); return; }
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'DELETE') {
    const { rows: gone } = await query('DELETE FROM fees WHERE id = $1 AND madrasah_id = $2 RETURNING student_id, period, week_starting', [id, mid]);
    // A month / term removed for one student stays removed when fees are added automatically.
    if (gone[0] && gone[0].period !== 'week') {
      await query(`INSERT INTO fee_skips (madrasah_id, period, start_date, student_id) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [mid, gone[0].period, gone[0].week_starting, gone[0].student_id]);
    }
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}, { teacher: true });
