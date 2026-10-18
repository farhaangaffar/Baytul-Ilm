const { query, transaction } = require('../db');
const { requireAuth, isOwner, teacherClassNames, teachingClassNames } = require('../auth');

// quran_type: what the class studies — 'hifz' | 'nazira' | 'qaida', 'mixed' (each
// student's level is set individually), or null for none. It decides the Qur'aan
// progress fields on Daily records; a student's own level (quran_students.quran_type,
// server/routes/quran.js) overrides it.
let columnsReady = false;
async function ensureColumns() {
  if (columnsReady) return;
  await query('ALTER TABLE classes ADD COLUMN IF NOT EXISTS quran_type TEXT');
  await query('ALTER TABLE classes ADD COLUMN IF NOT EXISTS course_order INTEGER'); // a Darul Uloom's years (routes/course.js)
  columnsReady = true;
}
const QURAN_TYPES = ['hifz', 'nazira', 'qaida', 'mixed'];
const COLS = 'id, name, teacher_id AS "teacherId", quran_type AS "quranType", course_order AS "courseOrder"';

// A class's teacher must be one of the same madrasah's teachers.
async function teacherOk(teacherId, mid) {
  if (!teacherId) return true;
  const { rows } = await query('SELECT 1 FROM teachers WHERE id = $1 AND madrasah_id = $2', [teacherId, mid]);
  return rows.length > 0;
}

// A Darul Uloom's class can be one of its Aalim years (Classes & Teachers → Course: Aalim): coursePlace
// puts it at that place in the years (1 = first), 0 takes it out; the other years shift round it.
async function placeInCourse(mid, classId, at) {
  const { rows: [m] } = await query("SELECT kind = 'darul_uloom' AS du FROM madaaris WHERE id = $1", [mid]);
  if (!m?.du) return;
  await transaction(async c => {
    const { rows } = await c.query(
      'SELECT id FROM classes WHERE madrasah_id = $1 AND course_order IS NOT NULL AND id <> $2 ORDER BY course_order, name', [mid, classId]);
    const ids = rows.map(r => r.id);
    if (at > 0) ids.splice(Math.min(at, ids.length + 1) - 1, 0, classId);
    await c.query('UPDATE classes SET course_order = NULL WHERE madrasah_id = $1 AND (id = $2 OR course_order IS NOT NULL)', [mid, classId]);
    for (const [i, x] of ids.entries()) await c.query('UPDATE classes SET course_order = $1 WHERE id = $2 AND madrasah_id = $3', [i + 1, x, mid]);
    if (at > 0) await c.query('UPDATE classes SET quran_type = NULL WHERE id = $1 AND madrasah_id = $2', [classId, mid]);
  });
}
const placeOf = b => (b.coursePlace === undefined || b.coursePlace === null ? null : Math.max(0, Math.round(Number(b.coursePlace)) || 0));

// Single flat file, dispatching on ?id= for item ops — see students.js for why.
module.exports = requireAuth(async (req, res) => {
  const id = req.query.id;
  const mid = req.user.madrasahId;
  await ensureColumns();

  // Teachers (and class logins) only see their own classes, and can't change any.
  if (!isOwner(req)) {
    if (id || req.method !== 'GET') { res.status(403).json({ error: "You don't have access to this." }); return; }
    const names = [...await teacherClassNames(req.user), ...await teachingClassNames(req.user)]; // + a Darul Uloom teacher's Aalim years
    const { rows } = await query(`SELECT ${COLS} FROM classes WHERE madrasah_id = $1 AND name = ANY($2) ORDER BY course_order NULLS LAST, name`, [mid, names]);
    res.status(200).json(rows);
    return;
  }

  if (!id) {
    if (req.method === 'GET') {
      const { rows } = await query(`SELECT ${COLS} FROM classes WHERE madrasah_id = $1 ORDER BY course_order NULLS LAST, name`, [mid]);
      res.status(200).json(rows);
      return;
    }

    if (req.method === 'POST') {
      const b = req.body || {};
      if (!b.name) { res.status(400).json({ error: 'name is required' }); return; }
      if (!(await teacherOk(b.teacherId, mid))) { res.status(400).json({ error: 'Teacher not found' }); return; }
      const newId = b.id || 'C' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const { rows } = await query(
        `INSERT INTO classes (id, madrasah_id, name, teacher_id, quran_type) VALUES ($1,$2,$3,$4,$5) RETURNING ${COLS}`,
        [newId, mid, b.name, b.teacherId || null, QURAN_TYPES.includes(b.quranType) ? b.quranType : null]
      );
      if (placeOf(b)) await placeInCourse(mid, newId, placeOf(b));
      res.status(201).json(rows[0]);
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (req.method === 'PATCH') {
    const b = req.body || {};
    const { rows: existing } = await query('SELECT name FROM classes WHERE id = $1 AND madrasah_id = $2', [id, mid]);
    if (!existing.length) { res.status(404).json({ error: 'Class not found' }); return; }
    const oldName = existing[0].name;

    const sets = [];
    const values = [];
    if (b.name !== undefined) { values.push(b.name); sets.push(`name = $${values.length}`); }
    if (b.teacherId !== undefined) {
      if (!(await teacherOk(b.teacherId, mid))) { res.status(400).json({ error: 'Teacher not found' }); return; }
      values.push(b.teacherId || null); sets.push(`teacher_id = $${values.length}`);
    }
    if (b.quranType !== undefined) {
      values.push(QURAN_TYPES.includes(b.quranType) ? b.quranType : null); sets.push(`quran_type = $${values.length}`);
    }
    if (!sets.length && placeOf(b) === null) { res.status(400).json({ error: 'No valid fields to update' }); return; }
    if (sets.length) {
      values.push(id, mid);
      await query(`UPDATE classes SET ${sets.join(', ')} WHERE id = $${values.length - 1} AND madrasah_id = $${values.length}`, values);
    }
    if (placeOf(b) !== null) await placeInCourse(mid, id, placeOf(b));

    // students.class stores the class name as plain text, not a foreign key, so a
    // rename has to be cascaded manually or every student in that class becomes
    // orphaned (no longer matches any class tab in the UI).
    if (b.name !== undefined && b.name !== oldName) {
      await query('UPDATE students SET class = $1 WHERE class = $2 AND madrasah_id = $3', [b.name, oldName, mid]);
    }
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'DELETE') {
    // Its children (those who haven't left) move first — to ?moveTo=<another class> or 'Waiting list' —
    // so nobody is left in a class that no longer exists, where no page would show them.
    const { rows: [cls] } = await query('SELECT name FROM classes WHERE id = $1 AND madrasah_id = $2', [id, mid]);
    if (!cls) { res.status(404).json({ error: 'Class not found' }); return; }
    const { rows: [{ n }] } = await query(
      `SELECT count(*)::int AS n FROM students WHERE class = $1 AND madrasah_id = $2 AND status <> 'Inactive'`, [cls.name, mid]);
    if (n) {
      const to = String(req.query.moveTo || '');
      const { rows: target } = to === 'Waiting list' ? { rows: [1] }
        : await query('SELECT 1 FROM classes WHERE name = $1 AND madrasah_id = $2 AND id <> $3', [to, mid, id]);
      if (!to || !target.length) { res.status(409).json({ error: `Choose where its ${n} ${n === 1 ? 'child goes' : 'children go'} first.`, children: n }); return; }
      await query(
        `UPDATE students SET class = $1, status = CASE WHEN $1 = 'Waiting list' THEN 'Waiting list' ELSE status END
         WHERE class = $2 AND madrasah_id = $3 AND status <> 'Inactive'`, [to, cls.name, mid]);
    }
    await query('DELETE FROM classes WHERE id = $1 AND madrasah_id = $2', [id, mid]);
    // A Darul Uloom year's subjects and kitaabs go with it (routes/course.js).
    const { rows: [t] } = await query(`SELECT to_regclass('public.du_subjects') IS NOT NULL AS ok`);
    if (t.ok) await query('DELETE FROM du_subjects WHERE class_id = $1 AND madrasah_id = $2', [id, mid]);
    for (const table of ['du_lessons', 'du_lesson_logs']) { // the Darul Uloom timetable, where it exists
      const { rows: [tt] } = await query(`SELECT to_regclass('public.${table}') IS NOT NULL AS ok`);
      if (tt.ok) await query(`DELETE FROM ${table} WHERE class_id = $1 AND madrasah_id = $2`, [id, mid]);
    }
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}, { teacher: true });

// Used by the demo (server/demo.js) to make sure its tables exist before filling them.
module.exports.ensure = ensureColumns;
