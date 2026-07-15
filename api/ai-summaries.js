const { query } = require('./_db');
const { requireAuth } = require('./_auth');

// Self-healing: this app has no automated migration runner, so create the
// table on first use rather than requiring a manual migration step in prod.
async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS ai_summaries (
      id           BIGSERIAL PRIMARY KEY,
      student_id   TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      month        TEXT NOT NULL,
      summary      TEXT NOT NULL DEFAULT '',
      instructions TEXT NOT NULL DEFAULT '',
      updated_at   TIMESTAMP NOT NULL DEFAULT now(),
      UNIQUE (student_id, month)
    )
  `);
}

module.exports = requireAuth(async (req, res) => {
  await ensureTable();

  if (req.method === 'GET') {
    const { studentId, month } = req.query;
    if (studentId) {
      const { rows } = await query(
        `SELECT student_id AS "studentId", month, summary, instructions, updated_at AS "updatedAt"
         FROM ai_summaries WHERE student_id = $1 ORDER BY month DESC`,
        [studentId]
      );
      res.status(200).json(rows);
      return;
    }
    if (month) {
      const { rows } = await query(
        `SELECT student_id AS "studentId", month, summary, instructions, updated_at AS "updatedAt"
         FROM ai_summaries WHERE month = $1`,
        [month]
      );
      res.status(200).json(rows);
      return;
    }
    res.status(400).json({ error: 'studentId or month is required' });
    return;
  }

  if (req.method === 'PUT') {
    const { studentId, month, summary, instructions } = req.body || {};
    if (!studentId || !month) { res.status(400).json({ error: 'studentId and month are required' }); return; }
    await query(
      `INSERT INTO ai_summaries (student_id, month, summary, instructions, updated_at)
       VALUES ($1,$2,$3,$4,now())
       ON CONFLICT (student_id, month) DO UPDATE SET summary = EXCLUDED.summary, instructions = EXCLUDED.instructions, updated_at = now()`,
      [studentId, month, summary || '', instructions || '']
    );
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
});
