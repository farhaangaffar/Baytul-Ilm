const { query, transaction } = require('./db');
const { hashPassword } = require('./auth');

// Adding a madrasah — used by the platform owner's Madaaris page and by a madrasah signing
// itself up on the front page (routes/signup.js): its own settings, the current academic
// year, its head's login, and 6 months free.

const CODE_RE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;
const CODE_PROBLEM = 'The madrasah code is 3–30 lowercase letters, numbers or dashes, e.g. al-noor.';
const normalizeCode = c => String(c || '').trim().toLowerCase();

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

// A code from the madrasah's name ("Madrasatul Huda" → "madrasatul-huda"), made unique.
async function codeFromName(name) {
  let base = String(name || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 26).replace(/-+$/, '');
  if (base.length < 3) base = `madrasah${base ? '-' + base : ''}`;
  for (let n = 1; n < 200; n++) {
    const code = n === 1 ? base : `${base}-${n}`;
    if (CODE_RE.test(code) && !(await codeTaken(code))) return code;
  }
  return `${base.slice(0, 20)}-${Date.now().toString(36).slice(-6)}`;
}

// Columns for madaaris that signed themselves up (who to contact, and a hashed address used
// only to limit how many one place can create).
let ready = false;
async function ensureSignupColumns() {
  if (ready) return;
  await query('ALTER TABLE madaaris ADD COLUMN IF NOT EXISTS free_until DATE');
  await query('ALTER TABLE madaaris ADD COLUMN IF NOT EXISTS self_signup BOOLEAN NOT NULL DEFAULT false');
  await query('ALTER TABLE madaaris ADD COLUMN IF NOT EXISTS contact_name TEXT');
  await query('ALTER TABLE madaaris ADD COLUMN IF NOT EXISTS contact_email TEXT');
  await query('ALTER TABLE madaaris ADD COLUMN IF NOT EXISTS contact_phone TEXT');
  await query('ALTER TABLE madaaris ADD COLUMN IF NOT EXISTS signup_ip TEXT');
  await query('ALTER TABLE madaaris ADD COLUMN IF NOT EXISTS terms_version TEXT');
  await query('ALTER TABLE madaaris ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP');
  await query('ALTER TABLE madaaris ADD COLUMN IF NOT EXISTS terms_accepted_by TEXT');
  ready = true;
}

// Creates the madrasah and its head's login in one go. Returns { madrasah, user }.
// signup: { contactName, contactEmail, contactPhone, ipHash, termsVersion } when it signed itself up.
async function createMadrasah({ name, code, headLogin, headPassword, signup }) {
  await ensureSignupColumns();
  return transaction(async c => {
    const { rows: [m] } = await c.query(
      `INSERT INTO madaaris (name, code, free_until, self_signup, contact_name, contact_email, contact_phone, signup_ip,
         terms_version, terms_accepted_at, terms_accepted_by)
       VALUES ($1, $2, (now() AT TIME ZONE 'Europe/London' + interval '6 months')::date, $3, $4, $5, $6, $7, $8,
         CASE WHEN $8::text IS NULL THEN NULL ELSE now() END, $9) RETURNING id, code, name`,
      [name, code, !!signup, signup?.contactName || null, signup?.contactEmail || null, signup?.contactPhone || null,
        signup?.ipHash || null, signup?.termsVersion || null, signup ? headLogin : null]);
    // Name given explicitly (older databases default these columns to the first madrasah's).
    await c.query(`INSERT INTO settings (id, madrasah_id, school_name, school_name_arabic) VALUES ($1, $1, $2, '')`, [m.id, name]);
    await c.query('INSERT INTO academic_years (madrasah_id, year) VALUES ($1, $2)', [m.id, currentYearLabel()]);
    const { rows: [u] } = await c.query(
      `INSERT INTO users (madrasah_id, login, password_hash, role) VALUES ($1, $2, $3, 'owner') RETURNING *`,
      [m.id, headLogin, hashPassword(headPassword)]);
    return { madrasah: m, user: u };
  });
}

module.exports = { CODE_RE, CODE_PROBLEM, normalizeCode, currentYearLabel, codeTaken, codeFromName, ensureSignupColumns, createMadrasah };
