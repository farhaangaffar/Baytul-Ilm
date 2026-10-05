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
  await query(`CREATE TABLE IF NOT EXISTS fee_weeks_off (
    madrasah_id  INTEGER NOT NULL REFERENCES madaaris(id),
    year         TEXT NOT NULL,
    week_starting DATE NOT NULL,
    PRIMARY KEY (madrasah_id, week_starting)
  )`);
  // The Monday automatic fees first ran — weeks before it are never filled in, so history
  // from before the feature is left exactly as it was.
  await query(`ALTER TABLE settings ADD COLUMN IF NOT EXISTS fee_auto_since DATE`);
  periodReady = true;
}

const isoDay = d => d.toISOString().slice(0, 10);
// Today's date where the madaaris are (UK) — the server's own clock is UTC, which is still
// the day before for the first hour of a British summer day (a month starting at midnight
// on its first Monday would otherwise start an hour late).
const ukToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
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
  const today = ukToday();
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
// Teachers may see their own classes' fees and tick an added fee paid or untick it
// (a mistake) — nothing else: no amounts, no adding/starting/removing weeks or months.
// Everything else is owner-only.
// Weekly fee weeks (Settings → Fee weeks): every week is charged unless the head
// switched it off (fee_weeks_off). A week's year follows the school-month rule — the
// week of a September's first Monday starts the new year.
function firstMondayOf(y, m) { // m: 1–12
  const d = new Date(Date.UTC(y, m - 1, 1, 12));
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  return isoDay(d);
}
// End (exclusive) of the school month running today — months run from their first
// Monday — so all of this month's fee weeks are due at once (parents often pay a
// whole month in advance).
function currentSchoolMonthEnd() {
  const today = ukToday();
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  const next = (yy, mm) => (mm === 12 ? [yy + 1, 1] : [yy, mm + 1]);
  const [ny, nm] = today >= firstMondayOf(y, m) ? next(y, m) : [y, m];
  return firstMondayOf(ny, nm);
}
function yearOfWeek(monday) {
  const y = Number(monday.slice(0, 4));
  const start = monday >= firstMondayOf(y, 9) ? y : y - 1;
  return `${String(start).slice(2)}-${String(start + 1).slice(2)}`;
}
// Charges one week to everyone who should owe it — active, enrolled by the week's end,
// not left before it starts, not removed for them or their class on purpose
// (fee_skips) — limited to `ids`. Returns how many fees were added.
async function fillWeek(mid, week, ids) {
  const { rowCount } = await query(
    `INSERT INTO fees (madrasah_id, year, student_id, period, week_starting, amount, status)
     SELECT $1, $2, s.id, 'week', $3, s.weekly_fee, 'Pending' FROM students s
     WHERE s.madrasah_id = $1 AND s.status = 'Active' AND s.id = ANY($5)
       AND (s.enroll_date IS NULL OR s.enroll_date < $4)
       AND (s.leave_date IS NULL OR s.leave_date >= $3)
       AND NOT EXISTS (SELECT 1 FROM fee_skips k WHERE k.madrasah_id = $1 AND k.period = 'week' AND k.start_date = $3
                       AND (k.student_id = s.id OR (k.student_id = '' AND k.class = s.class)))
     ON CONFLICT (year, student_id, period, week_starting) DO NOTHING`,
    [mid, yearOfWeek(week), week, plusDays(week, 7), ids]
  );
  return rowCount;
}

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
    // Ticking a fee paid, or unticking one ticked by mistake — on fees already added.
    const markingPaid = !action && id && req.method === 'PATCH'
      && (b.status === 'Paid' || b.status === 'Pending') && Object.keys(b).every(k => k === 'status');
    // The automatic check only fills in weeks the head has already started, and only
    // ever for their own classes' students (checked below). Starting a week is head-only.
    const autoCheck = action === 'auto' && req.method === 'POST';
    if (!readingList && !markingPaid && !autoCheck) { res.status(403).json({ error: "You don't have access to this." }); return; }
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
    const { rows: cfg } = await query('SELECT fee_frequency, fee_auto, fee_auto_since FROM settings WHERE madrasah_id = $1', [mid]);
    if (cfg[0] && cfg[0].fee_auto !== false && cfg[0].fee_frequency === 'weekly') {
      // Weekly: every fee week of the school month now running (and any before it) is charged —
      // except weeks switched off in Settings, and weeks from before automatic fees began
      // (history is never changed).
      let since = cfg[0].fee_auto_since;
      if (!since) {
        since = mondayOf(ukToday());
        await query('UPDATE settings SET fee_auto_since = $2 WHERE madrasah_id = $1', [mid, since]);
      }
      const { rows: off } = await query('SELECT week_starting FROM fee_weeks_off WHERE madrasah_id = $1 AND week_starting >= $2', [mid, since]);
      const offSet = new Set(off.map(r => r.week_starting));
      const ids = [...scope.studentIds];
      let created = 0;
      for (let w = since, end = currentSchoolMonthEnd(); w < end; w = plusDays(w, 7)) {
        if (!offSet.has(w)) created += await fillWeek(mid, w, ids);
      }
      res.status(200).json({ ok: true, created });
      return;
    }
    const p = await currentAutoPeriod(mid);
    if (!p) { res.status(200).json({ ok: true, created: 0 }); return; }
    await query('INSERT INTO academic_years (madrasah_id, year) VALUES ($1, $2) ON CONFLICT (madrasah_id, year) DO NOTHING', [mid, p.year]);
    const { rows: students } = await query(
      `SELECT s.id, s.weekly_fee FROM students s
       WHERE s.madrasah_id = $1 AND s.status = 'Active' AND (s.enroll_date IS NULL OR s.enroll_date < $3)
         AND (s.leave_date IS NULL OR s.leave_date >= $4)
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

  if (action === 'fee-weeks') {
    // Settings → Fee weeks (head only). GET ?year= → { off: [Mondays], charged: {Monday: n} }.
    // POST { weeks: [Mondays], on: true|false } switches weeks on or off. Off: the week is
    // never charged, and fees not yet paid for it are removed (payments stay recorded).
    // On: charged again — straight away if it's in this school month or earlier.
    if (req.method === 'GET') {
      const year = String(req.query.year || '');
      const { rows: off } = await query('SELECT week_starting FROM fee_weeks_off WHERE madrasah_id = $1 AND year = $2 ORDER BY 1', [mid, year]);
      const { rows: charged } = await query(
        `SELECT week_starting, count(*)::int AS n FROM fees WHERE madrasah_id = $1 AND year = $2 AND period = 'week' GROUP BY 1`, [mid, year]);
      res.status(200).json({ off: off.map(r => r.week_starting), charged: Object.fromEntries(charged.map(r => [r.week_starting, r.n])) });
      return;
    }
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
    const { weeks, on } = req.body || {};
    const list = Array.isArray(weeks) ? [...new Set(weeks.map(String).filter(w => /^\d{4}-\d{2}-\d{2}$/.test(w)).map(mondayOf))] : [];
    if (!list.length || typeof on !== 'boolean') { res.status(400).json({ error: 'weeks[] and on are required' }); return; }
    let removed = 0, added = 0;
    const monthEnd = currentSchoolMonthEnd();
    const all = [...scope.studentIds];
    for (const w of list) {
      if (on) {
        await query('DELETE FROM fee_weeks_off WHERE madrasah_id = $1 AND week_starting = $2', [mid, w]);
        if (w < monthEnd) added += await fillWeek(mid, w, all);
      } else {
        await query('INSERT INTO fee_weeks_off (madrasah_id, year, week_starting) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [mid, yearOfWeek(w), w]);
        const { rowCount } = await query(`DELETE FROM fees WHERE madrasah_id = $1 AND period = 'week' AND week_starting = $2 AND status <> 'Paid'`, [mid, w]);
        removed += rowCount;
      }
    }
    res.status(200).json({ ok: true, removed, added });
    return;
  }

  if (action === 'add-week') {
    // Head only (teachers never reach here): one child, one week — e.g. a parent paying
    // ahead, or a week removed for them by mistake. Only weeks switched on in
    // Settings → Fee weeks. { studentId, weekStarting, paid }. With wholeClass: true, the
    // week goes back on for everyone in that child's class (owed) — e.g. it was removed for
    // the whole class by mistake; children removed from it one by one stay removed.
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
    const { studentId, weekStarting, paid } = req.body || {};
    if (!studentId || !/^\d{4}-\d{2}-\d{2}$/.test(String(weekStarting || ''))) { res.status(400).json({ error: 'studentId and weekStarting are required' }); return; }
    if (!scope.studentIds.has(studentId)) { res.status(403).json({ error: "You don't have access to this." }); return; }
    const week = mondayOf(weekStarting);
    const { rows: isOff } = await query('SELECT 1 FROM fee_weeks_off WHERE madrasah_id = $1 AND week_starting = $2', [mid, week]);
    if (isOff.length) { res.status(400).json({ error: 'That week is switched off in Settings → Fee weeks.' }); return; }
    const { rows: st } = await query('SELECT weekly_fee FROM students WHERE id = $1 AND madrasah_id = $2', [studentId, mid]);
    if (!st.length) { res.status(404).json({ error: 'Student not found' }); return; }
    const year = yearOfWeek(week);
    await query('INSERT INTO academic_years (madrasah_id, year) VALUES ($1, $2) ON CONFLICT (madrasah_id, year) DO NOTHING', [mid, year]);
    if (req.body.wholeClass) {
      const { rows: [{ class: cls }] } = await query('SELECT class FROM students WHERE id = $1 AND madrasah_id = $2', [studentId, mid]);
      await query(`DELETE FROM fee_skips WHERE madrasah_id = $1 AND period = 'week' AND start_date = $2 AND class = $3 AND student_id = ''`, [mid, week, cls]);
      const { rows: inClass } = await query('SELECT id FROM students WHERE madrasah_id = $1 AND class = $2', [mid, cls]);
      const added = await fillWeek(mid, week, inClass.map(r => r.id).filter(i => scope.studentIds.has(i)));
      res.status(200).json({ ok: true, added });
      return;
    }
    await query(
      `INSERT INTO fees (madrasah_id, year, student_id, period, week_starting, amount, status, paid_date) VALUES ($1,$2,$3,'week',$4,$5,$6,$7)
       ON CONFLICT (year, student_id, period, week_starting) DO UPDATE SET status = EXCLUDED.status, paid_date = EXCLUDED.paid_date`,
      [mid, year, studentId, week, st[0].weekly_fee, paid ? 'Paid' : 'Pending', paid ? ukToday() : null]
    );
    // Added back by hand for this child — no longer counts as removed for them.
    await query(`DELETE FROM fee_skips WHERE madrasah_id = $1 AND period = 'week' AND start_date = $2 AND student_id = $3`, [mid, week, studentId]);
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
    // Added back by hand: forget these weeks were ever removed for these students' classes.
    const { rows: wcls } = await query('SELECT DISTINCT class FROM students WHERE id = ANY($1) AND madrasah_id = $2', [students.map(s => s.id), mid]);
    await query(`DELETE FROM fee_skips WHERE madrasah_id = $1 AND period = 'week' AND start_date = ANY($2::date[]) AND (student_id = ANY($3) OR class = ANY($4))`,
      [mid, weeks, students.map(s => s.id), wcls.map(c => c.class)]);
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
    {
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
    // Removed for this class on purpose — automatic fees won't charge it again.
    await query(`INSERT INTO fee_skips (madrasah_id, period, start_date, class) VALUES ($1,'week',$2,$3) ON CONFLICT DO NOTHING`, [mid, weekStarting, className]);
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
    // A week / month / term removed for one student stays removed when fees are added automatically.
    if (gone[0]) {
      await query(`INSERT INTO fee_skips (madrasah_id, period, start_date, student_id) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [mid, gone[0].period, gone[0].week_starting, gone[0].student_id]);
    }
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}, { teacher: true });
