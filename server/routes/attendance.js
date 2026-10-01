const { query } = require('../db');
const { requireAuth, teacherScope } = require('../auth');

// late_time: the time ('HH:MM', the marker's own clock) a student was marked Late on
// the day itself — stamped automatically by the Attendance page.
let ready = false;
async function ensureColumns() {
  if (ready) return;
  await query('ALTER TABLE attendance ADD COLUMN IF NOT EXISTS late_time TEXT');
  ready = true;
}
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// Teachers: only their own classes' current students (see teacherScope).
module.exports = requireAuth(async (req, res) => {
  await ensureColumns();
  const scope = await teacherScope(req);
  if (req.method === 'GET') {
    const { year } = req.query;
    if (!year) { res.status(400).json({ error: 'year is required' }); return; }
    // ?times → { studentId: { date: 'HH:MM' } } for the Late marks that have a time.
    if (req.query.times !== undefined) {
      const { rows } = await query("SELECT student_id, date, late_time FROM attendance WHERE year = $1 AND status = 'L' AND late_time IS NOT NULL", [year]);
      const out = {};
      rows.forEach(r => {
        if (scope && !scope.studentIds.has(r.student_id)) return;
        if (!out[r.student_id]) out[r.student_id] = {};
        out[r.student_id][r.date] = r.late_time;
      });
      res.status(200).json(out);
      return;
    }
    const { rows } = await query('SELECT student_id, date, status FROM attendance WHERE year = $1', [year]);
    const out = {};
    rows.forEach(r => {
      if (scope && !scope.studentIds.has(r.student_id)) return;
      if (!out[r.student_id]) out[r.student_id] = {};
      out[r.student_id][r.date] = r.status;
    });
    res.status(200).json(out);
    return;
  }

  if (req.method === 'PUT') {
    const { studentId, date, status, year, time } = req.body || {};
    if (!studentId || !date || !year) { res.status(400).json({ error: 'studentId, date and year are required' }); return; }
    if (scope && !scope.studentIds.has(studentId)) { res.status(403).json({ error: "You don't have access to this." }); return; }
    if (!status) {
      await query('DELETE FROM attendance WHERE year=$1 AND student_id=$2 AND date=$3', [year, studentId, date]);
    } else {
      const lateTime = status === 'L' && TIME_RE.test(time || '') ? time : null;
      await query(
        `INSERT INTO attendance (year, student_id, date, status, late_time) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (year, student_id, date) DO UPDATE SET status = EXCLUDED.status, late_time = EXCLUDED.late_time`,
        [year, studentId, date, status, lateTime]
      );
    }
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}, { teacher: true });
