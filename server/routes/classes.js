const { query } = require('../db');
const { requireAuth, isOwner, teacherClassNames } = require('../auth');

// quran_type: what the class studies — 'hifz' | 'nazira' | 'qaida', 'mixed' (each
// student's level is set individually), or null for none. It decides the Qur'an
// progress fields on Daily records; a student's own level (quran_students.quran_type,
// server/routes/quran.js) overrides it.
let columnsReady = false;
async function ensureColumns() {
  if (columnsReady) return;
  await query('ALTER TABLE classes ADD COLUMN IF NOT EXISTS quran_type TEXT');
  columnsReady = true;
}
const QURAN_TYPES = ['hifz', 'nazira', 'qaida', 'mixed'];
const COLS = 'id, name, teacher_id AS "teacherId", quran_type AS "quranType"';

// A class's teacher must be one of the same madrasah's teachers.
async function teacherOk(teacherId, mid) {
  if (!teacherId) return true;
  const { rows } = await query('SELECT 1 FROM teachers WHERE id = $1 AND madrasah_id = $2', [teacherId, mid]);
  return rows.length > 0;
}

// Single flat file, dispatching on ?id= for item ops — see students.js for why.
module.exports = requireAuth(async (req, res) => {
  const id = req.query.id;
  const mid = req.user.madrasahId;
  await ensureColumns();

  // Teachers (and class logins) only see their own classes, and can't change any.
  if (!isOwner(req)) {
    if (id || req.method !== 'GET') { res.status(403).json({ error: "You don't have access to this." }); return; }
    const names = await teacherClassNames(req.user);
    const { rows } = await query(`SELECT ${COLS} FROM classes WHERE madrasah_id = $1 AND name = ANY($2) ORDER BY name`, [mid, names]);
    res.status(200).json(rows);
    return;
  }

  if (!id) {
    if (req.method === 'GET') {
      const { rows } = await query(`SELECT ${COLS} FROM classes WHERE madrasah_id = $1 ORDER BY name`, [mid]);
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
    if (!sets.length) { res.status(400).json({ error: 'No valid fields to update' }); return; }
    values.push(id, mid);
    await query(`UPDATE classes SET ${sets.join(', ')} WHERE id = $${values.length - 1} AND madrasah_id = $${values.length}`, values);

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
    await query('DELETE FROM classes WHERE id = $1 AND madrasah_id = $2', [id, mid]);
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}, { teacher: true });

// Used by the demo (server/demo.js) to make sure its tables exist before filling them.
module.exports.ensure = ensureColumns;
