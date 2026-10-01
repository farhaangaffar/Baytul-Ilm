const crypto = require('crypto');
const { query } = require('./db');

// Individual logins. The madrasah's owner (super admin) has full access; teachers
// only reach their own classes' attendance, daily records and fees (marking paid,
// never changing amounts). The old shared ADMIN_PASSWORD no longer signs anyone in
// once an owner account exists — it's only the key for first-time setup and for
// resetting a forgotten owner password (see server/routes/login.js).

const COOKIE_NAME = 'baytul_session';
const SESSION_DAYS = 30;

// ── Users table (self-healing, same pattern as the other added tables/columns) ──
let usersReady = false;
async function ensureUsersTable() {
  if (usersReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id               BIGSERIAL PRIMARY KEY,
      email            TEXT NOT NULL UNIQUE,
      password_hash    TEXT NOT NULL,
      role             TEXT NOT NULL CHECK (role IN ('owner','teacher')),
      teacher_id       TEXT UNIQUE REFERENCES teachers(id) ON DELETE CASCADE,
      active           BOOLEAN NOT NULL DEFAULT true,
      session_version  INTEGER NOT NULL DEFAULT 0,
      created_at       TIMESTAMP NOT NULL DEFAULT now()
    )
  `);
  // Early test copies of this table (previews only — never production) named the
  // login column "username"; logins are email addresses now.
  await query(`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'username') THEN
      ALTER TABLE users RENAME COLUMN username TO email;
    END IF;
  END $$`);
  usersReady = true;
}

// ── Password hashing: scrypt with a per-password random salt ──
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function verifyPassword(password, stored) {
  const [scheme, n, saltB64, hashB64] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.scryptSync(String(password), Buffer.from(saltB64, 'base64'), expected.length, { N: Number(n), r: SCRYPT.r, p: SCRYPT.p });
  return crypto.timingSafeEqual(actual, expected);
}

function timingSafeStringEqual(a, b) {
  const aBuf = Buffer.from(String(a));
  const bBuf = Buffer.from(String(b));
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

// People sign in with their email address — case-insensitive, stored lowercased and trimmed.
function normalizeEmail(e) { return String(e || '').trim().toLowerCase(); }

function validateNewCredentials(email, password) {
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email address.';
  if (String(password || '').length < 8) return 'Password must be at least 8 characters.';
  return null;
}

// ── Signed session cookie ──
function parseCookies(header) {
  const out = {};
  (header || '').split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    if (!key) return;
    out[key] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return out;
}

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('No SESSION_SECRET set');
  return s;
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verify(token) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

// The cookie names a user and their session_version; bumping the version (password
// change/reset, access removed) signs that user out everywhere.
function setSessionCookie(res, user) {
  const token = sign({ uid: String(user.id), sv: user.session_version, exp: Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000 });
  const isProd = process.env.NODE_ENV === 'production';
  const attrs = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'HttpOnly', 'Path=/', 'SameSite=Lax',
    `Max-Age=${SESSION_DAYS * 24 * 60 * 60}`,
  ];
  if (isProd) attrs.push('Secure');
  res.setHeader('Set-Cookie', attrs.join('; '));
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0`);
}

// The signed-in user, or null. Sessions from before accounts existed carry no uid
// and are simply treated as signed out.
async function getUser(req) {
  const payload = verify(parseCookies(req.headers.cookie)[COOKIE_NAME]);
  if (!payload || !payload.uid) return null;
  await ensureUsersTable();
  const { rows } = await query(
    `SELECT id, email, role, teacher_id AS "teacherId", active, session_version
     FROM users WHERE id = $1`,
    [payload.uid]
  );
  const u = rows[0];
  if (!u || !u.active || u.session_version !== payload.sv) return null;
  return { id: String(u.id), email: u.email, role: u.role, teacherId: u.teacherId };
}

// Wraps a route handler. Owner-only unless { teacher: true }, so anything new is
// locked down by default; teacher-permitted handlers must scope their own queries
// with teacherScope(). The signed-in user is available as req.user.
function requireAuth(handler, { teacher = false } = {}) {
  return async (req, res) => {
    const user = await getUser(req);
    if (!user) { res.status(401).json({ error: 'Not authenticated' }); return; }
    if (user.role !== 'owner' && !(teacher && user.role === 'teacher')) {
      res.status(403).json({ error: "You don't have access to this." });
      return;
    }
    req.user = user;
    return handler(req, res);
  };
}

function isOwner(req) { return req.user?.role === 'owner'; }

// What a teacher may see: the classes assigned to them (Classes & Teachers page)
// and the current students in those classes. Owners get null = no restriction.
async function teacherScope(req) {
  if (isOwner(req)) return null;
  const { rows: classRows } = await query('SELECT name FROM classes WHERE teacher_id = $1', [req.user.teacherId]);
  const classNames = classRows.map(r => r.name);
  const { rows: studentRows } = classNames.length
    ? await query(`SELECT id FROM students WHERE class = ANY($1) AND status <> 'Inactive'`, [classNames])
    : { rows: [] };
  return { classNames, studentIds: new Set(studentRows.map(r => r.id)) };
}

module.exports = {
  COOKIE_NAME, ensureUsersTable, hashPassword, verifyPassword, timingSafeStringEqual,
  normalizeEmail, validateNewCredentials, setSessionCookie, clearSessionCookie,
  getUser, requireAuth, isOwner, teacherScope,
};
