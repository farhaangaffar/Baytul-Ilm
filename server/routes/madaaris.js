const { query, transaction } = require('../db');
const { TABLES, ensureAllTables } = require('../demo');
const { ensurePlatformTables } = require('../platform');
const { vapidKeys, notifyPlatformOwner } = require('../notify');
const { requireAuth, hashPassword, normalizeLogin, validateNewCredentials } = require('../auth');
const { CODE_RE, CODE_PROBLEM, normalizeCode, codeTaken, createMadrasah, ensureSignupColumns } = require('../newMadrasah');

// The platform owner's page (Madaaris): every madrasah using this service, with
// counts only — never another madrasah's students, fees or reports. From here the
// platform owner adds a madrasah (with its head's first login), renames it or changes
// its sign-in code, switches it off or back on, and resets its head's password.
// Only the platform owner gets past the check below.

// Each madrasah is free for its first 6 months (free_until); the platform owner can change
// the date. Older rows without one count 6 months from when they were added.
let ready = false;
async function ensureColumns() {
  if (ready) return;
  await query('ALTER TABLE madaaris ADD COLUMN IF NOT EXISTS free_until DATE');
  await query('ALTER TABLE madaaris ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP'); // see routes/session.js
  await ensureSignupColumns();
  // What each madrasah pays us (after its free months) and the payments received.
  await query(`ALTER TABLE madaaris ADD COLUMN IF NOT EXISTS billing_plan TEXT NOT NULL DEFAULT 'monthly'`);
  await query('ALTER TABLE madaaris ADD COLUMN IF NOT EXISTS billing_amount NUMERIC(8,2)');
  await ensurePlatformTables();
  ready = true;
}
// Prices (CLAUDE.md, the terms' Cost section): £20 a month or £200 a year.
const PLANS = { monthly: { amount: 20, months: 1 }, yearly: { amount: 200, months: 12 } };
const ISO = /^\d{4}-\d{2}-\d{2}$/;

module.exports = requireAuth(async (req, res) => {
  if (!req.user.platformAdmin) { res.status(403).json({ error: "You don't have access to this." }); return; }
  const id = req.query.id;
  await ensureColumns();

  // How much of the database is used (the free Neon plan allows 0.5 GB).
  if (req.query.action === 'usage') {
    const { rows: [u] } = await query('SELECT pg_database_size(current_database()) AS bytes');
    res.status(200).json({ dbBytes: Number(u.bytes) });
    return;
  }

  // Phone notifications when a madrasah signs up (this device): the public key to subscribe with,
  // saving / removing this phone's subscription, and a test notification.
  if (req.query.action === 'push-key') { res.status(200).json({ publicKey: (await vapidKeys()).publicKey, email: !!process.env.RESEND_API_KEY }); return; }
  if (req.query.action === 'push-subscribe' && req.method === 'POST') {
    const sub = (req.body || {}).subscription || {};
    if (!/^https:\/\//.test(String(sub.endpoint || '')) || !sub.keys?.p256dh || !sub.keys?.auth) { res.status(400).json({ error: 'Notifications could not be switched on on this device.' }); return; }
    await query(`INSERT INTO push_subscriptions (madrasah_id, user_id, endpoint, keys) VALUES ($1,$2,$3,$4)
                 ON CONFLICT (endpoint) DO UPDATE SET keys = EXCLUDED.keys, user_id = EXCLUDED.user_id`,
      [req.user.madrasahId, req.user.id, sub.endpoint, JSON.stringify({ p256dh: sub.keys.p256dh, auth: sub.keys.auth })]);
    res.status(200).json({ ok: true });
    return;
  }
  if (req.query.action === 'push-unsubscribe' && req.method === 'POST') {
    await query('DELETE FROM push_subscriptions WHERE endpoint = $1', [String((req.body || {}).endpoint || '')]);
    res.status(200).json({ ok: true });
    return;
  }
  if (req.query.action === 'notify-test' && req.method === 'POST') {
    const time = new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const r = await notifyPlatformOwner({ title: `Suhuf test · ${time}`, body: "You'll get one like this whenever a madrasah signs up.", ttl: 60 }); // a test is dropped, not delivered hours late
    // What happened for the phone asking (if it's switched on), so the card can say.
    const mine = r.results.find(x => x.endpoint === String((req.body || {}).endpoint || ''));
    res.status(200).json({ phones: r.phones, devices: r.results.length, email: r.email,
      thisPhone: mine ? { ok: mine.ok, status: mine.status, error: mine.error || '' } : null });
    return;
  }

  if (!id && req.method === 'GET' && !req.query.action) {
    const { rows } = await query(`
      SELECT m.id, m.name, m.code, m.active, m.created_at AS "createdAt",
        to_char(COALESCE(m.free_until, (m.created_at + interval '6 months')::date), 'YYYY-MM-DD') AS "freeUntil",
        to_char(m.terms_accepted_at, 'YYYY-MM-DD') AS "termsAccepted",
        m.self_signup AS "selfSignup", m.contact_name AS "contactName", m.contact_email AS "contactEmail", m.contact_phone AS "contactPhone",
        (SELECT string_agg(u.login, ', ' ORDER BY u.id) FROM users u WHERE u.madrasah_id = m.id AND u.role = 'owner') AS "headLogin",
        (SELECT count(*) FROM students s WHERE s.madrasah_id = m.id AND s.status = 'Active') AS students,
        (SELECT count(*) FROM teachers t WHERE t.madrasah_id = m.id) AS teachers,
        (SELECT count(*) FROM classes c WHERE c.madrasah_id = m.id) AS classes,
        (SELECT count(*) FROM ai_usage a WHERE a.madrasah_id = m.id AND a.created_at >= date_trunc('month', now())) AS "aiThisMonth",
        (SELECT count(*) FROM ai_usage a WHERE a.madrasah_id = m.id) AS "aiTotal",
        m.billing_plan AS "billingPlan", m.billing_amount AS "billingAmount",
        -- Months paid for, counted on from the 1st after the free months (src/lib/billing.js).
        (SELECT COALESCE(sum(p.months), 0) FROM madrasah_payments p WHERE p.madrasah_id = m.id) AS "monthsPaid",
        (SELECT to_char(max(p.paid_on), 'YYYY-MM-DD') FROM madrasah_payments p WHERE p.madrasah_id = m.id) AS "lastPaid"
      FROM madaaris m WHERE m.demo_until IS NULL ORDER BY m.id`);
    res.status(200).json(rows.map(r => ({
      ...r, id: String(r.id), students: Number(r.students), teachers: Number(r.teachers), classes: Number(r.classes),
      aiThisMonth: Number(r.aiThisMonth), aiTotal: Number(r.aiTotal), isYours: r.id === req.user.madrasahId,
      billingAmount: r.billingAmount === null ? PLANS[r.billingPlan]?.amount ?? 20 : Number(r.billingAmount), monthsPaid: Number(r.monthsPaid),
    })));
    return;
  }

  // Money received: this month, the last 12 months, and every payment (newest first) with its madrasah.
  if (!id && req.query.action === 'income') {
    const { rows: [t] } = await query(`
      SELECT COALESCE(sum(amount) FILTER (WHERE paid_on >= date_trunc('month', now())), 0) AS "thisMonth",
             COALESCE(sum(amount) FILTER (WHERE paid_on >= (now() - interval '12 months')::date), 0) AS "last12",
             COALESCE(sum(amount), 0) AS "allTime"
      FROM madrasah_payments`);
    res.status(200).json({ thisMonth: Number(t.thisMonth), last12: Number(t.last12), allTime: Number(t.allTime) });
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
    const { madrasah } = await createMadrasah({ name, code, headLogin, headPassword: b.headPassword });
    res.status(201).json({ ok: true, id: String(madrasah.id) });
    return;
  }

  if (!id) { res.status(405).json({ error: 'Method not allowed' }); return; }

  const { rows: found } = await query('SELECT * FROM madaaris WHERE id = $1', [id]);
  if (!found.length) { res.status(404).json({ error: 'Madrasah not found' }); return; }
  const isOwn = found[0].id === req.user.madrasahId;

  // Payments from this madrasah: GET the list; POST { paidOn, amount, months, note } records one;
  // DELETE ?paymentId= removes one entered by mistake.
  if (req.query.action === 'payments') {
    if (req.method === 'GET') {
      const { rows } = await query(
        `SELECT id, to_char(paid_on, 'YYYY-MM-DD') AS "paidOn", amount, months, note FROM madrasah_payments
         WHERE madrasah_id = $1 ORDER BY paid_on DESC, id DESC`, [found[0].id]);
      res.status(200).json(rows.map(r => ({ ...r, id: String(r.id), amount: Number(r.amount) })));
      return;
    }
    if (req.method === 'POST') {
      const b = req.body || {};
      const amount = Number(b.amount), months = Number(b.months);
      if (!ISO.test(String(b.paidOn))) { res.status(400).json({ error: 'Choose the date it was paid.' }); return; }
      if (!(amount > 0) || amount > 100000) { res.status(400).json({ error: 'Enter the amount paid.' }); return; }
      if (!Number.isInteger(months) || months < 0 || months > 60) { res.status(400).json({ error: 'Choose how many months it covers.' }); return; }
      await query('INSERT INTO madrasah_payments (madrasah_id, paid_on, amount, months, note) VALUES ($1,$2,$3,$4,$5)',
        [found[0].id, b.paidOn, amount, months, String(b.note || '').slice(0, 200)]);
      res.status(201).json({ ok: true });
      return;
    }
    if (req.method === 'DELETE') {
      if (!/^\d+$/.test(String(req.query.paymentId))) { res.status(400).json({ error: 'Missing payment' }); return; }
      await query('DELETE FROM madrasah_payments WHERE id = $1 AND madrasah_id = $2', [req.query.paymentId, found[0].id]);
      res.status(200).json({ ok: true });
      return;
    }
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

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
    if (b.billingPlan !== undefined) {
      if (!PLANS[b.billingPlan]) { res.status(400).json({ error: 'Choose monthly or yearly.' }); return; }
      values.push(b.billingPlan); sets.push(`billing_plan = $${values.length}`);
    }
    if (b.billingAmount !== undefined) {
      const a = Number(b.billingAmount);
      if (!(a >= 0) || a > 100000) { res.status(400).json({ error: 'Enter the price.' }); return; }
      values.push(a); sets.push(`billing_amount = $${values.length}`);
    }
    if (b.freeUntil !== undefined) {
      if (!ISO.test(String(b.freeUntil))) { res.status(400).json({ error: 'Choose a date.' }); return; }
      values.push(b.freeUntil); sets.push(`free_until = $${values.length}`);
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

  if (req.method === 'DELETE') {
    // Deletes a madrasah and everything in it, for ever. Only one already switched off, never
    // the platform owner's own, and only when its code is typed to confirm.
    const m = found[0];
    if (isOwn) { res.status(400).json({ error: "You can't delete your own madrasah." }); return; }
    if (m.active) { res.status(400).json({ error: 'Switch it off first, then delete it.' }); return; }
    if (normalizeCode((req.body || {}).confirmCode) !== String(m.code).toLowerCase()) {
      res.status(400).json({ error: "Type the madrasah's code exactly to confirm." }); return;
    }
    await ensureAllTables();
    await transaction(async c => {
      for (const t of TABLES) await c.query(`DELETE FROM ${t} WHERE madrasah_id = $1`, [m.id]);
      await c.query('DELETE FROM madaaris WHERE id = $1 AND active = false', [m.id]);
    });
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
});
