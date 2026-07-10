const { query } = require('../_db');
const { requireAuth } = require('../_auth');

// Deletes every fee record for a given week across every student in a class —
// used for holiday weeks that shouldn't be billed.
module.exports = requireAuth(async (req, res) => {
  if (req.method !== 'DELETE') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const { year, weekStarting, className } = req.body || {};
  if (!year || !weekStarting || !className) { res.status(400).json({ error: 'year, weekStarting and className are required' }); return; }
  await query(
    `DELETE FROM fees WHERE year = $1 AND week_starting = $2
     AND student_id IN (SELECT id FROM students WHERE class = $3)`,
    [year, weekStarting, className]
  );
  res.status(200).json({ ok: true });
});
