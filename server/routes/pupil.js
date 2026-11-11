const { query } = require('../db');
const { getUser } = require('../auth');

// A pupil's own page (role 'pupil', server/pupils.js). Pupils never pass requireAuth, so every staff route is closed to
// them; this is the only route they use, and it only ever reads their own records: their name and class, and their
// Islamic Studies marks (the read-only card parents see — never other pupils', never staff notes). Homework comes here
// in stage 4's next step.
module.exports = async (req, res) => {
  const user = await getUser(req);
  if (!user || user.role !== 'pupil') { res.status(401).json({ error: 'Not signed in' }); return; }
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const mid = user.madrasahId;
  const { rows: [s] } = await query(
    `SELECT id, forename, surname, class FROM students WHERE id = $1 AND madrasah_id = $2 AND status = 'Active'`, [user.studentId, mid]);
  if (!s) { res.status(404).json({ error: 'Not found' }); return; }
  const studies = await require('./studies').forParent(mid, s);
  const { reports, allItems, ...marks } = studies || {}; // just their marks (reports are sent to parents)
  res.status(200).json({ pupil: { name: `${s.forename} ${s.surname}`, forename: s.forename, class: s.class }, studies: studies ? marks : null });
};
