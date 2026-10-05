const { query, transaction } = require('../db');
const { requireAuth, hashPassword, normalizeLogin, validateNewCredentials } = require('../auth');

// The platform owner's page (Madaaris): every madrasah using this service, with
// counts only — never another madrasah's students, fees or reports. From here the
// platform owner adds a madrasah (with its head's first login), renames it or changes
// its sign-in code, switches it off or back on, and resets its head's password.
// Only the platform owner gets past the check below.

const CODE_RE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;
const CODE_PROBLEM = 'The madrasah code is 3–30 lowercase letters, numbers or dashes, e.g. al-noor.';

function normalizeCode(c) { return String(c || '').trim().toLowerCase(); }

// The academic year in progress today, in the app's "26-27" style (a school year
// starts in September — see currentSchoolYear() in src/lib/store.js).
function currentYearLabel() {
  const now = new Date();
  const start = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return `${String(start).slice(2)}-${String(start + 1).slice(2)}`;
}

async function codeTaken(code, exceptId) {
  const { rows } = await query('SELECT id FROM madaaris WHERE lower(code) = $1 AND id <> $2', [code, exceptId || 0]);
  return rows.length > 0;
}

module.exports = requireAuth(async (req, res) => {
  if (!req.user.platformAdmin) { res.status(403).json({ error: "You don't have access to this." }); return; }
  const id = req.query.id;

  if (!id && req.method === 'GET') {
    const { rows } = await query(`
      SELECT m.id, m.name, m.code, m.active, m.created_at AS "createdAt",
        (SELECT string_agg(u.login, ', ' ORDER BY u.id) FROM users u WHERE u.madrasah_id = m.id AND u.role = 'owner') AS "headLogin",
        (SELECT count(*) FROM students s WHERE s.madrasah_id = m.id AND s.status = 'Active') AS students,
        (SELECT count(*) FROM teachers t WHERE t.madrasah_id = m.id) AS teachers,
        (SELECT count(*) FROM classes c WHERE c.madrasah_id = m.id) AS classes,
        (SELECT count(*) FROM ai_usage a WHERE a.madrasah_id = m.id AND a.created_at >= date_trunc('month', now())) AS "aiThisMonth",
        (SELECT count(*) FROM ai_usage a WHERE a.madrasah_id = m.id) AS "aiTotal"
      FROM madaaris m WHERE m.demo_until IS NULL ORDER BY m.id`);
    res.status(200).json(rows.map(r => ({
      ...r, id: String(r.id), students: Number(r.students), teachers: Number(r.teachers), classes: Number(r.classes),
      aiThisMonth: Number(r.aiThisMonth), aiTotal: Number(r.aiTotal), isYours: r.id === req.user.madrasahId,
    })));
    return;
  }

  if (!id && req.method === 'POST') {
    // A new madrasah: its own settings, the current academic year, and its head's login.
    const b = req.body || {};
    const name = String(b.name || '').trim();
    const code = normalizeCode(b.code);
    const headLogin = normalizeLogin(b.headLogin);
    if (!name) { res.status(400).json({ error: "Enter the madrasah's name." }); return; }
    if (!CODE_RE.test(code)) { res.status(400).json({ error: CODE_PROBLEM }); return; }
    const problem = validateNewCredentials(headLogin, b.headPassword);
    if (problem) { res.status(400).json({ error: problem }); return; }
    if (await codeTaken(code)) { res.status(409).json({ error: 'Another madrasah already uses that code.' }); return; }
    const created = await transaction(async c => {
      const { rows: [m] } = await c.query('INSERT INTO madaaris (name, code) VALUES ($1, $2) RETURNING id', [name, code]);
      // Name given explicitly (older databases default these columns to the first madrasah's).
      await c.query(`INSERT INTO settings (id, madrasah_id, school_name, school_name_arabic) VALUES ($1, $1, $2, '')`, [m.id, name]);
      await c.query('INSERT INTO academic_years (madrasah_id, year) VALUES ($1, $2)', [m.id, currentYearLabel()]);
      await c.query(
        `INSERT INTO users (madrasah_id, login, password_hash, role) VALUES ($1, $2, $3, 'owner')`,
        [m.id, headLogin, hashPassword(b.headPassword)]
      );
      return m;
    });
    res.status(201).json({ ok: true, id: String(created.id) });
    return;
  }

  if (!id) { res.status(405).json({ error: 'Method not allowed' }); return; }

  const { rows: found } = await query('SELECT * FROM madaaris WHERE id = $1', [id]);
  if (!found.length) { res.status(404).json({ error: 'Madrasah not found' }); return; }
  const isOwn = found[0].id === req.user.madrasahId;

  if (req.method === 'PATCH') {
    const b = req.body || {};
    const sets = [];
    const values = [];
    if (b.name !== undefined) {
      const name = String(b.name).trim();
      if (!name) { res.status(400).json({ error: "Enter the madrasah's name." }); return; }
      values.push(name); sets.push(`name = $${values.length}`);
    }
    if (b.code !== undefined) {
      const code = normalizeCode(b.code);
      if (!CODE_RE.test(code)) { res.status(400).json({ error: CODE_PROBLEM }); return; }
      if (await codeTaken(code, id)) { res.status(409).json({ error: 'Another madrasah already uses that code.' }); return; }
      values.push(code); sets.push(`code = $${values.length}`);
    }
    if (b.active !== undefined) {
      if (isOwn && !b.active) { res.status(400).json({ error: "You can't switch off your own madrasah." }); return; }
      values.push(!!b.active); sets.push(`active = $${values.length}`);
    }
    if (b.headPassword !== undefined) {
      // Resets the head's (owner's) password and signs them out everywhere.
      if (String(b.headPassword).length < 8) { res.status(400).json({ error: 'Password must be at least 8 characters.' }); return; }
      if (isOwn) { res.status(400).json({ error: 'Change your own password with "Change password" instead.' }); return; }
      const { rowCount } = await query(
        `UPDATE users SET password_hash = $1, session_version = session_version + 1, active = true
         WHERE id = (SELECT id FROM users WHERE madrasah_id = $2 AND role = 'owner' ORDER BY id LIMIT 1)`,
        [hashPassword(b.headPassword), id]
      );
      if (!rowCount) { res.status(400).json({ error: 'This madrasah has no head login.' }); return; }
    }
    if (sets.length) {
      values.push(id);
      await query(`UPDATE madaaris SET ${sets.join(', ')} WHERE id = $${values.length}`, values);
    }
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
});
