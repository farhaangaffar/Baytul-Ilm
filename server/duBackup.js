const { query, transaction } = require('./db');

// A Darul Uloom's part of Settings → Backup: the Aalim years' places, each year's books, the
// timetable and lessons recorded, exams with their papers, marks and comments, and boarding (rooms and who
// is in them, home weekends, going home, night registers, unwell & medicine). Taken and put
// back here (GET / POST /api/course?action=backup / restore) because these tables point at each
// other by number: on restore every row gets a new number and the links are carried across.
// Classes, teachers and students keep their own ids in a backup, so links to them stay as they are.

const asText = v => (v === null || v === undefined ? null : String(v));

async function ensureTables() {
  await require('./routes/timetable').ensure();
  await require('./routes/exams').ensure();
  await require('./routes/boarding').ensure();
}

async function backup(mid) {
  await ensureTables();
  const all = sql => query(sql, [mid]).then(r => r.rows);
  const [classes, subjects, periods, lessons, logs, exams, papers, marks, comments, rooms, roomPlaces, homeWeekends, leaves, nights, health] = await Promise.all([
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
    all('SELECT id, block, level, name, beds, teacher_id, sort_order FROM du_rooms WHERE madrasah_id = $1 ORDER BY id'),
    all('SELECT student_id, room_id FROM du_room_places WHERE madrasah_id = $1'),
    all(`SELECT name, to_char(starts, 'YYYY-MM-DD') AS starts, leave_time, to_char(ends, 'YYYY-MM-DD') AS ends, return_time FROM du_home_weekends WHERE madrasah_id = $1 ORDER BY id`),
    all(`SELECT student_id, reason, collected_by, out_at, out_by, to_char(back_due, 'YYYY-MM-DD') AS back_due, back_at, back_by FROM du_leaves WHERE madrasah_id = $1 ORDER BY id`),
    all(`SELECT student_id, to_char(date, 'YYYY-MM-DD') AS date, status, marked_by, marked_at FROM du_night_register WHERE madrasah_id = $1`),
    all('SELECT student_id, at, kind, note, medicine, dose, by_name FROM du_health_log WHERE madrasah_id = $1 ORDER BY id'),
  ]);
  return { classes, subjects, periods, lessons, logs, exams, papers, marks, comments, rooms, roomPlaces, homeWeekends, leaves, nights, health };
}

// Replaces this madrasah's Darul Uloom records with the backup's, in one go (all or nothing).
async function restore(mid, b) {
  if (!b || typeof b !== 'object') return;
  await ensureTables();
  const list = k => (Array.isArray(b[k]) ? b[k] : []);
  await transaction(async c => {
    for (const t of ['du_health_log', 'du_leaves', 'du_home_weekends', 'du_night_register', 'du_room_places', 'du_rooms', 'du_exam_marks', 'du_exam_comments', 'du_exam_papers', 'du_exams', 'du_lesson_logs', 'du_lessons', 'du_periods', 'du_subjects']) {
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
    // Boarding (backups from before it have none of these lists).
    const roomId = {};
    for (const r of list('rooms')) {
      roomId[r.id] = await ins('INSERT INTO du_rooms (madrasah_id, block, level, name, beds, teacher_id, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
        [mid, r.block || '', r.level || '', r.name, r.beds || 0, r.teacher_id, r.sort_order || 0]);
    }
    for (const p of list('roomPlaces')) {
      if (!roomId[p.room_id]) continue;
      await c.query('INSERT INTO du_room_places (student_id, madrasah_id, room_id) VALUES ($1,$2,$3) ON CONFLICT (student_id) DO NOTHING', [p.student_id, mid, roomId[p.room_id]]);
    }
    for (const w of list('homeWeekends')) {
      await c.query('INSERT INTO du_home_weekends (madrasah_id, name, starts, leave_time, ends, return_time) VALUES ($1,$2,$3,$4,$5,$6)',
        [mid, w.name || '', w.starts, w.leave_time || '', w.ends, w.return_time || '']);
    }
    for (const l of list('leaves')) {
      await c.query(
        `INSERT INTO du_leaves (madrasah_id, student_id, reason, collected_by, out_at, out_by, back_due, back_at, back_by)
         VALUES ($1,$2,$3,$4, COALESCE($5::timestamptz, now()), $6,$7, $8::timestamptz, $9)`,
        [mid, l.student_id, l.reason || '', l.collected_by || '', asText(l.out_at), l.out_by || '', l.back_due, asText(l.back_at), l.back_by || '']);
    }
    for (const n of list('nights')) {
      await c.query(`INSERT INTO du_night_register (madrasah_id, student_id, date, status, marked_by, marked_at)
                     VALUES ($1,$2,$3,$4,$5, COALESCE($6::timestamptz, now())) ON CONFLICT (student_id, date) DO NOTHING`,
        [mid, n.student_id, n.date, n.status, n.marked_by || '', asText(n.marked_at)]);
    }
    for (const h of list('health')) {
      await c.query(`INSERT INTO du_health_log (madrasah_id, student_id, at, kind, note, medicine, dose, by_name)
                     VALUES ($1,$2, COALESCE($3::timestamptz, now()), $4,$5,$6,$7,$8)`,
        [mid, h.student_id, asText(h.at), h.kind, h.note || '', h.medicine || '', h.dose || '', h.by_name || '']);
    }
  });
}

module.exports = { backup, restore };
