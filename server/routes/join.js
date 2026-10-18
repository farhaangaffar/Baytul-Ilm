const crypto = require('crypto');
const { query } = require('../db');
const students = require('./students');

// A madrasah's online application form (/join/<code>), open to anyone with the link. A
// parent sends in one or more children with their contacts, health and so on; each child
// lands on the Waiting list marked "Applied online · new" for the head to look at — nobody
// gets a login from here (the head sets up a parent login later, as usual).
//
// GET  ?m=<code> → { name, arabicName, hasLogo, kind, message } (404 if no such madrasah)
// POST { m, children: [{ forename, surname, dob, gender, allergies, medical, medication, … }],
//        family: { parent1Name, parent1Phone, …, address, emergencyName, walksHome, … },
//        agree: true, website: '' (a hidden box only bots fill in) }
// Guards: the hidden box, the agreement tick, and a few applications per address a day.

const PER_DAY = 6;            // children from one address per madrasah per day
const MAX_CHILDREN = 6;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Per child; everything else in DETAILS is the family's, shared by brothers and sisters.
const CHILD_KEYS = new Set(['gender', 'allergies', 'medical', 'medication', 'walksHome', 'boarding', 'schoolYear', 'previousSchool', 'hifdhCompleted']);
const DU_KEYS = new Set(['boarding', 'schoolYear', 'previousSchool', 'hifdhCompleted']);

function ipHash(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  return crypto.createHmac('sha256', process.env.SESSION_SECRET || 'join').update('join:' + ip).digest('hex').slice(0, 16);
}

async function madrasahByCode(code) {
  const c = String(code || '').trim().toLowerCase();
  if (!c) return null;
  const { rows } = await query(
    `SELECT m.id, m.kind, s.school_name, s.school_name_arabic, s.logo IS NOT NULL AS has_logo, s.join_message, s.default_weekly_fee
     FROM madaaris m LEFT JOIN settings s ON s.madrasah_id = m.id
     WHERE lower(m.code) = $1 AND m.active AND (m.demo_until IS NULL OR m.demo_until > now())`, [c]);
  return rows[0] || null;
}

module.exports = async (req, res) => {
  await students.ensure();
  await require('./settings').ensure();
  await require('../newMadrasah').ensureSignupColumns(); // madaaris.kind

  if (req.method === 'GET') {
    const m = await madrasahByCode(req.query.m);
    if (!m) { res.status(404).json({ error: 'We couldn\'t find that madrasah — check the link with the madrasah.' }); return; }
    res.status(200).json({ name: m.school_name || '', arabicName: m.school_name_arabic || '', hasLogo: m.has_logo, kind: m.kind || 'maktab', message: m.join_message || '' });
    return;
  }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const b = req.body || {};
  if (b.website) { res.status(400).json({ error: 'Something went wrong — please try again.' }); return; }
  const m = await madrasahByCode(b.m);
  if (!m) { res.status(404).json({ error: 'We couldn\'t find that madrasah — check the link with the madrasah.' }); return; }
  if (b.agree !== true) { res.status(400).json({ error: 'Please tick to confirm the details and agree to the madrasah\'s rules.' }); return; }

  const str = (v, n = 120) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, n);
  const list = Array.isArray(b.children) ? b.children.slice(0, MAX_CHILDREN) : [];
  if (!list.length) { res.status(400).json({ error: 'Add your child\'s details.' }); return; }
  for (const [i, c] of list.entries()) {
    const who = list.length > 1 ? `Child ${i + 1}: ` : '';
    if (!str(c.forename) || !str(c.surname)) { res.status(400).json({ error: `${who}enter their first name and surname.` }); return; }
    if (!ISO.test(String(c.dob || '')) || c.dob > new Date().toISOString().slice(0, 10)) { res.status(400).json({ error: `${who}enter their date of birth.` }); return; }
  }
  const f = b.family || {};
  if (!str(f.parent1Name) || !/^[0-9 +()-]{7,20}$/.test(str(f.parent1Phone, 40))) { res.status(400).json({ error: 'Enter the first contact\'s name and phone number.' }); return; }
  for (const k of ['parent1Email', 'parent2Email']) if (str(f[k]) && !EMAIL_RE.test(str(f[k]))) { res.status(400).json({ error: 'Check the email address.' }); return; }

  const hash = ipHash(req);
  const { rows: [{ n }] } = await query(
    `SELECT count(*)::int AS n FROM students WHERE madrasah_id = $1 AND applied_ip = $2 AND added_at > now() - interval '1 day'`, [m.id, hash]);
  if (n + list.length > PER_DAY) { res.status(429).json({ error: 'Too many applications from here today — please contact the madrasah.' }); return; }

  const du = m.kind === 'darul_uloom';
  for (const [i, c] of list.entries()) {
    const cols = ['id', 'madrasah_id', 'forename', 'surname', 'dob', 'class', 'status', 'weekly_fee',
      'parent1_name', 'parent1_phone', 'parent2_name', 'parent2_phone', 'applied_online', 'applied_new', 'applied_ip'];
    const vals = ['S' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex') + i, m.id, str(c.forename), str(c.surname), c.dob,
      'Waiting list', 'Waiting list', Number(m.default_weekly_fee) || 15,
      str(f.parent1Name), str(f.parent1Phone, 40), str(f.parent2Name), str(f.parent2Phone, 40), true, true, hash];
    for (const [key, col, max] of students.DETAILS) {
      if (DU_KEYS.has(key) && !du) continue;
      cols.push(col); vals.push(str(CHILD_KEYS.has(key) ? c[key] : f[key], max));
    }
    await query(`INSERT INTO students (${cols.join(', ')}) VALUES (${cols.map((_, j) => `$${j + 1}`).join(', ')})`, vals);
  }
  res.status(200).json({ ok: true, count: list.length });
};
