const { query } = require('../db');
const { requireAuth, hashPassword, normalizeLogin, validateNewCredentials } = require('../auth');
const { notifyPlatformOwner } = require('../notify');

// A madrasah's or school's heads (owner logins) — Settings → Heads. Up to two: the main head (the first, whose details are the
// madrasah's contact on the platform owner's Madaaris page) and an optional second head (a deputy, e.g. the headteacher), with
// the same access. A head can:
//   GET                                 → [{ id, name, login, you, main }]
//   POST ?action=add      { name, email, password }  — add a second head (only while there's one)
//   POST ?action=handover { name, email, password, phone? } — give their OWN head login to someone new: the login, password and
//        name change on the same account (so everything it did stays), the old person is signed out everywhere, and — for the
//        main head — the madrasah's contact details follow. Not for the platform owner (their login carries the Madaaris page).
//   DELETE ?id=           — remove the other head (never yourself, never the platform owner)
// The platform owner can also change a madrasah's head from the Madaaris page (madaaris.js ?action=change-head, replaceHead()).
// Never in a demo.

const MAX_HEADS = 2;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let ready = false;
async function ensure() {
  if (ready) return;
  await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT'); // a head's own name (other logins are named by their teacher/class/family)
  ready = true;
}

const cleanName = n => String(n || '').trim().replace(/\s+/g, ' ').slice(0, 80);

async function heads(mid) {
  const { rows } = await query(
    `SELECT id, login, name, platform_admin FROM users WHERE madrasah_id = $1 AND role = 'owner' ORDER BY id`, [mid]);
  return rows;
}

async function loginTaken(mid, login, exceptId) {
  const { rows } = await query('SELECT 1 FROM users WHERE madrasah_id = $1 AND login = $2 AND id <> $3', [mid, login, exceptId || 0]);
  return rows.length > 0;
}

// Checks a new head's details. Returns { name, login, password, phone } or { error }.
async function checkNew(mid, b, exceptId) {
  const name = cleanName(b.name);
  const login = normalizeLogin(b.email);
  if (name.length < 2) return { error: "Enter the new head's name." };
  if (!EMAIL_RE.test(login)) return { error: "Enter the new head's email address — it will be their login." };
  const problem = validateNewCredentials(login, b.password);
  if (problem) return { error: problem };
  if (await loginTaken(mid, login, exceptId)) return { error: 'Someone at your madrasah already signs in with that email — use another.' };
  const phone = String(b.phone || '').trim();
  if (phone && !/^[0-9 +()-]{7,20}$/.test(phone)) return { error: 'Check the phone number.' };
  return { name, login, password: String(b.password), phone };
}

// Gives a head login to someone new: same account, new login/password/name, everyone signed out of it. When it's the
// madrasah's main head (its first owner), the madrasah's contact details become the new head's. Used by a head's handover
// and by the platform owner's "Change head".
async function replaceHead(mid, userId, n) {
  await ensure();
  const list = await heads(mid);
  const target = list.find(h => String(h.id) === String(userId));
  if (!target) return { error: 'That head was not found.' };
  await query(
    `UPDATE users SET login = $1, password_hash = $2, name = $3, session_version = session_version + 1, active = true
     WHERE id = $4 AND madrasah_id = $5 AND role = 'owner'`,
    [n.login, hashPassword(n.password), n.name, target.id, mid]);
  const main = String(list[0].id) === String(target.id);
  if (main) {
    await query('UPDATE madaaris SET contact_name = $1, contact_email = $2, contact_phone = $3 WHERE id = $4',
      [n.name, n.login, n.phone || null, mid]);
  }
  return { ok: true, main, before: target.login };
}

async function handler(req, res) {
  await ensure();
  const mid = req.user.madrasahId;
  if (req.user.demo && req.method !== 'GET') { res.status(403).json({ error: "Heads can't be changed in the demo." }); return; }

  if (req.method === 'GET') {
    const list = await heads(mid);
    res.status(200).json(list.map((h, i) => ({ id: String(h.id), name: h.name || '', login: h.login, you: String(h.id) === req.user.id, main: i === 0 })));
    return;
  }

  if (req.method === 'POST' && req.query.action === 'add') {
    const list = await heads(mid);
    if (list.length >= MAX_HEADS) { res.status(400).json({ error: 'There are already two heads. Remove one first.' }); return; }
    const n = await checkNew(mid, req.body || {});
    if (n.error) { res.status(400).json({ error: n.error }); return; }
    await query(`INSERT INTO users (madrasah_id, login, password_hash, role, name) VALUES ($1, $2, $3, 'owner', $4)`,
      [mid, n.login, hashPassword(n.password), n.name]);
    res.status(201).json({ ok: true });
    return;
  }

  if (req.method === 'POST' && req.query.action === 'handover') {
    if (req.user.platformAdmin) { res.status(400).json({ error: 'Your login also runs the Madaaris page, so it can\'t be handed over here.' }); return; }
    const n = await checkNew(mid, req.body || {}, req.user.id);
    if (n.error) { res.status(400).json({ error: n.error }); return; }
    const done = await replaceHead(mid, req.user.id, n);
    if (done.error) { res.status(400).json({ error: done.error }); return; }
    const { rows: [m] } = await query('SELECT name FROM madaaris WHERE id = $1', [mid]);
    await notifyPlatformOwner({
      title: `New head: ${m.name}`,
      body: `${n.name}${n.phone ? ` · ${n.phone}` : ''} (was ${done.before})`,
      emailText: `${m.name} has handed over a head login.\n\nNew head: ${n.name}\nEmail (their login): ${n.login}\nPhone: ${n.phone || '—'}\nBefore: ${done.before}${done.main ? '\n\nTheir contact details on the Madaaris page have changed to the new head.' : ''}\n\nhttps://suhuf.uk/madaaris`,
    }).catch(() => {});
    res.status(200).json({ ok: true, signedOut: true });
    return;
  }

  if (req.method === 'DELETE') {
    const id = String(req.query.id || '');
    if (id === req.user.id) { res.status(400).json({ error: "You can't remove yourself — hand over to a new head instead." }); return; }
    const list = await heads(mid);
    const target = list.find(h => String(h.id) === id);
    if (!target) { res.status(404).json({ error: 'That head was not found.' }); return; }
    if (target.platform_admin) { res.status(400).json({ error: 'That login runs the Madaaris page and can\'t be removed here.' }); return; }
    if (list.length < 2) { res.status(400).json({ error: 'A madrasah always keeps one head.' }); return; }
    await query(`DELETE FROM users WHERE id = $1 AND madrasah_id = $2 AND role = 'owner'`, [target.id, mid]);
    // The one left becomes the main head: the madrasah's contact follows if the main head was removed.
    if (String(list[0].id) === id) {
      const left = list.find(h => String(h.id) !== id);
      await query('UPDATE madaaris SET contact_name = COALESCE($1, contact_name), contact_email = $2 WHERE id = $3',
        [left.name || null, left.login, mid]);
    }
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}

module.exports = requireAuth(handler);
module.exports.ensure = ensure;
module.exports.replaceHead = replaceHead;
module.exports.checkNew = checkNew;
module.exports.heads = heads;
