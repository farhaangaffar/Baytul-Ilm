const { query } = require('../db');
const { requireAuth, hashPassword, normalizeLogin, validateLogin, validateNewCredentials } = require('../auth');
const { ensureParentTables } = require('../parents');

// Logins managed by a madrasah's owner. Staff logins (Classes & Teachers) belong either
// to one teacher (covering the classes assigned to them) or to one class (a shared
// login, e.g. "class1", that whoever is teaching that class uses). Parent logins
// (from a student's profile) belong to one family and cover each of their children.
// The owner sets the username and password and hands them over. Owner accounts are
// never listed or changed here. Everything is limited to the owner's own madrasah.

function toClient(r, links = {}) {
  const out = { id: String(r.id), login: r.login, role: r.role, teacherId: r.teacher_id, classId: r.class_id, active: r.active };
  if (r.role === 'parent') out.studentIds = links[String(r.id)] || [];
  return out;
}

async function loginTaken(mid, login, exceptId) {
  const { rows } = await query('SELECT id FROM users WHERE madrasah_id = $1 AND login = $2 AND id <> $3', [mid, login, exceptId || 0]);
  return rows.length > 0;
}

// A parent's children must all be students of this madrasah.
async function validChildren(mid, ids) {
  if (!Array.isArray(ids) || !ids.length) return null;
  const unique = [...new Set(ids.map(String))];
  const { rows } = await query('SELECT id FROM students WHERE id = ANY($1) AND madrasah_id = $2', [unique, mid]);
  return rows.length === unique.length ? unique : null;
}

async function setChildren(userId, mid, ids) {
  await query('DELETE FROM parent_students WHERE user_id = $1 AND madrasah_id = $2', [userId, mid]);
  for (const sid of ids) {
    await query('INSERT INTO parent_students (user_id, student_id, madrasah_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [userId, sid, mid]);
  }
}

const TAKEN = 'That username is already in use at this madrasah — try another.';
const MANAGED = `role IN ('teacher', 'parent')`;

module.exports = requireAuth(async (req, res) => {
  await ensureParentTables();
  const mid = req.user.madrasahId;
  const id = req.query.id;
  // A demo's logins are made up; nobody can add, change or remove them there.
  if (req.user.demo && req.method !== 'GET') { res.status(403).json({ error: "Logins can't be added or changed in the demo." }); return; }

  if (!id) {
    if (req.method === 'GET') {
      const [{ rows }, { rows: linkRows }] = await Promise.all([
        query(`SELECT * FROM users WHERE madrasah_id = $1 AND ${MANAGED} ORDER BY login`, [mid]),
        query('SELECT user_id, student_id FROM parent_students WHERE madrasah_id = $1', [mid]),
      ]);
      const links = {};
      linkRows.forEach(l => { (links[String(l.user_id)] = links[String(l.user_id)] || []).push(l.student_id); });
      res.status(200).json(rows.map(r => toClient(r, links)));
      return;
    }
    if (req.method === 'POST') {
      const b = req.body || {};
      const login = normalizeLogin(b.login);
      const problem = validateNewCredentials(login, b.password);
      if (problem) { res.status(400).json({ error: problem }); return; }

      if (b.kind === 'parent') {
        const children = await validChildren(mid, b.studentIds);
        if (!children) { res.status(400).json({ error: 'Choose at least one of their children.' }); return; }
        if (await loginTaken(mid, login)) { res.status(409).json({ error: TAKEN }); return; }
        const { rows } = await query(
          `INSERT INTO users (madrasah_id, login, password_hash, role) VALUES ($1, $2, $3, 'parent') RETURNING *`,
          [mid, login, hashPassword(b.password)]
        );
        await setChildren(rows[0].id, mid, children);
        res.status(201).json(toClient(rows[0], { [String(rows[0].id)]: children }));
        return;
      }

      if (!!b.teacherId === !!b.classId) { res.status(400).json({ error: 'A login is for one teacher or one class.' }); return; }
      if (b.teacherId) {
        const { rows: t } = await query('SELECT id FROM teachers WHERE id = $1 AND madrasah_id = $2', [b.teacherId, mid]);
        if (!t.length) { res.status(400).json({ error: 'Teacher not found' }); return; }
        const { rows: existing } = await query('SELECT id FROM users WHERE teacher_id = $1', [b.teacherId]);
        if (existing.length) { res.status(409).json({ error: 'This teacher already has a login.' }); return; }
      } else {
        const { rows: c } = await query('SELECT id FROM classes WHERE id = $1 AND madrasah_id = $2', [b.classId, mid]);
        if (!c.length) { res.status(400).json({ error: 'Class not found' }); return; }
        const { rows: existing } = await query('SELECT id FROM users WHERE class_id = $1', [b.classId]);
        if (existing.length) { res.status(409).json({ error: 'This class already has a login.' }); return; }
      }
      if (await loginTaken(mid, login)) { res.status(409).json({ error: TAKEN }); return; }
      const { rows } = await query(
        `INSERT INTO users (madrasah_id, login, password_hash, role, teacher_id, class_id) VALUES ($1, $2, $3, 'teacher', $4, $5) RETURNING *`,
        [mid, login, hashPassword(b.password), b.teacherId || null, b.classId || null]
      );
      res.status(201).json(toClient(rows[0]));
      return;
    }
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { rows: found } = await query(`SELECT * FROM users WHERE id = $1 AND madrasah_id = $2 AND ${MANAGED}`, [id, mid]);
  if (!found.length) { res.status(404).json({ error: 'Login not found' }); return; }
  const isParent = found[0].role === 'parent';

  if (req.method === 'PATCH') {
    const b = req.body || {};
    const sets = [];
    const values = [];
    let signOut = false;
    let children = null;
    if (b.studentIds !== undefined) {
      if (!isParent) { res.status(400).json({ error: 'Only parent logins have children.' }); return; }
      children = await validChildren(mid, b.studentIds);
      if (!children) { res.status(400).json({ error: 'Choose at least one of their children.' }); return; }
    }
    if (b.login !== undefined) {
      const login = normalizeLogin(b.login);
      const problem = validateLogin(login);
      if (problem) { res.status(400).json({ error: problem }); return; }
      if (await loginTaken(mid, login, id)) { res.status(409).json({ error: TAKEN }); return; }
      values.push(login); sets.push(`login = $${values.length}`);
    }
    if (b.password !== undefined) {
      if (String(b.password).length < 8) { res.status(400).json({ error: 'Password must be at least 8 characters.' }); return; }
      values.push(hashPassword(b.password)); sets.push(`password_hash = $${values.length}`);
      signOut = true;
    }
    if (b.active !== undefined) {
      values.push(!!b.active); sets.push(`active = $${values.length}`);
      if (!b.active) signOut = true;
    }
    if (!sets.length && !children) { res.status(400).json({ error: 'No valid fields to update' }); return; }
    if (sets.length) {
      if (signOut) sets.push('session_version = session_version + 1');
      values.push(id, mid);
      await query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${values.length - 1} AND madrasah_id = $${values.length}`, values);
    }
    if (children) await setChildren(id, mid, children);
    const { rows } = await query('SELECT * FROM users WHERE id = $1', [id]);
    const { rows: linkRows } = await query('SELECT student_id FROM parent_students WHERE user_id = $1', [id]);
    res.status(200).json(toClient(rows[0], { [String(id)]: linkRows.map(l => l.student_id) }));
    return;
  }

  if (req.method === 'DELETE') {
    await query(`DELETE FROM users WHERE id = $1 AND madrasah_id = $2 AND ${MANAGED}`, [id, mid]);
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
});
