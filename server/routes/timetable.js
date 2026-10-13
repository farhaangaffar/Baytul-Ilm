const { query, transaction } = require('../db');
const { requireAuth } = require('../auth');

// A Darul Uloom's timetable (the Timetable page, src/pages/Timetable.js). Each madrasah sets its
// own periods — names, times, breaks, and which days each one runs (e.g. a shorter Friday) — and a
// lesson fills one class's period on one day: a subject and book (usually one of that year's, from
// the Aalim course page) and its teacher. Two classes with the same teacher, subject and book in the
// same period are one shared lesson. Teachers can read it; only the head changes it.
//
// GET                          → { periods, lessons, classes, teachers, subjects }
// POST ?action=period {id?, name, starts, ends, isBreak, days[]} → adds or changes a period
// DELETE ?action=period&id=    → removes a period and its lessons
// POST ?action=starter-periods → a typical day of periods, when there are none yet
// POST ?action=lesson {classId, periodId, days[], clearDays[], subjectId?, subject, kitaab, teacherId, room}
//                              → that lesson on each of days[]; the class's lesson in that period is cleared on clearDays[]
// POST ?action=copy-day {from, to[]} → every class's lessons on `from` are copied to the `to` days (replacing theirs)

let ready = false;
async function ensure() {
  if (ready) return;
  await query(`CREATE TABLE IF NOT EXISTS du_periods (
    id          BIGSERIAL PRIMARY KEY,
    madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
    name        TEXT NOT NULL,
    starts      TEXT NOT NULL,
    ends        TEXT NOT NULL,
    is_break    BOOLEAN NOT NULL DEFAULT false,
    days        TEXT NOT NULL DEFAULT ''
  )`);
  await query('CREATE INDEX IF NOT EXISTS idx_du_periods_madrasah ON du_periods (madrasah_id)');
  await query(`CREATE TABLE IF NOT EXISTS du_lessons (
    id          BIGSERIAL PRIMARY KEY,
    madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
    day         INTEGER NOT NULL,
    period_id   BIGINT NOT NULL,
    class_id    TEXT NOT NULL,
    subject_id  BIGINT,
    subject     TEXT NOT NULL,
    kitaab      TEXT NOT NULL DEFAULT '',
    teacher_id  TEXT,
    room        TEXT NOT NULL DEFAULT '',
    UNIQUE (madrasah_id, day, period_id, class_id)
  )`);
  ready = true;
}

// A typical full-time day — a starting point each madrasah changes to suit itself.
const STARTER_PERIODS = [
  ['Period 1', '08:00', '08:45'], ['Period 2', '08:45', '09:30'], ['Period 3', '09:30', '10:15'],
  ['Break', '10:15', '10:30', true], ['Period 4', '10:30', '11:15'], ['Period 5', '11:15', '12:00'],
  ['Lunch & Zuhr', '12:00', '13:30', true], ['Period 6', '13:30', '14:15'], ['Period 7', '14:15', '15:00'],
];

const clean = (v, max = 120) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
const time = v => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || '')) ? String(v) : null);
const dayList = v => (Array.isArray(v) ? [...new Set(v.map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : []);

async function isDarulUloom(mid) {
  const { rows } = await query('SELECT kind FROM madaaris WHERE id = $1', [mid]);
  return rows[0]?.kind === 'darul_uloom';
}

module.exports = requireAuth(async (req, res) => {
  const mid = req.user.madrasahId;
  const { action, id } = req.query;
  await ensure();
  await require('./course').ensure(); // du_subjects and classes.course_order
  if (!(await isDarulUloom(mid))) { res.status(403).json({ error: 'This is only for a Darul Uloom.' }); return; }

  if (req.method === 'GET') {
    const [periods, lessons, classes, teachers, subjects] = await Promise.all([
      query(`SELECT id::text, name, starts, ends, is_break AS "isBreak", days FROM du_periods
             WHERE madrasah_id = $1 ORDER BY starts, ends, id`, [mid]),
      query(`SELECT l.id::text, l.day, l.period_id::text AS "periodId", l.class_id AS "classId", l.subject_id::text AS "subjectId",
                    l.subject, l.kitaab, l.teacher_id AS "teacherId", l.room
             FROM du_lessons l WHERE l.madrasah_id = $1`, [mid]),
      query(`SELECT id, name, course_order AS "courseOrder" FROM classes WHERE madrasah_id = $1
             ORDER BY course_order NULLS LAST, name`, [mid]),
      query('SELECT id, name FROM teachers WHERE madrasah_id = $1 ORDER BY name', [mid]),
      query(`SELECT id::text, class_id AS "classId", subject, kitaab, teacher_id AS "teacherId" FROM du_subjects
             WHERE madrasah_id = $1 ORDER BY sort_order, id`, [mid]),
    ]);
    res.status(200).json({
      periods: periods.rows.map(p => ({ ...p, days: p.days ? p.days.split(',').map(Number) : [] })),
      lessons: lessons.rows, classes: classes.rows, teachers: teachers.rows, subjects: subjects.rows,
    });
    return;
  }

  // Everything below changes the timetable — the head only.
  if (req.user.role !== 'owner') { res.status(403).json({ error: 'Only the head can change the timetable.' }); return; }

  if (req.method === 'POST' && action === 'starter-periods') {
    const added = await transaction(async c => {
      const { rows } = await c.query('SELECT 1 FROM du_periods WHERE madrasah_id = $1 LIMIT 1', [mid]);
      if (rows.length) return 0;
      for (const [name, starts, ends, isBreak] of STARTER_PERIODS) {
        await c.query('INSERT INTO du_periods (madrasah_id, name, starts, ends, is_break) VALUES ($1,$2,$3,$4,$5)', [mid, name, starts, ends, !!isBreak]);
      }
      return STARTER_PERIODS.length;
    });
    res.status(200).json({ ok: true, added });
    return;
  }

  if (req.method === 'POST' && action === 'period') {
    const b = req.body || {};
    const name = clean(b.name, 40), starts = time(b.starts), ends = time(b.ends);
    if (!name) { res.status(400).json({ error: 'Enter a name, e.g. Period 1 or Break.' }); return; }
    if (!starts || !ends) { res.status(400).json({ error: 'Enter the start and end times.' }); return; }
    if (ends <= starts) { res.status(400).json({ error: 'It has to end after it starts.' }); return; }
    const days = dayList(b.days).join(',');
    if (b.id) {
      const { rowCount } = await query('UPDATE du_periods SET name = $1, starts = $2, ends = $3, is_break = $4, days = $5 WHERE id = $6 AND madrasah_id = $7',
        [name, starts, ends, !!b.isBreak, days, String(b.id).replace(/\D/g, '') || '0', mid]);
      if (!rowCount) { res.status(404).json({ error: 'Period not found' }); return; }
      // A period that becomes a break has no lessons.
      if (b.isBreak) await query('DELETE FROM du_lessons WHERE period_id = $1 AND madrasah_id = $2', [String(b.id).replace(/\D/g, ''), mid]);
      res.status(200).json({ ok: true, id: String(b.id) });
    } else {
      const { rows: [row] } = await query('INSERT INTO du_periods (madrasah_id, name, starts, ends, is_break, days) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id::text',
        [mid, name, starts, ends, !!b.isBreak, days]);
      res.status(201).json({ ok: true, id: row.id });
    }
    return;
  }

  if (req.method === 'DELETE' && action === 'period') {
    if (!/^\d+$/.test(String(id || ''))) { res.status(400).json({ error: 'Period not found' }); return; }
    await transaction(async c => {
      await c.query('DELETE FROM du_lessons WHERE period_id = $1 AND madrasah_id = $2', [id, mid]);
      await c.query('DELETE FROM du_periods WHERE id = $1 AND madrasah_id = $2', [id, mid]);
    });
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'POST' && action === 'lesson') {
    const b = req.body || {};
    const classId = String(b.classId || ''), periodId = String(b.periodId || '');
    const days = dayList(b.days), clearDays = dayList(b.clearDays).filter(d => !days.includes(d));
    const subject = clean(b.subject, 80), kitaab = clean(b.kitaab, 120), room = clean(b.room, 40);
    if (!/^\d+$/.test(periodId)) { res.status(400).json({ error: 'Period not found' }); return; }
    const [{ rows: cls }, { rows: per }] = await Promise.all([
      query('SELECT 1 FROM classes WHERE id = $1 AND madrasah_id = $2', [classId, mid]),
      query('SELECT is_break FROM du_periods WHERE id = $1 AND madrasah_id = $2', [periodId, mid]),
    ]);
    if (!cls.length) { res.status(400).json({ error: 'Class not found' }); return; }
    if (!per.length || per[0].is_break) { res.status(400).json({ error: 'Period not found' }); return; }
    if (days.length && !subject) { res.status(400).json({ error: 'Enter the subject.' }); return; }
    if (b.teacherId) {
      const { rows } = await query('SELECT 1 FROM teachers WHERE id = $1 AND madrasah_id = $2', [b.teacherId, mid]);
      if (!rows.length) { res.status(400).json({ error: 'Teacher not found' }); return; }
    }
    let subjectId = null;
    if (b.subjectId && /^\d+$/.test(String(b.subjectId))) {
      const { rows } = await query('SELECT 1 FROM du_subjects WHERE id = $1 AND madrasah_id = $2', [b.subjectId, mid]);
      if (rows.length) subjectId = String(b.subjectId);
    }
    await transaction(async c => {
      for (const day of days) {
        await c.query(
          `INSERT INTO du_lessons (madrasah_id, day, period_id, class_id, subject_id, subject, kitaab, teacher_id, room)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (madrasah_id, day, period_id, class_id) DO UPDATE
           SET subject_id = EXCLUDED.subject_id, subject = EXCLUDED.subject, kitaab = EXCLUDED.kitaab, teacher_id = EXCLUDED.teacher_id, room = EXCLUDED.room`,
          [mid, day, periodId, classId, subjectId, subject, kitaab, b.teacherId || null, room]);
      }
      if (clearDays.length) {
        await c.query('DELETE FROM du_lessons WHERE madrasah_id = $1 AND class_id = $2 AND period_id = $3 AND day = ANY($4::int[])',
          [mid, classId, periodId, clearDays]);
      }
    });
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'POST' && action === 'copy-day') {
    const b = req.body || {};
    const from = Number(b.from), to = dayList(b.to).filter(d => d !== from);
    if (!Number.isInteger(from) || from < 0 || from > 6 || !to.length) { res.status(400).json({ error: 'Choose the days to copy to.' }); return; }
    const copied = await transaction(async c => {
      // Only into periods that run on that day (a period can be set to some days only).
      const { rows: periods } = await c.query('SELECT id::text, days FROM du_periods WHERE madrasah_id = $1', [mid]);
      const runs = (pid, d) => { const p = periods.find(x => x.id === pid); return p && (!p.days || p.days.split(',').map(Number).includes(d)); };
      const { rows: lessons } = await c.query('SELECT period_id::text AS pid, class_id, subject_id, subject, kitaab, teacher_id, room FROM du_lessons WHERE madrasah_id = $1 AND day = $2', [mid, from]);
      let n = 0;
      for (const d of to) {
        await c.query('DELETE FROM du_lessons WHERE madrasah_id = $1 AND day = $2', [mid, d]);
        for (const l of lessons) {
          if (!runs(l.pid, d)) continue;
          await c.query(`INSERT INTO du_lessons (madrasah_id, day, period_id, class_id, subject_id, subject, kitaab, teacher_id, room)
                         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [mid, d, l.pid, l.class_id, l.subject_id, l.subject, l.kitaab, l.teacher_id, l.room]);
          n++;
        }
      }
      return n;
    });
    res.status(200).json({ ok: true, copied });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}, { teacher: true });

module.exports.ensure = ensure;
module.exports.STARTER_PERIODS = STARTER_PERIODS;
