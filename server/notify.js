const webpush = require('web-push');
const { query } = require('./db');
const { ensurePlatformTables } = require('./platform');

// Telling the platform owner about something (a madrasah signing up): a notification on
// every phone they switched it on for (Madaaris page → "Phone notifications"), and an email
// when an email service is set up (RESEND_API_KEY in Vercel; sent to NOTIFY_EMAIL, else
// hello@suhuf.uk). Either one failing never stops what triggered it.

// Phone notifications are signed with a key pair made once and kept in the database.
async function vapidKeys() {
  await ensurePlatformTables();
  const read = async () => (await query(`SELECT value FROM platform_kv WHERE key = 'vapid'`)).rows[0];
  let row = await read();
  if (!row) {
    const k = webpush.generateVAPIDKeys();
    await query(`INSERT INTO platform_kv (key, value) VALUES ('vapid', $1) ON CONFLICT (key) DO NOTHING`, [JSON.stringify(k)]);
    row = await read();
  }
  return JSON.parse(row.value);
}

async function sendPush(payload, ttl = 24 * 60 * 60) {
  const keys = await vapidKeys();
  webpush.setVapidDetails('mailto:hello@suhuf.uk', keys.publicKey, keys.privateKey);
  const { rows } = await query('SELECT id, endpoint, keys FROM push_subscriptions');
  // One result per phone: { endpoint, ok, status, error } — what the phone's push service said.
  return Promise.all(rows.map(async s => {
    try {
      const r = await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(payload), { TTL: ttl, timeout: 5000, urgency: 'high' });
      return { endpoint: s.endpoint, ok: true, status: r.statusCode };
    } catch (err) {
      // That phone switched notifications off or the app was removed — forget it.
      if (err.statusCode === 404 || err.statusCode === 410) await query('DELETE FROM push_subscriptions WHERE id = $1', [s.id]).catch(() => {});
      return { endpoint: s.endpoint, ok: false, status: err.statusCode || null, error: String(err.body || err.message || err).slice(0, 200) };
    }
  }));
}

async function sendEmail({ subject, text }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: ctrl.signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.NOTIFY_FROM || 'Suhuf <notifications@suhuf.uk>',
        to: [process.env.NOTIFY_EMAIL || 'hello@suhuf.uk'],
        subject, text,
      }),
    });
    return r.ok;
  } catch { return false; } finally { clearTimeout(t); }
}

// { title, body, url, emailText } — waits (briefly) for both, never throws.
// ttl: how long a phone that's asleep can still be sent it (seconds) — a day for sign-ups.
async function notifyPlatformOwner({ title, body, url = '/madaaris', emailText, ttl }) {
  const [push, email] = await Promise.allSettled([
    sendPush({ title, body, url }, ttl),
    sendEmail({ subject: title, text: emailText || `${body}\n\nhttps://suhuf.uk${url}` }),
  ]);
  const results = push.status === 'fulfilled' ? push.value : [];
  return { phones: results.filter(r => r.ok).length, results, email: email.status === 'fulfilled' && email.value };
}

module.exports = { vapidKeys, notifyPlatformOwner };
