const { query, transaction } = require('./db');

// A Darul Uloom's part of Settings → Backup: the Aalim years' places, each year's books, the
// timetable and lessons recorded, and exams with their papers, marks and comments. Taken and put
// back here (GET / POST /api/course?action=backup / restore) because these tables point at each
// other by number: on restore every row gets a new number and the links are carried across.
// Classes, teachers and students keep their own ids in a backup, so links to them stay as they are.

const asText = v => (v === null || v === undefined ? null : String(v));

async function ensureTables() {
  await require('./routes/timetable').ensure();
  await require('./routes/exams').ensure();
}

async function backup(mid) {
  await ensureTables();
  const all = sql => query(sql, [mid]).then(r => r.rows);
  const [classes, subjects, periods, lessons, logs, exams, papers, marks, comments] = await Promise.all([
    all('SELECT id, course_order FROM classes WHERE madrasah_id = $1 AND course_order IS NOT NULL'),
    all('SELECT id, class_id, subject, kitaab, teacher_id, sort_order FROM du_subjects WHERE madrasah_id = $1 ORDER BY id'),
    all('SELECT id, name, starts, ends, is_break, days FROM du_periods WHERE madrasah_id = $1 ORDER BY id'),
    all('SELECT day, period_id, class_id, subject_id, subject, kitaab, teacher_id, room FROM du_lessons WHERE madrasah_id = $1 ORDER BY id'),
    all(`SELECT class_id, to_char(date, 'YYYY-MM-DD') AS date, subject_id, subject, kitaab, covered, notes, teacher_id, updated_at
         FROM du_lesson_logs WHERE madrasah_id = $1 ORDER BY id`),
    all(`SELECT id, name, year, to_char(held_on, 'YYYY-MM-DD') AS held_on, out_of, pass_mark, class_ids, published, created_at
         FROM du_exams WHERE madrasah_id = $1 ORDER BY id`),
    all('SELECT id, exam_id, class_id, subject, kitaab, teacher_id, out_of, sort_order, pass_mark, examiner FROM du_exam_papers WHERE madrasah_id = $1 ORDER BY id'),
    all('SELECT exam_id, paper_id, student_id, mark, absent FROM du_exam_marks WHERE madrasah_id = $1'),
    all('SELECT exam_id, student_id, teacher_comment, head_comment, behavior FROM du_exam_comments WHERE madrasah_id = $1'),
  ]);
  return { classes, subjects, periods, lessons, logs, exams, papers, marks, comments };
}

// Replaces this madrasah's Darul Uloom records with the backup's, in one go (all or nothing).
async function restore(mid, b) {
  if (!b || typeof b !== 'object') return;
  await ensureTables();
  const list = k => (Array.isArray(b[k]) ? b[k] : []);
  await transaction(async c => {
    for (const t of ['du_exam_marks', 'du_exam_comments', 'du_exam_papers', 'du_exams', 'du_lesson_logs', 'du_lessons', 'du_periods', 'du_subjects']) {
      await c.query(`DELETE FROM ${t} WHERE madrasah_id = $1`, [mid]);
    }
    for (const r of list('classes')) {
      await c.query('UPDATE classes SET course_order = $1 WHERE id = $2 AND madrasah_id = $3', [r.course_order, r.id, mid]);
    }
    const ins = async (sql, values) => (await c.query(sql, values)).rows[0]?.id;
    const subjectId = {}, periodId = {}, examId = {}, paperId = {};
    for (const s of list('subjects')) {
      subjectId[s.id] = await ins(
        'INSERT INTO du_subjects (madrasah_id, class_id, subject, kitaab, teacher_id, sort_order) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
        [mid, s.class_id, s.subject, s.kitaab || '', s.teacher_id, s.sort_order || 0]);
    }
    for (const p of list('periods')) {
      periodId[p.id] = await ins(
        'INSERT INTO du_periods (madrasah_id, name, starts, ends, is_break, days) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
        [mid, p.name, p.starts, p.ends, !!p.is_break, p.days || '']);
    }
    for (const l of list('lessons')) {
      if (!periodId[l.period_id]) continue;
      await c.query(
        'INSERT INTO du_lessons (madrasah_id, day, period_id, class_id, subject_id, subject, kitaab, teacher_id, room) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [mid, l.day, periodId[l.period_id], l.class_id, subjectId[l.subject_id] || null, l.subject || '', l.kitaab || '', l.teacher_id, l.room || '']);
    }
    for (const g of list('logs')) {
      await c.query(
        `INSERT INTO du_lesson_logs (madrasah_id, class_id, date, subject_id, subject, kitaab, covered, notes, teacher_id, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, COALESCE($10::timestamp, now()))`,
        [mid, g.class_id, g.date, subjectId[g.subject_id] || null, g.subject || '', g.kitaab || '', g.covered || '', g.notes || '', g.teacher_id, asText(g.updated_at)]);
    }
    for (const e of list('exams')) {
      examId[e.id] = await ins(
        `INSERT INTO du_exams (madrasah_id, name, year, held_on, out_of, pass_mark, class_ids, published, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8, COALESCE($9::timestamp, now())) RETURNING id`,
        [mid, e.name, e.year, e.held_on, e.out_of, e.pass_mark, e.class_ids || [], !!e.published, asText(e.created_at)]);
    }
    for (const p of list('papers')) {
      if (!examId[p.exam_id]) continue;
      paperId[p.id] = await ins(
        `INSERT INTO du_exam_papers (madrasah_id, exam_id, class_id, subject, kitaab, teacher_id, out_of, sort_order, pass_mark, examiner)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [mid, examId[p.exam_id], p.class_id, p.subject, p.kitaab || '', p.teacher_id, p.out_of, p.sort_order || 0, p.pass_mark, p.examiner || '']);
    }
    for (const m of list('marks')) {
      if (!examId[m.exam_id] || !paperId[m.paper_id]) continue;
      await c.query('INSERT INTO du_exam_marks (madrasah_id, exam_id, paper_id, student_id, mark, absent) VALUES ($1,$2,$3,$4,$5,$6)',
        [mid, examId[m.exam_id], paperId[m.paper_id], m.student_id, m.mark, !!m.absent]);
    }
    for (const k of list('comments')) {
      if (!examId[k.exam_id]) continue;
      await c.query('INSERT INTO du_exam_comments (madrasah_id, exam_id, student_id, teacher_comment, head_comment, behavior) VALUES ($1,$2,$3,$4,$5,$6)',
        [mid, examId[k.exam_id], k.student_id, k.teacher_comment || '', k.head_comment || '', k.behavior || '']);
    }
  });
}

module.exports = { backup, restore };
