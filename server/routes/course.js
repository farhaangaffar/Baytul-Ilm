const { query, transaction } = require('../db');
const { requireAuth } = require('../auth');

// A Darul Uloom's course (the Course page, src/pages/Course.js): its year groups in order,
// each year's subjects and kitaabs with who teaches them, and moving everyone up a year.
// A year group is an ordinary class with a place in the course (classes.course_order), so
// attendance, fees, logins and reports all work for it as they do for any class; classes
// outside the course (e.g. Hifdh) have no course_order. Only for a Darul Uloom (madaaris.kind).
//
// GET                         → { years, others, subjects, starter, kitaabs, lastMove }
// POST ?action=starter        → adds the usual Dars-e-Nizami years (those not there yet) and their kitaabs
// POST ?action=years {ids}    → these classes, in this order, are the course years (the rest aren't)
// POST ?action=year {classId?, name, teacherId, position} → adds a year (a new class) or changes one —
//                               its name, teacher and place (1 = first year); 0 takes it out of the course
// POST {classId, subject, kitaab, teacherId}  → adds a subject; PATCH ?id= changes it; DELETE ?id= removes it
// POST ?action=move-up {holdBack: [studentIds]} → everyone up a year; the last year finish (marked left)
// POST ?action=undo-move      → puts the last move back

let ready = false;
async function ensure() {
  if (ready) return;
  await query('ALTER TABLE classes ADD COLUMN IF NOT EXISTS course_order INTEGER');
  await query(`CREATE TABLE IF NOT EXISTS du_subjects (
    id          BIGSERIAL PRIMARY KEY,
    madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
    class_id    TEXT NOT NULL,
    subject     TEXT NOT NULL,
    kitaab      TEXT NOT NULL DEFAULT '',
    teacher_id  TEXT,
    sort_order  INTEGER NOT NULL DEFAULT 0
  )`);
  await query('CREATE INDEX IF NOT EXISTS idx_du_subjects_madrasah ON du_subjects (madrasah_id, class_id)');
  // Each "move everyone up", so it can be undone: changes = [{ id, fromClass, toClass, fromStatus, toStatus, fromLeave, toLeave }].
  await query(`CREATE TABLE IF NOT EXISTS du_year_moves (
    id          BIGSERIAL PRIMARY KEY,
    madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
    moved_at    TIMESTAMP NOT NULL DEFAULT now(),
    undone      BOOLEAN NOT NULL DEFAULT false,
    changes     JSONB NOT NULL
  )`);
  ready = true;
}

// The usual Dars-e-Nizami years and kitaabs — a starting point each Darul Uloom changes to suit itself.
const STARTER = [
  { name: '1st year', subjects: [
    ['Nahw', 'Nahw Meer'], ['Sarf', 'Ilm-us-Sarf'], ['Arabic language', "Durus-ul-Lughah al-'Arabiyyah"],
    ['Fiqh', 'Nur-ul-Idah'], ['Tajweed', "Jamal-ul-Qur'an"], ['Seerah', 'Qasas-un-Nabiyyin'],
  ] },
  { name: '2nd year', subjects: [
    ['Nahw', 'Hidayat-un-Nahw'], ['Sarf', 'Ilm-us-Sighah'], ['Fiqh', 'Mukhtasar al-Quduri'],
    ['Arabic literature', "Al-Qira'at ar-Rashidah"], ["Tarjamat-ul-Qur'an", "Tarjamat-ul-Qur'an"],
    ['Mantiq', 'Taysir al-Mantiq'], ['Hadith', 'Zad-ut-Talibin'],
  ] },
  { name: '3rd year', subjects: [
    ['Nahw', 'Kafiyah'], ['Fiqh', "Kanz-ud-Daqa'iq"], ['Usul-ul-Fiqh', 'Usul-ush-Shashi'],
    ['Arabic literature', 'Nafhat-ul-Arab'], ['Hadith', 'Riyad-us-Salihin'],
    ["Tarjamat-ul-Qur'an", "Tarjamat-ul-Qur'an"], ['Mantiq', 'Mirqat'],
  ] },
  { name: '4th year', subjects: [
    ['Fiqh', 'Sharh-ul-Wiqayah'], ['Usul-ul-Fiqh', 'Nur-ul-Anwar'], ['Nahw', 'Sharh Jami'],
    ['Arabic literature', 'Mukhtarat'], ["Tarjamat-ul-Qur'an", "Tarjamat-ul-Qur'an"], ['Mirath', 'As-Sirajiyyah'],
  ] },
  { name: '5th year', subjects: [
    ['Fiqh', 'Al-Hidayah (1st & 2nd)'], ['Tafsir', 'Tafsir al-Jalalayn'], ['Usul-ut-Tafsir', 'Al-Fawz al-Kabir'],
    ['Balaghah', "Mukhtasar-ul-Ma'ani"], ['Usul-ul-Fiqh', 'Al-Husami'], ['Aqeedah', 'Al-Aqeedah at-Tahawiyyah'],
  ] },
  { name: '6th year', subjects: [
    ['Hadith', 'Mishkat-ul-Masabih'], ['Fiqh', 'Al-Hidayah (3rd & 4th)'], ['Usul-ul-Hadith', 'Sharh Nukhbat-ul-Fikar'],
    ['Aqeedah', "Sharh-ul-Aqa'id"], ['Tafsir', 'Tafsir al-Baydawi'],
  ] },
  { name: 'Dawrah al-Hadith', subjects: [
    ['Hadith', 'Sahih al-Bukhari'], ['Hadith', 'Sahih Muslim'], ['Hadith', "Jami' at-Tirmidhi"],
    ['Hadith', 'Sunan Abi Dawud'], ['Hadith', "Sunan an-Nasa'i"], ['Hadith', 'Sunan Ibn Majah'],
    ['Hadith', "Muwatta' Imam Malik"], ['Hadith', "Muwatta' Imam Muhammad"], ['Hadith', "Sharh Ma'ani-l-Athar"],
    ['Hadith', "Shama'il at-Tirmidhi"],
  ] },
];

const ukToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
const clean = (v, max = 120) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);

async function isDarulUloom(mid) {
  const { rows } = await query('SELECT kind FROM madaaris WHERE id = $1', [mid]);
  return rows[0]?.kind === 'darul_uloom';
}

// A subject's teacher must be one of the same madrasah's teachers.
async function teacherOk(teacherId, mid) {
  if (!teacherId) return true;
  const { rows } = await query('SELECT 1 FROM teachers WHERE id = $1 AND madrasah_id = $2', [teacherId, mid]);
  return rows.length > 0;
}

async function courseYears(db, mid) {
  const { rows } = await db.query(
    'SELECT id, name FROM classes WHERE madrasah_id = $1 AND course_order IS NOT NULL ORDER BY course_order, name', [mid]);
  return rows;
}

module.exports = requireAuth(async (req, res) => {
  const mid = req.user.madrasahId;
  const { action, id } = req.query;
  await ensure();
  if (!(await isDarulUloom(mid))) { res.status(403).json({ error: 'This is only for a Darul Uloom.' }); return; }

  if (req.method === 'GET') {
    const { rows: classes } = await query(
      `SELECT id, name, teacher_id AS "teacherId", course_order AS "courseOrder" FROM classes
       WHERE madrasah_id = $1 ORDER BY course_order NULLS LAST, name`, [mid]);
    const { rows: subjects } = await query(
      `SELECT s.id::text, s.class_id AS "classId", s.subject, s.kitaab, s.teacher_id AS "teacherId"
       FROM du_subjects s JOIN classes c ON c.id = s.class_id AND c.madrasah_id = s.madrasah_id
       WHERE s.madrasah_id = $1 ORDER BY s.sort_order, s.id`, [mid]);
    const { rows: [move] } = await query(
      `SELECT id::text, to_char(moved_at, 'YYYY-MM-DD') AS "movedOn", jsonb_array_length(changes) AS count
       FROM du_year_moves WHERE madrasah_id = $1 AND NOT undone ORDER BY id DESC LIMIT 1`, [mid]);
    // Kitaabs to suggest for each subject: the starter list's and any this madrasah has typed itself.
    const kitaabs = {};
    const addK = (s, k) => { if (s && k) (kitaabs[s] = kitaabs[s] || new Set()).add(k); };
    STARTER.forEach(y => y.subjects.forEach(([s, k]) => addK(s, k)));
    subjects.forEach(s => addK(s.subject, s.kitaab));
    res.status(200).json({
      years: classes.filter(c => c.courseOrder !== null),
      others: classes.filter(c => c.courseOrder === null),
      subjects,
      starter: STARTER.map(y => y.name),
      kitaabs: Object.fromEntries(Object.entries(kitaabs).map(([s, set]) => [s, [...set].sort()])),
      lastMove: move ? { ...move, count: Number(move.count) } : null,
    });
    return;
  }

  if (req.method === 'POST' && action === 'starter') {
    // Adds the starter years after any years already in the course; a year whose name is already
    // a class is put into the course as it is (its subjects are only added if it has none).
    const added = await transaction(async c => {
      const { rows: [{ max }] } = await c.query('SELECT COALESCE(max(course_order), 0) AS max FROM classes WHERE madrasah_id = $1', [mid]);
      let order = Number(max);
      let n = 0;
      for (const y of STARTER) {
        const { rows: found } = await c.query('SELECT id, course_order FROM classes WHERE madrasah_id = $1 AND lower(name) = lower($2)', [mid, y.name]);
        let classId;
        if (found.length) {
          classId = found[0].id;
          if (found[0].course_order === null) await c.query('UPDATE classes SET course_order = $1 WHERE id = $2 AND madrasah_id = $3', [++order, classId, mid]);
        } else {
          classId = 'C' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
          await c.query('INSERT INTO classes (id, madrasah_id, name, course_order) VALUES ($1,$2,$3,$4)', [classId, mid, y.name, ++order]);
          n++;
        }
        const { rows: has } = await c.query('SELECT 1 FROM du_subjects WHERE madrasah_id = $1 AND class_id = $2 LIMIT 1', [mid, classId]);
        if (!has.length) {
          for (const [i, [subject, kitaab]] of y.subjects.entries()) {
            await c.query('INSERT INTO du_subjects (madrasah_id, class_id, subject, kitaab, sort_order) VALUES ($1,$2,$3,$4,$5)',
              [mid, classId, subject, kitaab, i]);
          }
        }
      }
      return n;
    });
    res.status(200).json({ ok: true, added });
    return;
  }

  if (req.method === 'POST' && action === 'years') {
    const ids = (req.body || {}).ids;
    if (!Array.isArray(ids) || ids.some(x => typeof x !== 'string')) { res.status(400).json({ error: 'ids[] is required' }); return; }
    await transaction(async c => {
      await c.query('UPDATE classes SET course_order = NULL WHERE madrasah_id = $1', [mid]);
      for (const [i, classId] of ids.entries()) {
        await c.query('UPDATE classes SET course_order = $1 WHERE id = $2 AND madrasah_id = $3', [i + 1, classId, mid]);
      }
    });
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'POST' && action === 'year') {
    const b = req.body || {};
    const name = clean(b.name, 60);
    if (!name) { res.status(400).json({ error: "Enter the year's name." }); return; }
    if (!(await teacherOk(b.teacherId, mid))) { res.status(400).json({ error: 'Teacher not found' }); return; }
    const result = await transaction(async c => {
      const { rows: clash } = await c.query('SELECT id FROM classes WHERE madrasah_id = $1 AND lower(name) = lower($2) AND id <> $3',
        [mid, name, String(b.classId || '')]);
      if (clash.length) return { error: 'There is already a class with that name.' };
      let classId = b.classId ? String(b.classId) : null;
      if (classId) {
        const { rows: [old] } = await c.query('SELECT name FROM classes WHERE id = $1 AND madrasah_id = $2', [classId, mid]);
        if (!old) return { error: 'Year not found' };
        await c.query('UPDATE classes SET name = $1, teacher_id = $2 WHERE id = $3 AND madrasah_id = $4', [name, b.teacherId || null, classId, mid]);
        // students.class holds the name, so a rename moves its students with it (as routes/classes.js does).
        if (old.name !== name) await c.query('UPDATE students SET class = $1 WHERE class = $2 AND madrasah_id = $3', [name, old.name, mid]);
      } else {
        classId = 'C' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        await c.query('INSERT INTO classes (id, madrasah_id, name, teacher_id) VALUES ($1,$2,$3,$4)', [classId, mid, name, b.teacherId || null]);
      }
      // Its place: the course years in order, with this one put at `position` (0 = out of the course).
      const ids = (await courseYears(c, mid)).map(y => y.id).filter(x => x !== classId);
      const at = Number(b.position);
      if (at > 0) ids.splice(Math.min(at, ids.length + 1) - 1, 0, classId);
      else if (b.position === undefined || b.position === null) ids.push(classId);
      await c.query('UPDATE classes SET course_order = NULL WHERE madrasah_id = $1', [mid]);
      for (const [i, x] of ids.entries()) await c.query('UPDATE classes SET course_order = $1 WHERE id = $2 AND madrasah_id = $3', [i + 1, x, mid]);
      return { id: classId };
    });
    if (result.error) { res.status(400).json({ error: result.error }); return; }
    res.status(200).json({ ok: true, ...result });
    return;
  }

  if (req.method === 'POST' && action === 'reorder-subjects') {
    const ids = (req.body || {}).ids;
    if (!Array.isArray(ids) || ids.some(x => !/^\d+$/.test(String(x)))) { res.status(400).json({ error: 'ids[] is required' }); return; }
    await transaction(async c => {
      for (const [i, sid] of ids.entries()) await c.query('UPDATE du_subjects SET sort_order = $1 WHERE id = $2 AND madrasah_id = $3', [i, sid, mid]);
    });
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'POST' && action === 'move-up') {
    const holdBack = new Set(((req.body || {}).holdBack || []).map(String));
    const today = ukToday();
    const result = await transaction(async c => {
      const years = await courseYears(c, mid);
      if (!years.length) return { error: 'Set up the course years first.' };
      const last = years.length - 1;
      const { rows: students } = await c.query(
        `SELECT id, class, status, to_char(leave_date, 'YYYY-MM-DD') AS leave FROM students
         WHERE madrasah_id = $1 AND status = 'Active' AND class = ANY($2)`, [mid, years.map(y => y.name)]);
      const changes = [];
      for (const s of students) {
        if (holdBack.has(String(s.id))) continue;
        const k = years.findIndex(y => y.name === s.class);
        if (k < last) changes.push({ id: s.id, fromClass: s.class, toClass: years[k + 1].name, fromStatus: s.status, toStatus: s.status, fromLeave: s.leave, toLeave: s.leave });
        else changes.push({ id: s.id, fromClass: s.class, toClass: s.class, fromStatus: s.status, toStatus: 'Inactive', fromLeave: s.leave, toLeave: today });
      }
      if (!changes.length) return { error: 'There is no one to move up.' };
      for (const ch of changes) {
        await c.query('UPDATE students SET class = $1, status = $2, leave_date = $3 WHERE id = $4 AND madrasah_id = $5',
          [ch.toClass, ch.toStatus, ch.toLeave, ch.id, mid]);
      }
      await c.query('INSERT INTO du_year_moves (madrasah_id, changes) VALUES ($1, $2)', [mid, JSON.stringify(changes)]);
      return {
        moved: changes.filter(ch => ch.toStatus === 'Active').length,
        finished: changes.filter(ch => ch.toStatus === 'Inactive').length,
      };
    });
    if (result.error) { res.status(400).json({ error: result.error }); return; }
    res.status(200).json({ ok: true, ...result });
    return;
  }

  if (req.method === 'POST' && action === 'undo-move') {
    // Puts back everyone in the last move who hasn't been changed since.
    const result = await transaction(async c => {
      const { rows: [move] } = await c.query(
        'SELECT id, changes FROM du_year_moves WHERE madrasah_id = $1 AND NOT undone ORDER BY id DESC LIMIT 1 FOR UPDATE', [mid]);
      if (!move) return { error: 'There is no move to undo.' };
      let n = 0;
      for (const ch of move.changes) {
        const { rowCount } = await c.query(
          `UPDATE students SET class = $1, status = $2, leave_date = $3
           WHERE id = $4 AND madrasah_id = $5 AND class = $6 AND status = $7 AND leave_date IS NOT DISTINCT FROM $8::date`,
          [ch.fromClass, ch.fromStatus, ch.fromLeave, ch.id, mid, ch.toClass, ch.toStatus, ch.toLeave]);
        n += rowCount;
      }
      await c.query('UPDATE du_year_moves SET undone = true WHERE id = $1 AND madrasah_id = $2', [move.id, mid]);
      return { restored: n, skipped: move.changes.length - n };
    });
    if (result.error) { res.status(400).json({ error: result.error }); return; }
    res.status(200).json({ ok: true, ...result });
    return;
  }

  if (req.method === 'POST' && !action) {
    const b = req.body || {};
    const subject = clean(b.subject, 80), kitaab = clean(b.kitaab, 120);
    if (!subject) { res.status(400).json({ error: 'Enter the subject.' }); return; }
    const { rows: cls } = await query('SELECT 1 FROM classes WHERE id = $1 AND madrasah_id = $2', [String(b.classId || ''), mid]);
    if (!cls.length) { res.status(400).json({ error: 'Year not found' }); return; }
    if (!(await teacherOk(b.teacherId, mid))) { res.status(400).json({ error: 'Teacher not found' }); return; }
    const { rows: [row] } = await query(
      `INSERT INTO du_subjects (madrasah_id, class_id, subject, kitaab, teacher_id, sort_order)
       VALUES ($1, $2, $3, $4, $5, (SELECT COALESCE(max(sort_order), -1) + 1 FROM du_subjects WHERE madrasah_id = $1 AND class_id = $2))
       RETURNING id::text`, [mid, b.classId, subject, kitaab, b.teacherId || null]);
    res.status(201).json({ ok: true, id: row.id });
    return;
  }

  if (id && !/^\d+$/.test(String(id))) { res.status(400).json({ error: 'Subject not found' }); return; }

  if (req.method === 'PATCH' && id) {
    const b = req.body || {};
    const sets = [], values = [];
    if (b.subject !== undefined) {
      const subject = clean(b.subject, 80);
      if (!subject) { res.status(400).json({ error: 'Enter the subject.' }); return; }
      values.push(subject); sets.push(`subject = $${values.length}`);
    }
    if (b.kitaab !== undefined) { values.push(clean(b.kitaab, 120)); sets.push(`kitaab = $${values.length}`); }
    if (b.teacherId !== undefined) {
      if (!(await teacherOk(b.teacherId, mid))) { res.status(400).json({ error: 'Teacher not found' }); return; }
      values.push(b.teacherId || null); sets.push(`teacher_id = $${values.length}`);
    }
    if (!sets.length) { res.status(400).json({ error: 'Nothing to change' }); return; }
    values.push(id, mid);
    await query(`UPDATE du_subjects SET ${sets.join(', ')} WHERE id = $${values.length - 1} AND madrasah_id = $${values.length}`, values);
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'DELETE' && id) {
    await query('DELETE FROM du_subjects WHERE id = $1 AND madrasah_id = $2', [id, mid]);
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
});

module.exports.ensure = ensure;
module.exports.STARTER = STARTER; // the Darul Uloom demo uses the same years and kitaabs // server/demo.js makes sure the tables exist before deleting a madrasah
