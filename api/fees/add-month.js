const { query } = require('../_db');
const { requireAuth } = require('../_auth');

// Batch-adds fee records for every (week x active student in a class), skipping any
// that already exist. The DB's unique(year, student_id, week_starting) constraint
// enforces this atomically per-student-per-week — no client-side gap/duplicate bugs.
module.exports = requireAuth(async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const { year, weeks, students } = req.body || {};
  if (!year || !Array.isArray(weeks) || !Array.isArray(students) || !weeks.length || !students.length) {
    res.status(400).json({ error: 'year, weeks[] and students[] ({id, weeklyFee}) are required' });
    return;
  }

  let created = 0;
  for (const week of weeks) {
    for (const s of students) {
      const { rowCount } = await query(
        `INSERT INTO fees (year, student_id, week_starting, amount, status) VALUES ($1,$2,$3,$4,'Pending')
         ON CONFLICT (year, student_id, week_starting) DO NOTHING`,
        [year, s.id, week, s.weeklyFee ?? 15]
      );
      created += rowCount;
    }
  }
  res.status(200).json({ ok: true, created });
});
