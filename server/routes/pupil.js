const { query } = require('../db');
const { getUser } = require('../auth');
const { homeworkFor } = require('../schoolHomework');

// A pupil's own page (role 'pupil', server/pupils.js). Pupils never pass requireAuth, so every staff route is closed to
// them; this is the only route they use, and it only ever reads their own records: their name and class, and their
// Islamic Studies marks (the read-only card parents see — never other pupils', never staff notes), and their homework with
// each item's links; they tick it done (POST ?action=done).
module.exports = async (req, res) => {
  const user = await getUser(req);
  if (!user || user.role !== 'pupil') { res.status(401).json({ error: 'Not signed in' }); return; }
  const mid = user.madrasahId;
  // POST ?action=done {id, done} — the pupil ticks a piece of their own homework done (or not).
  if (req.method === 'POST' && req.query.action === 'done') {
    const { rows: [s] } = await query(`SELECT id, class FROM students WHERE id = $1 AND madrasah_id = $2 AND status = 'Active'`, [user.studentId, mid]);
    const mine = s ? await homeworkFor(mid, s) : [];
    const id = String((req.body || {}).id || '');
    if (!mine.some(h => h.id === id)) { res.status(404).json({ error: 'That homework has been removed.' }); return; }
    if ((req.body || {}).done) {
      await query('INSERT INTO is_homework_done (homework_id, student_id, madrasah_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [id, s.id, mid]);
    } else {
      await query('DELETE FROM is_homework_done WHERE homework_id = $1 AND student_id = $2 AND madrasah_id = $3', [id, s.id, mid]);
    }
    res.status(200).json({ ok: true });
    return;
  }
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const { rows: [s] } = await query(
    `SELECT id, forename, surname, class FROM students WHERE id = $1 AND madrasah_id = $2 AND status = 'Active'`, [user.studentId, mid]);
  if (!s) { res.status(404).json({ error: 'Not found' }); return; }
  const studies = await require('./studies').forParent(mid, s);
  const { reports, allItems, homework: _hw, ...marks } = studies || {}; // just their marks (reports are sent to parents)
  const homework = await homeworkFor(mid, s, { links: true });
  res.status(200).json({ pupil: { name: `${s.forename} ${s.surname}`, forename: s.forename, class: s.class }, homework, studies: studies ? marks : null });
};
