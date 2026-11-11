const { query } = require('../db');
const { getUser } = require('../auth');
const { homeworkFor } = require('../schoolHomework');
const { markQuiz } = require('../schoolQuiz');

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
    const hw = mine.find(h => h.id === id);
    if (!hw) { res.status(404).json({ error: 'That homework has been removed.' }); return; }
    if (hw.kind === 'quiz') { res.status(400).json({ error: 'A quiz is done when you hand it in.' }); return; }
    if ((req.body || {}).done) {
      await query('INSERT INTO is_homework_done (homework_id, student_id, madrasah_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [id, s.id, mid]);
    } else {
      await query('DELETE FROM is_homework_done WHERE homework_id = $1 AND student_id = $2 AND madrasah_id = $3', [id, s.id, mid]);
    }
    res.status(200).json({ ok: true });
    return;
  }
  // POST ?action=submit {id, answers} — the pupil hands in a quiz (answers by question number). It's marked here; they get
  // their score back only if the teacher shows scores straight away.
  if (req.method === 'POST' && req.query.action === 'submit') {
    const { rows: [s] } = await query(`SELECT id, class FROM students WHERE id = $1 AND madrasah_id = $2 AND status = 'Active'`, [user.studentId, mid]);
    const mine = s ? await homeworkFor(mid, s) : [];
    const id = String((req.body || {}).id || '');
    const hw = mine.find(h => h.id === id && h.kind === 'quiz');
    if (!hw) { res.status(404).json({ error: 'That quiz has been removed.' }); return; }
    const { rows: [h] } = await query('SELECT quiz, scores_sent_at AS "scoresSentAt" FROM is_homework WHERE id = $1 AND madrasah_id = $2', [id, mid]);
    if (!h?.quiz) { res.status(404).json({ error: 'That quiz has been removed.' }); return; }
    if (h.quiz.settings.tries !== 'many' && hw.tries > 0) { res.status(400).json({ error: "You've already handed this quiz in." }); return; }
    const m = markQuiz(h.quiz, (req.body || {}).answers);
    await query(`INSERT INTO is_quiz_attempts (homework_id, student_id, madrasah_id, answers, results, score, max, waiting) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, s.id, mid, JSON.stringify(m.answers), JSON.stringify(m.results), m.score, m.max, m.waiting]);
    await query('INSERT INTO is_homework_done (homework_id, student_id, madrasah_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [id, s.id, mid]);
    const after = (await homeworkFor(mid, s, { links: true })).find(x => x.id === id);
    res.status(200).json({ ok: true, homework: after });
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
