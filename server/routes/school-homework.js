const { query, transaction } = require('../db');
const { requireAuth, isOwner, accessScope, whoName } = require('../auth');
const { cleanQuiz, totals } = require('../schoolQuiz');

// Setting homework (a school; teachers for their own classes, the head for any). Text only — what to do — with a due
// date, for the whole class or chosen pupils, usually on a surah, du'aa or practical (its links go with it for pupils).
//   GET ?class=NAME     the class's homework, newest first, each with who's ticked it done
//   POST {id?, className, itemId?, text, due?, studentIds?}   set or change one (studentIds: null/[] = the whole class)
//   DELETE ?id=         remove one
// A teacher changes or removes their own; the head any.
// Quizzes (kind 'quiz', server/schoolQuiz.js): POST also takes {kind: 'quiz', quiz: {questions, settings}, draft};
//   GET ?action=results&id=   POST ?action=mark {attemptId, marks}   POST ?action=send-scores {id}

// A quiz's line: how many pupils handed it in, the class average (of pupils fully marked, their best go) and how many
// pupils still have a long answer waiting to be marked.
function quizSummary(attempts) {
  const best = {};
  for (const a of attempts) if (!best[a.studentId] || a.score > best[a.studentId].score) best[a.studentId] = a;
  const latest = {};
  for (const a of attempts) latest[a.studentId] = a;
  const marked = Object.values(best).filter(a => !a.waiting && a.max);
  return {
    handedIn: Object.keys(best),
    average: marked.length ? Math.round(marked.reduce((t, a) => t + a.score / a.max, 0) / marked.length * 100) : null,
    toMark: Object.values(attempts.reduce((m, a) => { if (a.waiting) m[a.studentId] = 1; return m; }, {})).length,
  };
}
const str = (v, n) => String(v ?? '').trim().slice(0, n);
const dateOf = v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);

module.exports = requireAuth(async (req, res) => {
  await require('./studies').ensure(); // is_items, is_links and the homework tables
  const mid = req.user.madrasahId;
  const { rows: [m] } = await query('SELECT kind FROM madaaris WHERE id = $1', [mid]);
  if (m?.kind !== 'school') { res.status(403).json({ error: 'This is only for a school.' }); return; }
  const scope = await accessScope(req);
  const mayClass = name => !scope.classNames || scope.classNames.includes(name);

  // GET ?action=results&id= — a quiz's questions (with the right answers) and every pupil's attempts, for the teacher.
  if (req.method === 'GET' && req.query.action === 'results') {
    const { rows: [h] } = await query(`SELECT h.id, h.quiz, c.name FROM is_homework h JOIN classes c ON c.id = h.class_id AND c.madrasah_id = h.madrasah_id
      WHERE h.id = $1 AND h.madrasah_id = $2 AND h.kind = 'quiz'`, [String(req.query.id || '').replace(/\D/g, '') || '0', mid]);
    if (!h) { res.status(404).json({ error: 'That quiz has been removed.' }); return; }
    if (!mayClass(h.name)) { res.status(403).json({ error: "You don't have access to this class." }); return; }
    const { rows: attempts } = await query(
      `SELECT id::text AS id, student_id AS "studentId", answers, results, score::float AS score, max::float AS max, waiting, submitted_at AS "submittedAt"
       FROM is_quiz_attempts WHERE homework_id = $1 AND madrasah_id = $2 ORDER BY id`, [h.id, mid]);
    res.status(200).json({ quiz: h.quiz, attempts });
    return;
  }

  if (req.method === 'GET') {
    const cls = String(req.query.class || '');
    if (!mayClass(cls)) { res.status(403).json({ error: "You don't have access to this class." }); return; }
    const { rows: list } = await query(
      `SELECT h.id::text AS id, h.item_id::text AS "itemId", i.name AS "itemName", i.kind AS "itemKind", h.text, h.due, h.all_pupils AS "allPupils",
         h.set_by AS "setBy", h.set_by_user AS by, h.set_at AS "setAt", h.kind, h.draft, h.quiz, h.scores_sent_at AS "scoresSentAt",
         (SELECT json_agg(json_build_object('studentId', a.student_id, 'score', a.score::float, 'max', a.max::float, 'waiting', a.waiting) ORDER BY a.id)
            FROM is_quiz_attempts a WHERE a.homework_id = h.id) AS attempts,
         COALESCE((SELECT array_agg(p.student_id) FROM is_homework_pupils p WHERE p.homework_id = h.id), '{}') AS "studentIds",
         COALESCE((SELECT array_agg(d.student_id) FROM is_homework_done d WHERE d.homework_id = h.id), '{}') AS done
       FROM is_homework h JOIN classes c ON c.id = h.class_id AND c.madrasah_id = h.madrasah_id
       LEFT JOIN is_items i ON i.id = h.item_id AND i.madrasah_id = h.madrasah_id
       WHERE h.madrasah_id = $1 AND c.name = $2 ORDER BY h.set_at DESC, h.id DESC LIMIT 200`, [mid, cls]);
    res.status(200).json(list.map(({ by, attempts, ...h }) => ({ ...h, ...(h.kind === 'quiz' ? quizSummary(attempts || []) : {}), canEdit: isOwner(req) || by === req.user.id })));
    return;
  }

  // A quiz's pupils' marks: POST ?action=mark {attemptId, marks: {questionNumber: points}} — the long answers (any answer, if
  // the teacher wants to change a mark); POST ?action=send-scores {id} — let pupils (and parents) see their scores.
  if (req.method === 'POST' && (req.query.action === 'mark' || req.query.action === 'send-scores')) {
    const b = req.body || {};
    const hid = String(req.query.action === 'mark' ? '' : b.id || '').replace(/\D/g, '');
    const { rows: [h] } = req.query.action === 'mark'
      ? await query(`SELECT h.id, h.quiz, c.name, a.id AS aid, a.results FROM is_quiz_attempts a JOIN is_homework h ON h.id = a.homework_id AND h.madrasah_id = a.madrasah_id
          JOIN classes c ON c.id = h.class_id AND c.madrasah_id = h.madrasah_id WHERE a.id = $1 AND a.madrasah_id = $2`, [String(b.attemptId || '').replace(/\D/g, '') || '0', mid])
      : await query(`SELECT h.id, h.quiz, c.name FROM is_homework h JOIN classes c ON c.id = h.class_id AND c.madrasah_id = h.madrasah_id
          WHERE h.id = $1 AND h.madrasah_id = $2 AND h.kind = 'quiz'`, [hid || '0', mid]);
    if (!h) { res.status(404).json({ error: 'That quiz has been removed.' }); return; }
    if (!mayClass(h.name)) { res.status(403).json({ error: "You don't have access to this class." }); return; }
    if (req.query.action === 'send-scores') {
      await query('UPDATE is_homework SET scores_sent_at = now() WHERE id = $1 AND madrasah_id = $2', [h.id, mid]);
      res.status(200).json({ ok: true });
      return;
    }
    const results = (h.results || []).map((r, i) => {
      const v = (b.marks || {})[i];
      if (v === undefined || v === null || v === '') return r;
      return { ...r, got: Math.max(0, Math.min(r.of, Math.round(Number(v) * 2) / 2 || 0)) };
    });
    const t = totals(results);
    await query('UPDATE is_quiz_attempts SET results = $1, score = $2, waiting = $3 WHERE id = $4 AND madrasah_id = $5',
      [JSON.stringify(results), t.score, t.waiting, h.aid, mid]);
    res.status(200).json({ ok: true, ...t });
    return;
  }

  if (req.method === 'POST') {
    const b = req.body || {};
    const cls = String(b.className || '');
    if (!mayClass(cls)) { res.status(403).json({ error: "You don't have access to this class." }); return; }
    const { rows: [c] } = await query('SELECT id FROM classes WHERE madrasah_id = $1 AND name = $2', [mid, cls]);
    if (!c) { res.status(404).json({ error: 'That class has been removed.' }); return; }
    const isQuiz = b.kind === 'quiz';
    const text = str(b.text, 2000);
    if (!text && !isQuiz) { res.status(400).json({ error: 'Write what the pupils should do.' }); return; }
    let quiz = null;
    if (isQuiz) {
      quiz = cleanQuiz(b.quiz);
      if (quiz.error) { res.status(400).json({ error: quiz.error }); return; }
    }
    const draft = isQuiz && !!b.draft;
    let itemId = null;
    if (b.itemId) {
      const { rows: [it] } = await query('SELECT id FROM is_items WHERE id = $1 AND madrasah_id = $2', [String(b.itemId).replace(/\D/g, '') || '0', mid]);
      if (!it) { res.status(404).json({ error: 'That surah, du\'aa or practical has been removed.' }); return; }
      itemId = it.id;
    }
    const { rows: inClass } = await query(`SELECT id FROM students WHERE madrasah_id = $1 AND class = $2 AND status = 'Active'`, [mid, cls]);
    const classIds = new Set(inClass.map(r => r.id));
    const chosen = [...new Set((Array.isArray(b.studentIds) ? b.studentIds : []).map(String))];
    if (chosen.some(id => !classIds.has(id))) { res.status(403).json({ error: 'One of these pupils isn\'t in this class.' }); return; }
    const all = !chosen.length;
    const id = String(b.id || '').replace(/\D/g, '');
    if (id) {
      const { rows: [h] } = await query('SELECT set_by_user FROM is_homework WHERE id = $1 AND madrasah_id = $2 AND class_id = $3', [id, mid, c.id]);
      if (!h) { res.status(404).json({ error: 'That homework has been removed.' }); return; }
      if (!isOwner(req) && h.set_by_user !== req.user.id) { res.status(403).json({ error: 'Only the teacher who set this homework, or the head, can change it.' }); return; }
      // Once a pupil has handed a quiz in, its questions stay as they were (their marks depend on them); its settings, due
      // date and words can still change.
      if (isQuiz) {
        const { rows: [old] } = await query(
          `SELECT h.quiz, EXISTS (SELECT 1 FROM is_quiz_attempts a WHERE a.homework_id = h.id) AS started FROM is_homework h WHERE h.id = $1`, [id]);
        if (old?.started && old.quiz) quiz = { questions: old.quiz.questions, settings: quiz.settings };
      }
    }
    const who = await whoName(req.user);
    const saved = await transaction(async t => {
      let hid = id;
      if (id) {
        await t.query('UPDATE is_homework SET item_id = $1, text = $2, due = $3, all_pupils = $4, kind = $7, quiz = $8, draft = $9 WHERE id = $5 AND madrasah_id = $6',
          [itemId, text, dateOf(b.due), all, id, mid, isQuiz ? 'quiz' : 'task', quiz ? JSON.stringify(quiz) : null, draft]);
        await t.query('DELETE FROM is_homework_pupils WHERE homework_id = $1', [id]);
      } else {
        const { rows: [n] } = await t.query(
          `INSERT INTO is_homework (madrasah_id, class_id, item_id, text, due, all_pupils, set_by, set_by_user, kind, quiz, draft)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id::text AS id`,
          [mid, c.id, itemId, text, dateOf(b.due), all, who, req.user.id, isQuiz ? 'quiz' : 'task', quiz ? JSON.stringify(quiz) : null, draft]);
        hid = n.id;
      }
      for (const sid of chosen) await t.query('INSERT INTO is_homework_pupils (homework_id, student_id, madrasah_id) VALUES ($1,$2,$3)', [hid, sid, mid]);
      return hid;
    });
    res.status(200).json({ ok: true, id: saved });
    return;
  }

  if (req.method === 'DELETE') {
    const id = String(req.query.id || '').replace(/\D/g, '') || '0';
    const { rows: [h] } = await query(
      `SELECT h.set_by_user, c.name FROM is_homework h JOIN classes c ON c.id = h.class_id AND c.madrasah_id = h.madrasah_id WHERE h.id = $1 AND h.madrasah_id = $2`, [id, mid]);
    if (!h) { res.status(404).json({ error: 'That homework has been removed.' }); return; }
    if (!mayClass(h.name) || (!isOwner(req) && h.set_by_user !== req.user.id)) { res.status(403).json({ error: 'Only the teacher who set this homework, or the head, can remove it.' }); return; }
    await query('DELETE FROM is_homework WHERE id = $1 AND madrasah_id = $2', [id, mid]);
    res.status(200).json({ ok: true });
    return;
  }
  res.status(405).json({ error: 'Method not allowed' });
}, { teacher: true });
