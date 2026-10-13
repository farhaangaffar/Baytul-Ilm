const { query, transaction } = require('../db');
const { requireAuth } = require('../auth');
const { classResults, paperPass } = require('../examResults');

// A Darul Uloom's exams and report cards (the Exams page, src/pages/Exams.js). The head adds an exam —
// its name, what it's marked out of and its pass mark (each madrasah's own, e.g. out of 50, pass 17) —
// and which classes sit it; each class's papers start as its books on the Aalim course page and can be
// changed. Teachers enter marks for the papers they teach; the class teacher writes each child's comment
// and the head adds theirs. Results (total, %, grade, position, passed / resit) are worked out here
// (server/examResults.js). Published exams show in the parent portal.
//
// GET                       → { exams, classes, teachers }
// GET ?examId=              → { exam, papers, students, marks, comments, results } — teachers: only their classes / papers
// POST ?action=exam {id?, name, year, heldOn, outOf, passMark, classIds}  → adds or changes an exam (head)
// DELETE ?action=exam&id=   → removes it with its marks (head)
// POST ?action=publish {id, published}                                     (head)
// POST ?action=paper {id?, examId, classId, subject, kitaab, teacherId, outOf} · DELETE ?action=paper&id=  (head)
// POST ?action=marks {paperId, marks: [{studentId, mark, absent}]}  → the paper's teacher, its class teacher or the head
// POST ?action=comment {examId, studentId, teacherComment?, headComment?} → class teacher (theirs) / head (both)

let ready = false;
async function ensure() {
  if (ready) return;
  await query(`CREATE TABLE IF NOT EXISTS du_exams (
    id          BIGSERIAL PRIMARY KEY,
    madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
    name        TEXT NOT NULL,
    year        TEXT NOT NULL,
    held_on     DATE,
    out_of      INTEGER NOT NULL DEFAULT 100,
    pass_mark   NUMERIC NOT NULL DEFAULT 35,
    class_ids   TEXT[] NOT NULL DEFAULT '{}',
    published   BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMP NOT NULL DEFAULT now()
  )`);
  await query(`CREATE TABLE IF NOT EXISTS du_exam_papers (
    id          BIGSERIAL PRIMARY KEY,
    madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
    exam_id     BIGINT NOT NULL,
    class_id    TEXT NOT NULL,
    subject     TEXT NOT NULL,
    kitaab      TEXT NOT NULL DEFAULT '',
    teacher_id  TEXT,
    out_of      INTEGER NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0
  )`);
  await query('CREATE INDEX IF NOT EXISTS idx_du_exam_papers ON du_exam_papers (madrasah_id, exam_id)');
  await query(`CREATE TABLE IF NOT EXISTS du_exam_marks (
    madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
    exam_id     BIGINT NOT NULL,
    paper_id    BIGINT NOT NULL,
    student_id  TEXT NOT NULL,
    mark        NUMERIC,
    absent      BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (paper_id, student_id)
  )`);
  await query('CREATE INDEX IF NOT EXISTS idx_du_exam_marks ON du_exam_marks (madrasah_id, exam_id)');
  await query(`CREATE TABLE IF NOT EXISTS du_exam_comments (
    madrasah_id     INTEGER NOT NULL REFERENCES madaaris(id),
    exam_id         BIGINT NOT NULL,
    student_id      TEXT NOT NULL,
    teacher_comment TEXT NOT NULL DEFAULT '',
    head_comment    TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (exam_id, student_id)
  )`);
  ready = true;
}

const clean = (v, max = 120) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
const isId = v => /^\d+$/.test(String(v || ''));
const EXAM_COLS = `id::text, name, year, to_char(held_on, 'YYYY-MM-DD') AS "heldOn", out_of AS "outOf", pass_mark::float AS "passMark",
  class_ids AS "classIds", published`;
const PAPER_COLS = `id::text, exam_id::text AS "examId", class_id AS "classId", subject, kitaab, teacher_id AS "teacherId", out_of AS "outOf"`;

async function isDarulUloom(mid) {
  const { rows } = await query('SELECT kind FROM madaaris WHERE id = $1', [mid]);
  return rows[0]?.kind === 'darul_uloom';
}

// The academic year a date is in ('26-27'), from 1 September.
function yearOf(d = new Date()) {
  const y = d.getFullYear(), start = d.getMonth() >= 8 ? y : y - 1;
  return `${String(start).slice(2)}-${String(start + 1).slice(2)}`;
}

// What a teacher login covers: the classes it's the class teacher of (or its own class, for a class
// login), and the papers it teaches. The head covers everything (null).
async function teacherReach(user, mid) {
  if (user.role === 'owner') return null;
  const { rows } = user.classId
    ? await query('SELECT id FROM classes WHERE id = $1 AND madrasah_id = $2', [user.classId, mid])
    : await query('SELECT id FROM classes WHERE teacher_id = $1 AND madrasah_id = $2', [user.teacherId || '', mid]);
  return { classIds: new Set(rows.map(r => r.id)), teacherId: user.teacherId || null };
}
const canSeePaper = (reach, p) => !reach || reach.classIds.has(p.classId) || (reach.teacherId && p.teacherId === reach.teacherId);

// A class's papers start as its books (Aalim course page), each marked out of the exam's out of.
async function addPapersFor(c, mid, examId, classId, outOf) {
  const { rows: subs } = await c.query(
    'SELECT subject, kitaab, teacher_id FROM du_subjects WHERE madrasah_id = $1 AND class_id = $2 ORDER BY sort_order, id', [mid, classId]);
  for (const [i, s] of subs.entries()) {
    await c.query('INSERT INTO du_exam_papers (madrasah_id, exam_id, class_id, subject, kitaab, teacher_id, out_of, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [mid, examId, classId, s.subject, s.kitaab, s.teacher_id, outOf, i]);
  }
}

// Everything about one exam for staff: papers, children, marks, comments and results — limited for teachers.
async function examDetail(mid, examId, reach) {
  const { rows: [exam] } = await query(`SELECT ${EXAM_COLS} FROM du_exams WHERE id = $1 AND madrasah_id = $2`, [examId, mid]);
  if (!exam) return null;
  const { rows: allPapers } = await query(`SELECT ${PAPER_COLS} FROM du_exam_papers WHERE exam_id = $1 AND madrasah_id = $2 ORDER BY sort_order, id`, [examId, mid]);
  const { rows: classes } = await query('SELECT id, name FROM classes WHERE madrasah_id = $1 AND id = ANY($2)', [mid, exam.classIds]);
  const papers = allPapers.filter(p => canSeePaper(reach, p));
  const visibleClasses = classes.filter(c => !reach || reach.classIds.has(c.id) || papers.some(p => p.classId === c.id));
  const { rows: students } = await query(
    `SELECT id, forename, surname, class FROM students WHERE madrasah_id = $1 AND status = 'Active' AND class = ANY($2) ORDER BY sort_order NULLS LAST, forename, surname`,
    [mid, visibleClasses.map(c => c.name)]);
  const { rows: marks } = await query(
    `SELECT paper_id::text AS "paperId", student_id AS "studentId", mark::float AS mark, absent FROM du_exam_marks WHERE exam_id = $1 AND madrasah_id = $2`, [examId, mid]);
  const { rows: comments } = await query(
    `SELECT student_id AS "studentId", teacher_comment AS "teacherComment", head_comment AS "headComment" FROM du_exam_comments WHERE exam_id = $1 AND madrasah_id = $2`, [examId, mid]);
  // Results only for classes whose whole set of papers this login can see (class teacher, or the head).
  const results = {};
  for (const c of visibleClasses) {
    if (reach && !reach.classIds.has(c.id)) continue;
    Object.assign(results, classResults(exam, allPapers.filter(p => p.classId === c.id), students.filter(s => s.class === c.name), marks));
  }
  const paperIds = new Set(papers.map(p => p.id));
  const resultClassIds = new Set(visibleClasses.filter(c => !reach || reach.classIds.has(c.id)).map(c => c.id));
  return {
    exam, papers: papers.map(p => ({ ...p, passMark: paperPass(exam, p) })),
    classes: visibleClasses.map(c => ({ ...c, results: resultClassIds.has(c.id) })),
    students, results,
    marks: marks.filter(m => paperIds.has(m.paperId)),
    comments: comments.filter(cm => students.some(s => s.id === cm.studentId)),
  };
}

// One child's report cards: each exam their class sat (only published ones for the parent portal) with
// their marks, result and comments. Worked out with the whole class (for the position).
async function studentExamCards(mid, student, { publishedOnly = false } = {}) {
  await ensure();
  const { rows: [cls] } = await query('SELECT id FROM classes WHERE name = $1 AND madrasah_id = $2', [student.class, mid]);
  if (!cls) return [];
  const { rows } = await query(
    `SELECT id::text FROM du_exams WHERE madrasah_id = $1 AND $2 = ANY(class_ids) ${publishedOnly ? 'AND published' : ''}
     ORDER BY held_on DESC NULLS LAST, id DESC`, [mid, cls.id]);
  const out = [];
  for (const { id } of rows) {
    const d = await examDetail(mid, id, null);
    const r = d?.results[student.id];
    if (!r || !r.marked) continue;
    const mine = d.marks.filter(mk => mk.studentId === student.id);
    const cm = d.comments.find(c => c.studentId === student.id) || {};
    out.push({
      id, name: d.exam.name, year: d.exam.year, heldOn: d.exam.heldOn, published: d.exam.published, result: r,
      papers: d.papers.filter(p => p.classId === cls.id).map(p => {
        const mk = mine.find(x => x.paperId === p.id);
        return { id: p.id, subject: p.subject, kitaab: p.kitaab, outOf: p.outOf, passMark: p.passMark, mark: mk ? mk.mark : null, absent: !!mk?.absent };
      }),
      teacherComment: cm.teacherComment || '', headComment: cm.headComment || '',
    });
  }
  return out;
}

module.exports = requireAuth(async (req, res) => {
  const mid = req.user.madrasahId;
  const { action, id } = req.query;
  await ensure();
  await require('./course').ensure();
  if (!(await isDarulUloom(mid))) { res.status(403).json({ error: 'This is only for a Darul Uloom.' }); return; }
  const reach = await teacherReach(req.user, mid);
  const isHead = !reach;

  // A child's report cards (their Report tab in Daily records) — the head, or their class teacher.
  if (req.method === 'GET' && req.query.studentId) {
    const { rows: [s] } = await query(
      `SELECT s.id, s.class, c.id AS "classId" FROM students s LEFT JOIN classes c ON c.name = s.class AND c.madrasah_id = s.madrasah_id
       WHERE s.id = $1 AND s.madrasah_id = $2`, [String(req.query.studentId), mid]);
    if (!s || (!isHead && !reach.classIds.has(s.classId))) { res.status(403).json({ error: "You don't have access to this." }); return; }
    res.status(200).json({ cards: await studentExamCards(mid, s) });
    return;
  }

  if (req.method === 'GET' && req.query.examId) {
    if (!isId(req.query.examId)) { res.status(404).json({ error: 'Exam not found' }); return; }
    const d = await examDetail(mid, req.query.examId, reach);
    if (!d) { res.status(404).json({ error: 'Exam not found' }); return; }
    res.status(200).json(d);
    return;
  }

  if (req.method === 'GET') {
    const { rows: exams } = await query(`SELECT ${EXAM_COLS} FROM du_exams WHERE madrasah_id = $1 ORDER BY held_on DESC NULLS FIRST, id DESC`, [mid]);
    const { rows: papers } = await query(`SELECT ${PAPER_COLS} FROM du_exam_papers WHERE madrasah_id = $1`, [mid]);
    // How many marks are in, per exam (for "12 of 40 marks in").
    const { rows: counts } = await query(
      `SELECT exam_id::text AS "examId", count(*)::int AS n FROM du_exam_marks WHERE madrasah_id = $1 AND (mark IS NOT NULL OR absent) GROUP BY exam_id`, [mid]);
    const { rows: classes } = await query(
      `SELECT c.id, c.name, c.course_order AS "courseOrder", c.teacher_id AS "teacherId",
              (SELECT count(*)::int FROM students s WHERE s.madrasah_id = c.madrasah_id AND s.class = c.name AND s.status = 'Active') AS students
       FROM classes c WHERE c.madrasah_id = $1 ORDER BY c.course_order NULLS LAST, c.name`, [mid]);
    const { rows: teachers } = await query('SELECT id, name FROM teachers WHERE madrasah_id = $1 ORDER BY name', [mid]);
    const visible = isHead ? exams : exams.filter(e => papers.some(p => p.examId === e.id && canSeePaper(reach, p)) || e.classIds.some(c => reach.classIds.has(c)));
    res.status(200).json({
      exams: visible.map(e => {
        const ps = papers.filter(p => p.examId === e.id);
        const expected = ps.reduce((t, p) => t + (classes.find(c => c.id === p.classId)?.students || 0), 0);
        return { ...e, paperCount: ps.length, marksIn: counts.find(c => c.examId === e.id)?.n || 0, marksExpected: expected,
          myPapers: isHead ? ps.length : ps.filter(p => canSeePaper(reach, p)).length };
      }),
      classes, teachers, currentYear: yearOf(),
    });
    return;
  }

  if (req.method === 'POST' && action === 'marks') {
    const b = req.body || {};
    if (!isId(b.paperId) || !Array.isArray(b.marks)) { res.status(400).json({ error: 'Paper not found' }); return; }
    const { rows: [paper] } = await query(`SELECT ${PAPER_COLS} FROM du_exam_papers WHERE id = $1 AND madrasah_id = $2`, [b.paperId, mid]);
    if (!paper || !canSeePaper(reach, paper)) { res.status(403).json({ error: "You don't teach this paper." }); return; }
    const { rows: [cls] } = await query('SELECT name FROM classes WHERE id = $1 AND madrasah_id = $2', [paper.classId, mid]);
    const { rows: kids } = await query('SELECT id FROM students WHERE madrasah_id = $1 AND class = $2', [mid, cls?.name || '']);
    const inClass = new Set(kids.map(k => k.id));
    for (const m of b.marks) {
      if (!inClass.has(String(m.studentId))) { res.status(400).json({ error: 'That child is not in this class.' }); return; }
      if (m.mark !== null && m.mark !== '' && m.mark !== undefined) {
        const v = Number(m.mark);
        if (!Number.isFinite(v) || v < 0 || v > paper.outOf) { res.status(400).json({ error: `Marks must be between 0 and ${paper.outOf}.` }); return; }
      }
    }
    await transaction(async c => {
      for (const m of b.marks) {
        const v = m.mark === null || m.mark === '' || m.mark === undefined ? null : Number(m.mark);
        if (v === null && !m.absent) {
          await c.query('DELETE FROM du_exam_marks WHERE paper_id = $1 AND student_id = $2 AND madrasah_id = $3', [paper.id, m.studentId, mid]);
          continue;
        }
        await c.query(
          `INSERT INTO du_exam_marks (madrasah_id, exam_id, paper_id, student_id, mark, absent) VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (paper_id, student_id) DO UPDATE SET mark = EXCLUDED.mark, absent = EXCLUDED.absent`,
          [mid, paper.examId, paper.id, String(m.studentId), m.absent ? null : v, !!m.absent]);
      }
    });
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'POST' && action === 'comment') {
    const b = req.body || {};
    if (!isId(b.examId)) { res.status(400).json({ error: 'Exam not found' }); return; }
    const { rows: [exam] } = await query('SELECT class_ids FROM du_exams WHERE id = $1 AND madrasah_id = $2', [b.examId, mid]);
    const { rows: [st] } = await query(
      'SELECT c.id AS "classId" FROM students s JOIN classes c ON c.name = s.class AND c.madrasah_id = s.madrasah_id WHERE s.id = $1 AND s.madrasah_id = $2',
      [String(b.studentId || ''), mid]);
    if (!exam || !st || !exam.class_ids.includes(st.classId)) { res.status(400).json({ error: 'That child is not in this exam.' }); return; }
    if (!isHead && !reach.classIds.has(st.classId)) { res.status(403).json({ error: "Only the class teacher or the head can write this." }); return; }
    const teacher = b.teacherComment !== undefined ? String(b.teacherComment).trim().slice(0, 1500) : null;
    const head = isHead && b.headComment !== undefined ? String(b.headComment).trim().slice(0, 1500) : null;
    await query(
      `INSERT INTO du_exam_comments (madrasah_id, exam_id, student_id, teacher_comment, head_comment) VALUES ($1,$2,$3,COALESCE($4,''),COALESCE($5,''))
       ON CONFLICT (exam_id, student_id) DO UPDATE SET teacher_comment = COALESCE($4, du_exam_comments.teacher_comment),
         head_comment = COALESCE($5, du_exam_comments.head_comment)`,
      [mid, b.examId, String(b.studentId), teacher, head]);
    res.status(200).json({ ok: true });
    return;
  }

  // Everything below sets up exams — the head only.
  if (!isHead) { res.status(403).json({ error: 'Only the head can change exams.' }); return; }

  if (req.method === 'POST' && action === 'exam') {
    const b = req.body || {};
    const name = clean(b.name, 80);
    const outOf = Math.round(Number(b.outOf)), passMark = Number(b.passMark);
    if (!name) { res.status(400).json({ error: 'Enter the exam name, e.g. Half-yearly exam.' }); return; }
    if (!(outOf >= 1 && outOf <= 1000)) { res.status(400).json({ error: 'Marks out of must be a number, e.g. 50 or 100.' }); return; }
    if (!(passMark >= 0 && passMark <= outOf)) { res.status(400).json({ error: `The pass mark must be between 0 and ${outOf}.` }); return; }
    const heldOn = /^\d{4}-\d{2}-\d{2}$/.test(String(b.heldOn || '')) ? b.heldOn : null;
    const year = /^\d{2}-\d{2}$/.test(String(b.year || '')) ? b.year : yearOf(heldOn ? new Date(`${heldOn}T12:00:00`) : new Date());
    const { rows: cls } = await query('SELECT id FROM classes WHERE madrasah_id = $1 AND id = ANY($2)', [mid, (b.classIds || []).map(String)]);
    const classIds = cls.map(c => c.id);
    if (!classIds.length) { res.status(400).json({ error: 'Choose which classes sit this exam.' }); return; }
    const examId = await transaction(async c => {
      if (b.id) {
        const { rows: [old] } = await c.query('SELECT class_ids, out_of FROM du_exams WHERE id = $1 AND madrasah_id = $2', [String(b.id).replace(/\D/g, '') || '0', mid]);
        if (!old) return null;
        await c.query('UPDATE du_exams SET name = $1, year = $2, held_on = $3, out_of = $4, pass_mark = $5, class_ids = $6 WHERE id = $7 AND madrasah_id = $8',
          [name, year, heldOn, outOf, passMark, classIds, b.id, mid]);
        // Papers still marked out of the old figure follow the new one.
        if (old.out_of !== outOf) await c.query('UPDATE du_exam_papers SET out_of = $1 WHERE exam_id = $2 AND madrasah_id = $3 AND out_of = $4', [outOf, b.id, mid, old.out_of]);
        for (const cid of classIds.filter(x => !old.class_ids.includes(x))) await addPapersFor(c, mid, b.id, cid, outOf);
        const gone = old.class_ids.filter(x => !classIds.includes(x));
        if (gone.length) {
          await c.query('DELETE FROM du_exam_marks WHERE madrasah_id = $1 AND paper_id IN (SELECT id FROM du_exam_papers WHERE exam_id = $2 AND madrasah_id = $1 AND class_id = ANY($3))', [mid, b.id, gone]);
          await c.query('DELETE FROM du_exam_papers WHERE exam_id = $1 AND madrasah_id = $2 AND class_id = ANY($3)', [b.id, mid, gone]);
        }
        return String(b.id);
      }
      const { rows: [row] } = await c.query(
        'INSERT INTO du_exams (madrasah_id, name, year, held_on, out_of, pass_mark, class_ids) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id::text',
        [mid, name, year, heldOn, outOf, passMark, classIds]);
      for (const cid of classIds) await addPapersFor(c, mid, row.id, cid, outOf);
      return row.id;
    });
    if (!examId) { res.status(404).json({ error: 'Exam not found' }); return; }
    res.status(200).json({ ok: true, id: examId });
    return;
  }

  if (req.method === 'DELETE' && action === 'exam') {
    if (!isId(id)) { res.status(404).json({ error: 'Exam not found' }); return; }
    await transaction(async c => {
      for (const t of ['du_exam_marks', 'du_exam_comments', 'du_exam_papers']) await c.query(`DELETE FROM ${t} WHERE exam_id = $1 AND madrasah_id = $2`, [id, mid]);
      await c.query('DELETE FROM du_exams WHERE id = $1 AND madrasah_id = $2', [id, mid]);
    });
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'POST' && action === 'publish') {
    const b = req.body || {};
    if (!isId(b.id)) { res.status(404).json({ error: 'Exam not found' }); return; }
    await query('UPDATE du_exams SET published = $1 WHERE id = $2 AND madrasah_id = $3', [!!b.published, b.id, mid]);
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'POST' && action === 'paper') {
    const b = req.body || {};
    const subject = clean(b.subject, 80), kitaab = clean(b.kitaab, 120), outOf = Math.round(Number(b.outOf));
    if (!subject) { res.status(400).json({ error: 'Enter the subject.' }); return; }
    if (!(outOf >= 1 && outOf <= 1000)) { res.status(400).json({ error: 'Marks out of must be a number.' }); return; }
    if (b.teacherId) {
      const { rows } = await query('SELECT 1 FROM teachers WHERE id = $1 AND madrasah_id = $2', [b.teacherId, mid]);
      if (!rows.length) { res.status(400).json({ error: 'Teacher not found' }); return; }
    }
    if (b.id) {
      if (!isId(b.id)) { res.status(404).json({ error: 'Paper not found' }); return; }
      await query('UPDATE du_exam_papers SET subject = $1, kitaab = $2, teacher_id = $3, out_of = $4 WHERE id = $5 AND madrasah_id = $6',
        [subject, kitaab, b.teacherId || null, outOf, b.id, mid]);
      res.status(200).json({ ok: true, id: String(b.id) });
      return;
    }
    const { rows: [exam] } = await query('SELECT class_ids FROM du_exams WHERE id = $1 AND madrasah_id = $2', [String(b.examId || '0').replace(/\D/g, '') || '0', mid]);
    if (!exam || !exam.class_ids.includes(String(b.classId))) { res.status(400).json({ error: 'Class not found in this exam' }); return; }
    const { rows: [row] } = await query(
      `INSERT INTO du_exam_papers (madrasah_id, exam_id, class_id, subject, kitaab, teacher_id, out_of, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,(SELECT COALESCE(max(sort_order), -1) + 1 FROM du_exam_papers WHERE madrasah_id = $1 AND exam_id = $2 AND class_id = $3))
       RETURNING id::text`, [mid, b.examId, String(b.classId), subject, kitaab, b.teacherId || null, outOf]);
    res.status(201).json({ ok: true, id: row.id });
    return;
  }

  if (req.method === 'DELETE' && action === 'paper') {
    if (!isId(id)) { res.status(404).json({ error: 'Paper not found' }); return; }
    await query('DELETE FROM du_exam_marks WHERE paper_id = $1 AND madrasah_id = $2', [id, mid]);
    await query('DELETE FROM du_exam_papers WHERE id = $1 AND madrasah_id = $2', [id, mid]);
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}, { teacher: true });

module.exports.ensure = ensure;
module.exports.examDetail = examDetail;
module.exports.studentExamCards = studentExamCards;
