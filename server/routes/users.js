const { query } = require('../db');
const { requireAuth, hashPassword, normalizeLogin, validateLogin, validateNewCredentials } = require('../auth');

// Teacher logins, managed by a madrasah's owner from the Classes & Teachers page. A
// login belongs either to one teacher (covering the classes assigned to them) or to
// one class (a shared login, e.g. "class1", that whoever is teaching that class uses).
// The owner sets the username and password and hands them over. Owner accounts are
// never listed or changed here. Everything is limited to the owner's own madrasah.

function toClient(r) {
  return { id: String(r.id), login: r.login, teacherId: r.teacher_id, classId: r.class_id, active: r.active };
}

async function loginTaken(mid, login, exceptId) {
  const { rows } = await query('SELECT id FROM users WHERE madrasah_id = $1 AND login = $2 AND id <> $3', [mid, login, exceptId || 0]);
  return rows.length > 0;
}

const TAKEN = 'That username is already in use at this madrasah — try another.';

module.exports = requireAuth(async (req, res) => {
  const mid = req.user.madrasahId;
  const id = req.query.id;

  if (!id) {
    if (req.method === 'GET') {
      const { rows } = await query(`SELECT * FROM users WHERE madrasah_id = $1 AND role = 'teacher' ORDER BY login`, [mid]);
      res.status(200).json(rows.map(toClient));
      return;
    }
    if (req.method === 'POST') {
      const b = req.body || {};
      const login = normalizeLogin(b.login);
      const problem = validateNewCredentials(login, b.password);
      if (problem) { res.status(400).json({ error: problem }); return; }
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

  const { rows: found } = await query(`SELECT * FROM users WHERE id = $1 AND madrasah_id = $2 AND role = 'teacher'`, [id, mid]);
  if (!found.length) { res.status(404).json({ error: 'Login not found' }); return; }

  if (req.method === 'PATCH') {
    const b = req.body || {};
    const sets = [];
    const values = [];
    let signOut = false;
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
    if (!sets.length) { res.status(400).json({ error: 'No valid fields to update' }); return; }
    if (signOut) sets.push('session_version = session_version + 1');
    values.push(id, mid);
    const { rows } = await query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${values.length - 1} AND madrasah_id = $${values.length} RETURNING *`, values);
    res.status(200).json(toClient(rows[0]));
    return;
  }

  if (req.method === 'DELETE') {
    await query(`DELETE FROM users WHERE id = $1 AND madrasah_id = $2 AND role = 'teacher'`, [id, mid]);
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
});
