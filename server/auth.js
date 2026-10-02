const crypto = require('crypto');
const { query } = require('./db');

// Individual logins, each belonging to one madrasah (see db/migrate-011-madaaris.sql).
// A madrasah's owner (its head) has full access to that madrasah; teachers — or a shared
// login for a whole class — only reach their own classes' attendance, daily records and
// fees (marking paid, never changing amounts). One owner is also the platform owner,
// who can add and manage madaaris (server/routes/madaaris.js) but still only sees their
// own madrasah's school data. The old shared ADMIN_PASSWORD no longer signs anyone in
// once an owner account exists — it's only the key for first-time setup and for
// resetting a forgotten platform-owner password (see server/routes/login.js).
//
// Every query of school data must be limited to req.user.madrasahId.

const COOKIE_NAME = 'baytul_session';
const SESSION_DAYS = 30;

// ── Users table (fresh databases; existing ones are brought to this shape by
// db/migrate-011-madaaris.sql) ──
let usersReady = false;
async function ensureUsersTable() {
  if (usersReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id               BIGSERIAL PRIMARY KEY,
      madrasah_id      INTEGER NOT NULL REFERENCES madaaris(id),
      login            TEXT NOT NULL,
      password_hash    TEXT NOT NULL,
      role             TEXT NOT NULL CONSTRAINT users_role_check CHECK (role IN ('owner','teacher','parent')),
      teacher_id       TEXT UNIQUE REFERENCES teachers(id) ON DELETE CASCADE,
      class_id         TEXT UNIQUE REFERENCES classes(id) ON DELETE CASCADE,
      platform_admin   BOOLEAN NOT NULL DEFAULT false,
      active           BOOLEAN NOT NULL DEFAULT true,
      session_version  INTEGER NOT NULL DEFAULT 0,
      created_at       TIMESTAMP NOT NULL DEFAULT now()
    )
  `);
  await query('CREATE UNIQUE INDEX IF NOT EXISTS users_madrasah_login_key ON users (madrasah_id, login)');
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

// People sign in with a username (e.g. "class1") or an email address — case-insensitive,
// stored lowercased and trimmed. Usernames only have to be unique within a madrasah.
function normalizeLogin(e) { return String(e || '').trim().toLowerCase(); }

function validateLogin(login) {
  if (login.length < 3 || login.length > 254 || !/^[a-z0-9._@+-]+$/.test(login)) {
    return 'Usernames are 3 or more letters or numbers (dots, dashes and @ are fine; no spaces).';
  }
  return null;
}

function validateNewCredentials(login, password) {
  return validateLogin(login) || (String(password || '').length < 8 ? 'Password must be at least 8 characters.' : null);
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
// and are simply treated as signed out, as is anyone whose madrasah has been switched
// off by the platform owner.
async function getUser(req) {
  const payload = verify(parseCookies(req.headers.cookie)[COOKIE_NAME]);
  if (!payload || !payload.uid) return null;
  await ensureUsersTable();
  const { rows } = await query(
    `SELECT u.id, u.login, u.role, u.teacher_id AS "teacherId", u.class_id AS "classId",
            u.active, u.session_version, u.platform_admin AS "platformAdmin",
            u.madrasah_id AS "madrasahId", m.active AS "madrasahActive"
     FROM users u JOIN madaaris m ON m.id = u.madrasah_id WHERE u.id = $1`,
    [payload.uid]
  );
  const u = rows[0];
  if (!u || !u.active || u.session_version !== payload.sv) return null;
  if (!u.madrasahActive && !u.platformAdmin) return null;
  return {
    id: String(u.id), login: u.login, role: u.role, teacherId: u.teacherId, classId: u.classId,
    madrasahId: u.madrasahId, platformAdmin: !!u.platformAdmin,
  };
}

// Wraps a route handler. Owner-only unless { teacher: true }, so anything new is
// locked down by default; teacher-permitted handlers must scope their own queries
// with accessScope(). The signed-in user is available as req.user, and every query
// must be limited to req.user.madrasahId.
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

// The class names a teacher login covers: the classes assigned to that teacher on
// the Classes & Teachers page, or the one class a shared class login belongs to.
async function teacherClassNames(user) {
  const { rows } = user.classId
    ? await query('SELECT name FROM classes WHERE id = $1 AND madrasah_id = $2', [user.classId, user.madrasahId])
    : await query('SELECT name FROM classes WHERE teacher_id = $1 AND madrasah_id = $2 ORDER BY name', [user.teacherId, user.madrasahId]);
  return rows.map(r => r.name);
}

// Which students the signed-in person may touch. Owners: every student in their
// madrasah (current or left). Teachers: their own classes' current students. Any
// student id that arrives in a request must be checked against studentIds — that's
// what stops one madrasah reaching another's records by id.
async function accessScope(req) {
  const mid = req.user.madrasahId;
  if (isOwner(req)) {
    const { rows } = await query('SELECT id FROM students WHERE madrasah_id = $1', [mid]);
    return { classNames: null, studentIds: new Set(rows.map(r => r.id)) };
  }
  const classNames = await teacherClassNames(req.user);
  const { rows } = classNames.length
    ? await query(`SELECT id FROM students WHERE madrasah_id = $1 AND class = ANY($2) AND status <> 'Inactive'`, [mid, classNames])
    : { rows: [] };
  return { classNames, studentIds: new Set(rows.map(r => r.id)) };
}

// For teacher-permitted routes that need the teacher's restriction only; owners get null.
async function teacherScope(req) {
  return isOwner(req) ? null : accessScope(req);
}

module.exports = {
  COOKIE_NAME, ensureUsersTable, hashPassword, verifyPassword, timingSafeStringEqual,
  normalizeLogin, validateLogin, validateNewCredentials, setSessionCookie, clearSessionCookie,
  getUser, requireAuth, isOwner, teacherClassNames, accessScope, teacherScope,
};
