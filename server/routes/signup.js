const crypto = require('crypto');
const { query } = require('../db');
const { ensureUsersTable, normalizeLogin, validateNewCredentials, setSessionCookie } = require('../auth');
const { CODE_RE, CODE_PROBLEM, normalizeCode, codeTaken, codeFromName, ensureSignupColumns, createMadrasah, KINDS, giveReferralMonth, SCHOOL_PHASES, schoolPrice } = require('../newMadrasah');
const { termsVersionFor } = require('./session');
const { notifyPlatformOwner } = require('../notify');
const { countEvent } = require('../platform');

// A madrasah signing itself up from the front page ("Start free"). Open to anyone, so:
// a hidden field that only bots fill in, a limit of a few new madaaris per address a day,
// and nothing but a new, empty madrasah can be made. They're straight in as its head, free
// for 6 months, and show on the platform owner's Madaaris page marked New with their contact
// details (the platform owner can switch any off).
//
// GET ?name=Madrasatul Huda → { code } (a free sign-in code made from the name)
// GET ?code=al-huda         → { available }
// POST { madrasahName, code?, headName, email, phone?, password, agree, website (must be empty), ref? (the code of the
//        madrasah that recommended Suhuf — it gets a month free), kind?, and for a school: phase, forms (1–3) }
// A school agrees to its terms and data processing agreement together (SCHOOL_TERMS_VERSION), the head confirming they
// may agree for the school; it's free to the end of the term it joins (schoolFreeUntil), then yearly by its forms of entry.

const PER_DAY = 3;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ipHash(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  return crypto.createHmac('sha256', process.env.SESSION_SECRET || 'signup').update('signup:' + ip).digest('hex').slice(0, 16);
}

module.exports = async (req, res) => {
  await ensureUsersTable();
  await ensureSignupColumns();

  if (req.method === 'GET') {
    if (req.query.code !== undefined) {
      const code = normalizeCode(req.query.code);
      res.status(200).json({ available: CODE_RE.test(code) && !(await codeTaken(code)) });
      return;
    }
    res.status(200).json({ code: await codeFromName(String(req.query.name || '').slice(0, 80)) });
    return;
  }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const b = req.body || {};
  if (b.website) { res.status(400).json({ error: 'Something went wrong — please try again.' }); return; }
  // Sign-up opens once the service itself is set up (its first owner exists).
  const { rows: owners } = await query(`SELECT 1 FROM users WHERE role = 'owner' LIMIT 1`);
  if (!owners.length) { res.status(400).json({ error: 'Signing up is not open yet.' }); return; }

  // A maktab (evening and weekend classes), a Darul Uloom (full-time) or a school (its Islamic Studies department).
  const kind = KINDS.includes(b.kind) ? b.kind : 'maktab';
  const isSchool = kind === 'school';
  const name = String(b.madrasahName || '').trim().replace(/\s+/g, ' ');
  const headName = String(b.headName || '').trim().replace(/\s+/g, ' ');
  const email = normalizeLogin(b.email);
  const phone = String(b.phone || '').trim();
  if (name.length < 2 || name.length > 80) { res.status(400).json({ error: isSchool ? "Enter your school's name." : "Enter your madrasah's name." }); return; }
  if (headName.length < 2 || headName.length > 80) { res.status(400).json({ error: 'Enter your name.' }); return; }
  if (!EMAIL_RE.test(email)) { res.status(400).json({ error: 'Enter a valid email address — it will be your login.' }); return; }
  if (phone && !/^[0-9 +()-]{7,20}$/.test(phone)) { res.status(400).json({ error: 'Check the phone number.' }); return; }
  const problem = validateNewCredentials(email, b.password);
  if (problem) { res.status(400).json({ error: problem }); return; }
  if (b.agree !== true) { res.status(400).json({ error: isSchool ? 'Please agree to the terms of use and the data processing agreement.' : 'Please agree to the terms of use and privacy policy.' }); return; }
  let school = null;
  if (isSchool) {
    const forms = Number(b.forms);
    if (!SCHOOL_PHASES.includes(b.phase)) { res.status(400).json({ error: 'Choose primary, secondary or all-through.' }); return; }
    if (![1, 2, 3].includes(forms)) { res.status(400).json({ error: 'For four forms of entry or more, message us and we\'ll set you up.' }); return; }
    school = { phase: b.phase, forms };
  }

  const hash = ipHash(req);
  const { rows: [{ n }] } = await query(
    `SELECT count(*)::int AS n FROM madaaris WHERE signup_ip = $1 AND created_at > now() - interval '1 day'`, [hash]);
  if (n >= PER_DAY) { res.status(429).json({ error: 'Too many new madaaris from here today — message us on WhatsApp and we\'ll help.' }); return; }

  let code;
  if (b.code) {
    code = normalizeCode(b.code);
    if (!CODE_RE.test(code)) { res.status(400).json({ error: CODE_PROBLEM }); return; }
    if (await codeTaken(code)) { res.status(409).json({ error: 'Another madrasah already uses that code — try another.' }); return; }
  } else code = await codeFromName(name);

  let made;
  try {
    made = await createMadrasah({
      name, code, headLogin: email, headPassword: b.password, kind, school,
      signup: { contactName: headName, contactEmail: email, contactPhone: phone, ipHash: hash, termsVersion: termsVersionFor(kind) },
    });
  } catch (err) {
    // Someone took the same code a moment ago.
    if (err.code === '23505') { res.status(409).json({ error: 'That code was just taken — please try again.' }); return; }
    throw err;
  }
  const { madrasah, user } = made;
  await countEvent({ darul_uloom: 'signup_du', school: 'signup_school' }[kind] || 'signup'); // the Madaaris page's "Demos & sign-ups"
  // Recommended by another madrasah? It gets a month free. Never holds up the sign-up.
  const referrer = await giveReferralMonth(madrasah.id, b.ref, hash).catch(() => null);
  // Let the platform owner know (phone notification / email) — never holds up or breaks the sign-up.
  await notifyPlatformOwner({
    title: `New ${{ darul_uloom: 'Darul Uloom', school: 'school' }[kind] || 'madrasah'}: ${name}`,
    body: `${phone ? `${headName} · ${phone}` : headName}${school ? ` · ${school.forms} form${school.forms === 1 ? '' : 's'}, ${school.phase}` : ''}${referrer ? ` · via ${referrer}` : ''}`, // short, so it fits a phone's notification
    emailText: `${name}${{ darul_uloom: ' (a Darul Uloom)', school: ' (a school\'s Islamic Studies department)' }[kind] || ''} has just signed up to Suhuf.${referrer ? `\nRecommended by ${referrer} (they get a month free).` : ''}\n\nHead: ${headName}\nEmail: ${email}\nPhone: ${phone || '—'}\nCode: ${madrasah.code}${school ? `\nSchool: ${school.phase}, ${school.forms} form${school.forms === 1 ? '' : 's'} of entry — £${schoolPrice(school.forms)} a year, free until ${String(madrasah.free_until).slice(0, 10)}` : ''}\n\nSee them on the Madaaris page: https://suhuf.uk/madaaris`,
  }).catch(() => {});
  setSessionCookie(res, user);
  res.status(201).json({ ok: true, code: madrasah.code });
};
