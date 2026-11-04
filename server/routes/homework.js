const { query } = require('../db');
const { requireAuth, accessScope, whoName } = require('../auth');

// Homework set for one child on one day — its own table, kept separate from
// daily_records so deleting a day's homework can never touch that day's behaviour
// comment (or vice versa). Self-healing: creates the table on first use.
let ready = false;
async function ensureTable() {
  if (ready) return;
  await query(`CREATE TABLE IF NOT EXISTS homework (
    id          BIGSERIAL PRIMARY KEY,
    madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
    student_id  TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    date        DATE NOT NULL,
    text        TEXT NOT NULL DEFAULT '',
    updated_by  TEXT,
    UNIQUE (student_id, date)
  )`);
  await query('CREATE INDEX IF NOT EXISTS idx_homework_madrasah ON homework (madrasah_id)');
  ready = true;
}

// Limited to the signed-in person's madrasah; teachers only reach their own classes'
// current students — in a Darul Uloom, also the Aalim years they teach (see accessScope).
module.exports = requireAuth(async (req, res) => {
  await ensureTable();
  const mid = req.user.madrasahId;
  const scope = await accessScope(req, { teaching: true });
  const outOfScope = sid => !scope.studentIds.has(sid);

  if (req.method === 'GET') {
    const { studentId } = req.query;
    if (studentId) {
      if (outOfScope(studentId)) { res.status(403).json({ error: "You don't have access to this." }); return; }
      const { rows } = await query('SELECT date, text, updated_by FROM homework WHERE student_id = $1 AND madrasah_id = $2', [studentId, mid]);
      const out = {};
      rows.forEach(r => { out[r.date] = { text: r.text, by: r.updated_by || '' }; });
      res.status(200).json(out);
      return;
    }
    const { rows } = await query('SELECT student_id, date, text FROM homework WHERE madrasah_id = $1', [mid]);
    const out = {};
    rows.forEach(r => {
      if (outOfScope(r.student_id)) return;
      if (!out[r.student_id]) out[r.student_id] = {};
      out[r.student_id][r.date] = { text: r.text };
    });
    res.status(200).json(out);
    return;
  }

  if (req.method === 'PUT') {
    const { studentId, date, text } = req.body || {};
    if (!studentId || !date) { res.status(400).json({ error: 'studentId and date are required' }); return; }
    if (outOfScope(studentId)) { res.status(403).json({ error: "You don't have access to this." }); return; }
    await query(
      `INSERT INTO homework (madrasah_id, student_id, date, text, updated_by)
       VALUES ($5, $1, $2, COALESCE($3,''), $4)
       ON CONFLICT (student_id, date) DO UPDATE SET
         text = COALESCE($3, homework.text),
         updated_by = $4`,
      [studentId, date, text ?? null, await whoName(req.user), mid]
    );
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'DELETE') {
    const { studentId, date } = req.body || {};
    if (!studentId || !date) { res.status(400).json({ error: 'studentId and date are required' }); return; }
    if (outOfScope(studentId)) { res.status(403).json({ error: "You don't have access to this." }); return; }
    await query('DELETE FROM homework WHERE student_id = $1 AND date = $2 AND madrasah_id = $3', [studentId, date, mid]);
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}, { teacher: true });

module.exports.ensure = ensureTable;
