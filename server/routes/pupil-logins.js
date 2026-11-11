const { query, transaction } = require('../db');
const { requireAuth, hashPassword, normalizeLogin, validateLogin } = require('../auth');
const { ensurePupilTables } = require('../pupils');

// Pupil logins (a school only; the head — Head of Islamic Studies). The school gives each pupil their own username and
// password; the head types them in on the pupil's card, or imports a whole class from a spreadsheet (Pupils → Pupil
// logins). Passwords are only ever stored hashed.
//   GET                          every pupil login: { studentId, login, active, lastLoginAt, resting }
//   POST {studentId, login, password?}   add one, or change its username / password (a new password signs them out)
//   POST ?action=import {rows: [{studentId, login, password}]}   many at once; returns what was added, changed, skipped
//   POST ?action=active {studentId, active}   switch a login off or back on
//   DELETE ?studentId=           remove it

const MIN_PASSWORD = 4; // the school's own passwords — often short for young pupils; wrong guesses rest the login
const badPassword = p => (String(p || '').length < MIN_PASSWORD ? `Passwords need at least ${MIN_PASSWORD} characters.` : null);

async function isSchool(mid) {
  const { rows: [m] } = await query('SELECT kind FROM madaaris WHERE id = $1', [mid]);
  return m?.kind === 'school';
}

// One pupil's login: added or changed. Returns an error message, or { added | changed }.
async function setLogin(c, mid, pupils, row) {
  const sid = String(row.studentId || '');
  if (!pupils.has(sid)) return { error: 'Pupil not found.' };
  const login = normalizeLogin(row.login);
  const problem = validateLogin(login);
  if (problem) return { error: problem };
  const { rows: [taken] } = await c.query('SELECT id, student_id FROM users WHERE madrasah_id = $1 AND login = $2', [mid, login]);
  if (taken && taken.student_id !== sid) return { error: `The username "${login}" is already in use at your school.` };
  const { rows: [mine] } = await c.query(`SELECT id FROM users WHERE madrasah_id = $1 AND student_id = $2 AND role = 'pupil'`, [mid, sid]);
  const password = row.password ? String(row.password) : '';
  if (mine) {
    if (password && badPassword(password)) return { error: badPassword(password) };
    await c.query(
      `UPDATE users SET login = $1${password ? ', password_hash = $4, session_version = session_version + 1, failed_logins = 0, locked_until = NULL' : ''}
       WHERE id = $2 AND madrasah_id = $3`, password ? [login, mine.id, mid, hashPassword(password)] : [login, mine.id, mid]);
    return { changed: true };
  }
  if (badPassword(password)) return { error: password ? badPassword(password) : 'Type their password.' };
  await c.query(`INSERT INTO users (madrasah_id, login, password_hash, role, student_id) VALUES ($1, $2, $3, 'pupil', $4)`,
    [mid, login, hashPassword(password), sid]);
  return { added: true };
}

module.exports = requireAuth(async (req, res) => {
  await ensurePupilTables();
  const mid = req.user.madrasahId;
  if (!(await isSchool(mid))) { res.status(403).json({ error: 'Pupil logins are for a school.' }); return; }
  if (req.user.demo && req.method !== 'GET') { res.status(403).json({ error: "Logins can't be added or changed in the demo." }); return; }
  const { rows: known } = await query('SELECT id FROM students WHERE madrasah_id = $1', [mid]);
  const pupils = new Set(known.map(r => r.id));
  const action = req.query.action;

  if (req.method === 'GET') {
    const { rows } = await query(
      `SELECT student_id AS "studentId", login, active, last_login_at AS "lastLoginAt",
         (locked_until IS NOT NULL AND locked_until > now()) AS resting
       FROM users WHERE madrasah_id = $1 AND role = 'pupil' ORDER BY login`, [mid]);
    res.status(200).json(rows);
    return;
  }

  if (req.method === 'POST' && action === 'import') {
    const list = Array.isArray((req.body || {}).rows) ? req.body.rows.slice(0, 2000) : [];
    const out = { added: 0, changed: 0, skipped: [] };
    // Each row on its own, so one bad row (a username in use) doesn't stop the rest.
    for (const row of list) {
      try {
        const r = await transaction(c => setLogin(c, mid, pupils, row));
        if (r.error) out.skipped.push({ studentId: String(row.studentId || ''), login: String(row.login || ''), reason: r.error });
        else if (r.added) out.added += 1; else out.changed += 1;
      } catch (e) {
        out.skipped.push({ studentId: String(row.studentId || ''), login: String(row.login || ''), reason: 'Could not save.' });
      }
    }
    res.status(200).json(out);
    return;
  }

  if (req.method === 'POST' && action === 'active') {
    const b = req.body || {};
    const sid = String(b.studentId || '');
    if (!pupils.has(sid)) { res.status(404).json({ error: 'Pupil not found.' }); return; }
    await query(`UPDATE users SET active = $1, session_version = session_version + 1 WHERE madrasah_id = $2 AND student_id = $3 AND role = 'pupil'`,
      [!!b.active, mid, sid]);
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'POST' && !action) {
    try {
      const r = await transaction(c => setLogin(c, mid, pupils, req.body || {}));
      if (r.error) { res.status(400).json({ error: r.error }); return; }
      res.status(200).json({ ok: true, ...r });
    } catch (e) {
      if (e.code === '23505') { res.status(400).json({ error: 'That username is already in use at your school.' }); return; }
      throw e;
    }
    return;
  }

  if (req.method === 'DELETE') {
    const sid = String(req.query.studentId || '');
    if (!pupils.has(sid)) { res.status(404).json({ error: 'Pupil not found.' }); return; }
    await query(`DELETE FROM users WHERE madrasah_id = $1 AND student_id = $2 AND role = 'pupil'`, [mid, sid]);
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
});
