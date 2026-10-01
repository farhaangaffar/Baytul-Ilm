const { query } = require('../db');
const { requireAuth, hashPassword, normalizeEmail, validateNewCredentials } = require('../auth');

// Teachers' logins, managed by the owner from the Classes & Teachers page. One login
// per teacher; the owner sets the email address and password and hands them over. The
// owner's own account is never listed or changed here.

function toClient(r) {
  return { id: String(r.id), email: r.email, teacherId: r.teacher_id, active: r.active };
}

async function emailTaken(email, exceptId) {
  const { rows } = await query('SELECT id FROM users WHERE email = $1 AND id <> $2', [email, exceptId || 0]);
  return rows.length > 0;
}

module.exports = requireAuth(async (req, res) => {
  const id = req.query.id;

  if (!id) {
    if (req.method === 'GET') {
      const { rows } = await query(`SELECT * FROM users WHERE role = 'teacher' ORDER BY email`);
      res.status(200).json(rows.map(toClient));
      return;
    }
    if (req.method === 'POST') {
      const b = req.body || {};
      const email = normalizeEmail(b.email);
      const problem = validateNewCredentials(email, b.password);
      if (problem) { res.status(400).json({ error: problem }); return; }
      const { rows: t } = await query('SELECT id FROM teachers WHERE id = $1', [b.teacherId]);
      if (!t.length) { res.status(400).json({ error: 'Teacher not found' }); return; }
      const { rows: existing } = await query('SELECT id FROM users WHERE teacher_id = $1', [b.teacherId]);
      if (existing.length) { res.status(409).json({ error: 'This teacher already has a login.' }); return; }
      if (await emailTaken(email)) { res.status(409).json({ error: 'That email address already has a login.' }); return; }
      const { rows } = await query(
        `INSERT INTO users (email, password_hash, role, teacher_id) VALUES ($1, $2, 'teacher', $3) RETURNING *`,
        [email, hashPassword(b.password), b.teacherId]
      );
      res.status(201).json(toClient(rows[0]));
      return;
    }
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { rows: found } = await query(`SELECT * FROM users WHERE id = $1 AND role = 'teacher'`, [id]);
  if (!found.length) { res.status(404).json({ error: 'Login not found' }); return; }

  if (req.method === 'PATCH') {
    const b = req.body || {};
    const sets = [];
    const values = [];
    let signOut = false;
    if (b.email !== undefined) {
      const email = normalizeEmail(b.email);
      const problem = validateNewCredentials(email, 'placeholder-long-enough');
      if (problem) { res.status(400).json({ error: problem }); return; }
      if (await emailTaken(email, id)) { res.status(409).json({ error: 'That email address already has a login.' }); return; }
      values.push(email); sets.push(`email = $${values.length}`);
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
    values.push(id);
    const { rows } = await query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`, values);
    res.status(200).json(toClient(rows[0]));
    return;
  }

  if (req.method === 'DELETE') {
    await query('DELETE FROM users WHERE id = $1', [id]);
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
});
