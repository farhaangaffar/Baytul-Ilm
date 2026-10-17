const { query } = require('../db');
const { requireAuth, accessScope, whoName } = require('../auth');

// late_time: the time ('HH:MM', the marker's own clock) a student was marked Late on
// the day itself — stamped automatically by the Attendance page.
let ready = false;
async function ensureColumns() {
  if (ready) return;
  await query('ALTER TABLE attendance ADD COLUMN IF NOT EXISTS late_time TEXT');
  await query('ALTER TABLE attendance ADD COLUMN IF NOT EXISTS marked_by TEXT'); // who took it, e.g. a teacher's name
  // Every read is one madrasah's year — this finds it straight away however many madaaris share the table.
  await query('CREATE INDEX IF NOT EXISTS idx_attendance_madrasah_year ON attendance (madrasah_id, year)');
  ready = true;
}
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// Limited to the signed-in person's madrasah; teachers only see and mark their own
// classes' current students — in a Darul Uloom, also the Aalim years they teach (see accessScope).
module.exports = requireAuth(async (req, res) => {
  await ensureColumns();
  const mid = req.user.madrasahId;
  const scope = await accessScope(req, { teaching: true });
  if (req.method === 'GET') {
    const { year } = req.query;
    if (!year) { res.status(400).json({ error: 'year is required' }); return; }
    // ?times → { studentId: { date: 'HH:MM' } } for the Late marks that have a time.
    if (req.query.times !== undefined) {
      const { rows } = await query(
        "SELECT student_id, date, late_time FROM attendance WHERE year = $1 AND madrasah_id = $2 AND status = 'L' AND late_time IS NOT NULL",
        [year, mid]
      );
      const out = {};
      rows.forEach(r => {
        if (!scope.studentIds.has(r.student_id)) return;
        if (!out[r.student_id]) out[r.student_id] = {};
        out[r.student_id][r.date] = r.late_time;
      });
      res.status(200).json(out);
      return;
    }
    // ?by → { studentId: { date: 'Maulana Yusuf' } }: who took each mark (where it was kept).
    if (req.query.by !== undefined) {
      const { rows } = await query(
        'SELECT student_id, date, marked_by FROM attendance WHERE year = $1 AND madrasah_id = $2 AND marked_by IS NOT NULL', [year, mid]);
      const out = {};
      rows.forEach(r => {
        if (!scope.studentIds.has(r.student_id)) return;
        (out[r.student_id] = out[r.student_id] || {})[r.date] = r.marked_by;
      });
      res.status(200).json(out);
      return;
    }
    const { rows } = await query('SELECT student_id, date, status FROM attendance WHERE year = $1 AND madrasah_id = $2', [year, mid]);
    const out = {};
    rows.forEach(r => {
      if (!scope.studentIds.has(r.student_id)) return;
      if (!out[r.student_id]) out[r.student_id] = {};
      out[r.student_id][r.date] = r.status;
    });
    res.status(200).json(out);
    return;
  }

  if (req.method === 'PUT') {
    const { studentId, date, status, year, time } = req.body || {};
    if (!studentId || !date || !year) { res.status(400).json({ error: 'studentId, date and year are required' }); return; }
    if (!scope.studentIds.has(studentId)) { res.status(403).json({ error: "You don't have access to this." }); return; }
    if (!status) {
      await query('DELETE FROM attendance WHERE year=$1 AND student_id=$2 AND date=$3 AND madrasah_id=$4', [year, studentId, date, mid]);
    } else {
      const lateTime = status === 'L' && TIME_RE.test(time || '') ? time : null;
      await query(
        `INSERT INTO attendance (madrasah_id, year, student_id, date, status, late_time, marked_by) VALUES ($6,$1,$2,$3,$4,$5,$7)
         ON CONFLICT (year, student_id, date) DO UPDATE SET status = EXCLUDED.status, late_time = EXCLUDED.late_time, marked_by = EXCLUDED.marked_by`,
        [year, studentId, date, status, lateTime, mid, await whoName(req.user)]
      );
    }
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}, { teacher: true });

// Used by the demo (server/demo.js) to make sure its tables exist before filling them.
module.exports.ensure = ensureColumns;
