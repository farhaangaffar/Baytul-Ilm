const { query } = require('../db');
const { requireAuth } = require('../auth');

// Teachers' attendance, marked by the head on Attendance → Teachers: each teacher Present,
// Late (with the time) or Absent for a day. Head only.
//   GET ?from=YYYY-MM-DD&to=YYYY-MM-DD → [{ teacherId, date, status, lateTime }]
//   POST { teacherId, date, status: 'P'|'L'|'A'|null, lateTime? } → set (null clears the day)
let ready = false;
async function ensureTable() {
  if (ready) return;
  await query(`CREATE TABLE IF NOT EXISTS teacher_attendance (
    madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
    teacher_id  TEXT NOT NULL,
    date        DATE NOT NULL,
    status      TEXT NOT NULL,
    late_time   TEXT,
    marked_at   TIMESTAMP NOT NULL DEFAULT now(),
    PRIMARY KEY (teacher_id, date)
  )`);
  await query('CREATE INDEX IF NOT EXISTS teacher_attendance_madrasah_date ON teacher_attendance (madrasah_id, date)');
  ready = true;
}
const ISO = /^\d{4}-\d{2}-\d{2}$/;

module.exports = requireAuth(async (req, res) => {
  await ensureTable();
  const mid = req.user.madrasahId;

  if (req.method === 'GET') {
    const from = ISO.test(String(req.query.from || '')) ? req.query.from : '2000-01-01';
    const to = ISO.test(String(req.query.to || '')) ? req.query.to : '2100-01-01';
    const { rows } = await query(
      `SELECT teacher_id AS "teacherId", to_char(date, 'YYYY-MM-DD') AS date, status, late_time AS "lateTime"
       FROM teacher_attendance WHERE madrasah_id = $1 AND date BETWEEN $2 AND $3 ORDER BY date`, [mid, from, to]);
    res.status(200).json(rows);
    return;
  }

  if (req.method === 'POST') {
    const b = req.body || {};
    if (!ISO.test(String(b.date || ''))) { res.status(400).json({ error: 'Choose a day.' }); return; }
    const { rows: t } = await query('SELECT 1 FROM teachers WHERE id = $1 AND madrasah_id = $2', [b.teacherId, mid]);
    if (!t.length) { res.status(404).json({ error: 'Teacher not found.' }); return; }
    if (!b.status) {
      await query('DELETE FROM teacher_attendance WHERE teacher_id = $1 AND date = $2 AND madrasah_id = $3', [b.teacherId, b.date, mid]);
    } else {
      if (!['P', 'L', 'A'].includes(b.status)) { res.status(400).json({ error: 'Present, Late or Absent.' }); return; }
      const late = b.status === 'L' && /^\d{2}:\d{2}$/.test(String(b.lateTime || '')) ? b.lateTime : null;
      await query(
        `INSERT INTO teacher_attendance (madrasah_id, teacher_id, date, status, late_time) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (teacher_id, date) DO UPDATE SET status = EXCLUDED.status,
           late_time = CASE WHEN EXCLUDED.status = 'L' THEN COALESCE(EXCLUDED.late_time, teacher_attendance.late_time) ELSE NULL END,
           marked_at = now()
         WHERE teacher_attendance.madrasah_id = EXCLUDED.madrasah_id`,
        [mid, b.teacherId, b.date, b.status, late]);
    }
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
});

// Used by the demo (server/demo.js) to make sure its tables exist before filling them.
module.exports.ensure = ensureTable;
