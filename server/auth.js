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
      role             TEXT NOT NULL CONSTRAINT users_role_check CHECK (role IN ('owner','teacher','parent','pupil')),
      teacher_id       TEXT UNIQUE REFERENCES teachers(id) ON DELETE CASCADE,
      class_id         TEXT UNIQUE REFERENCES classes(id) ON DELETE CASCADE,
      platform_admin   BOOLEAN NOT NULL DEFAULT false,
      active           BOOLEAN NOT NULL DEFAULT true,
      session_version  INTEGER NOT NULL DEFAULT 0,
      created_at       TIMESTAMP NOT NULL DEFAULT now()
    )
  `);
  await query('CREATE UNIQUE INDEX IF NOT EXISTS users_madrasah_login_key ON users (madrasah_id, login)');
  // Demo madaaris (server/demo.js) delete themselves at demo_until; real ones have NULL.
  await query('ALTER TABLE madaaris ADD COLUMN IF NOT EXISTS demo_until TIMESTAMP');
  await query('ALTER TABLE madaaris ADD COLUMN IF NOT EXISTS demo_ip TEXT');
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
const tokenFor = user => sign({ uid: String(user.id), sv: user.session_version, exp: Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000, ...(user.role === 'pupil' ? { p: 1 } : {}) });
// Adds a Set-Cookie line without dropping one already set in this response (switching sets two).
function addCookie(res, name, value, maxAge) {
  const attrs = [`${name}=${encodeURIComponent(value)}`, 'HttpOnly', 'Path=/', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (process.env.NODE_ENV === 'production') attrs.push('Secure');
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', [...(Array.isArray(prev) ? prev : prev ? [prev] : []).filter(c => !c.startsWith(`${name}=`)), attrs.join('; ')]);
}
function setSessionCookie(res, user) { addCookie(res, COOKIE_NAME, tokenFor(user), SESSION_DAYS * 24 * 60 * 60); }
function clearSessionCookie(res) { addCookie(res, COOKIE_NAME, '', 0); }

// ── Switch: the other places this device is signed in to ──
// One person can belong to more than one madrasah or school (a teacher at a maktab and a school; a parent with children at
// two). The device keeps their other sign-ins in a second cookie — each one the same signed token as the main cookie, so it
// can only be one they signed in with here, with their own password — and "Switch" swaps one in. Each place is checked on
// every request exactly as before (getUser); a password change or a removed login drops it. Never pupils or demos; up to 5.
const SAVED_COOKIE = 'baytul_saved';
const MAX_SAVED = 5;
const savedTokens = req => String(parseCookies(req.headers.cookie)[SAVED_COOKIE] || '').split('|').filter(Boolean).slice(0, MAX_SAVED);
function setSaved(res, tokens) {
  if (tokens.length) addCookie(res, SAVED_COOKIE, tokens.slice(0, MAX_SAVED).join('|'), SESSION_DAYS * 24 * 60 * 60);
  else addCookie(res, SAVED_COOKIE, '', 0);
}
// A token → its user (as getUser), or null when it no longer works.
async function userOfToken(token) { return userFromPayload(verify(token)); }
const switchable = u => u && u.role !== 'pupil' && !u.demo;
// The device's other places, still valid: [{ token, user }] (not the one in use).
async function savedSessions(req) {
  const active = await getUser(req);
  const out = [];
  for (const token of savedTokens(req)) {
    const u = await userOfToken(token);
    if (switchable(u) && (!active || u.id !== active.id) && !out.some(x => x.user.id === u.id)) out.push({ token, user: u });
  }
  return out;
}
// Before signing someone else in ("Add another madrasah or school"): keep the place in use on this device.
async function keepCurrentSession(req, res, newUserId) {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  const current = await userOfToken(token);
  const saved = (await savedSessions(req)).filter(x => x.user.id !== String(newUserId)).map(x => x.token);
  if (switchable(current) && current.id !== String(newUserId)) saved.unshift(token);
  setSaved(res, saved);
}
// An ordinary sign-in (not "Add another"): the device forgets any other places — so a pupil, or the next person on a
// shared device, never lands in someone else's place when they sign out.
function forgetOtherSessions(res) { setSaved(res, []); }
// Switch to one of the device's other places (its user id): it becomes the one in use, the current one is kept.
async function switchSession(req, res, userId) {
  const saved = await savedSessions(req);
  const to = saved.find(x => x.user.id === String(userId));
  if (!to) return null;
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  const current = await userOfToken(token);
  const rest = saved.filter(x => x !== to).map(x => x.token);
  if (switchable(current)) rest.unshift(token);
  addCookie(res, COOKIE_NAME, to.token, SESSION_DAYS * 24 * 60 * 60);
  setSaved(res, rest);
  return to.user;
}
// Sign out of the place in use: the next place on this device (if any) takes over. all = sign out of everything.
async function signOutSession(req, res, all = false) {
  const saved = all ? [] : await savedSessions(req);
  if (!saved.length) { clearSessionCookie(res); setSaved(res, []); return null; }
  addCookie(res, COOKIE_NAME, saved[0].token, SESSION_DAYS * 24 * 60 * 60);
  setSaved(res, saved.slice(1).map(x => x.token));
  return saved[0].user;
}

// The signed-in user, or null. Sessions from before accounts existed carry no uid
// and are simply treated as signed out, as is anyone whose madrasah has been switched
// off by the platform owner, or whose demo madrasah (demo: true, server/demo.js) has run out.
// A pupil's session (cookie flag p) also reads which pupil it is, whether they're still at the school, and the madrasah's kind.
const PUPIL_COLS = payload => (payload.p
  ? `u.student_id AS "studentId", (SELECT s.status FROM students s WHERE s.id = u.student_id AND s.madrasah_id = u.madrasah_id) AS "pupilStatus", m.kind,`
  : '');
async function getUser(req) {
  return userFromPayload(verify(parseCookies(req.headers.cookie)[COOKIE_NAME]));
}
async function userFromPayload(payload) {
  if (!payload || !payload.uid) return null;
  await ensureUsersTable();
  if (payload.p) await require('./pupils').ensurePupilTables(); // a pupil's session: users.student_id exists
  const { rows } = await query(
    `SELECT u.id, u.login, u.role, u.teacher_id AS "teacherId", u.class_id AS "classId", ${PUPIL_COLS(payload)}
            u.active, u.session_version, u.platform_admin AS "platformAdmin",
            u.madrasah_id AS "madrasahId", m.active AS "madrasahActive",
            m.demo_until IS NOT NULL AS demo, m.demo_until < now() AS "demoOver"
     FROM users u JOIN madaaris m ON m.id = u.madrasah_id WHERE u.id = $1`,
    [payload.uid]
  );
  const u = rows[0];
  if (!u || !u.active || u.session_version !== payload.sv) return null;
  if (!u.madrasahActive && !u.platformAdmin) return null;
  if (u.demoOver) return null; // a demo past its time is gone
  // A pupil: only while they're at the school (not left), and only in a school.
  if (u.role === 'pupil' && (!u.studentId || u.pupilStatus !== 'Active' || u.kind !== 'school')) return null;
  return {
    id: String(u.id), login: u.login, role: u.role, teacherId: u.teacherId, classId: u.classId,
    madrasahId: u.madrasahId, platformAdmin: !!u.platformAdmin, demo: !!u.demo,
    ...(u.role === 'pupil' ? { studentId: u.studentId } : {}),
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

// A Darul Uloom's Aalim years have no one class teacher — every book has its own — so a teacher
// also takes attendance and behaviour for the Aalim years they teach: a year with a timetable
// lesson or a book of theirs on the Aalim course page. Hifdh and other classes stay with their own
// teacher. Only routes that ask with { teaching: true } (Attendance, Daily records' behaviour) get
// these; Qur'aan, fees and reports never do.
async function teachingClassNames(user) {
  if (user.classId || !user.teacherId) return [];
  try {
    const { rows } = await query(
      `SELECT c.name FROM classes c JOIN madaaris m ON m.id = c.madrasah_id AND m.kind = 'darul_uloom'
       WHERE c.madrasah_id = $1 AND c.course_order IS NOT NULL AND (
         EXISTS (SELECT 1 FROM du_lessons l WHERE l.madrasah_id = c.madrasah_id AND l.class_id = c.id AND l.teacher_id = $2)
         OR EXISTS (SELECT 1 FROM du_subjects s WHERE s.madrasah_id = c.madrasah_id AND s.class_id = c.id AND s.teacher_id = $2))
       ORDER BY c.course_order`, [user.madrasahId, user.teacherId]);
    return rows.map(r => r.name);
  } catch { return []; } // a madrasah that has never used the Darul Uloom tables
}

// Who did something, for "Taken by …": the teacher's name, "Head" for the owner, else the login.
async function whoName(user) {
  if (user.role === 'owner') return 'Head';
  if (user.teacherId) {
    const { rows } = await query('SELECT name FROM teachers WHERE id = $1 AND madrasah_id = $2', [user.teacherId, user.madrasahId]);
    if (rows[0]) return rows[0].name;
  }
  return user.login;
}

// Which students the signed-in person may touch. Owners: every student in their
// madrasah (current or left). Teachers: their own classes' current students (and, with
// { teaching: true }, the Aalim years they teach — see teachingClassNames). Any
// student id that arrives in a request must be checked against studentIds — that's
// what stops one madrasah reaching another's records by id.
async function accessScope(req, { teaching = false } = {}) {
  const mid = req.user.madrasahId;
  if (isOwner(req)) {
    const { rows } = await query('SELECT id FROM students WHERE madrasah_id = $1', [mid]);
    return { classNames: null, studentIds: new Set(rows.map(r => r.id)) };
  }
  const own = await teacherClassNames(req.user);
  const classNames = teaching ? [...new Set([...own, ...await teachingClassNames(req.user)])] : own;
  const { rows } = classNames.length
    ? await query(`SELECT id FROM students WHERE madrasah_id = $1 AND class = ANY($2) AND status <> 'Inactive'`, [mid, classNames])
    : { rows: [] };
  return { classNames, studentIds: new Set(rows.map(r => r.id)) };
}

// For teacher-permitted routes that need the teacher's restriction only; owners get null.
async function teacherScope(req, opts) {
  return isOwner(req) ? null : accessScope(req, opts);
}

module.exports = {
  COOKIE_NAME, ensureUsersTable, hashPassword, verifyPassword, timingSafeStringEqual,
  normalizeLogin, validateLogin, validateNewCredentials, setSessionCookie, clearSessionCookie,
  savedSessions, keepCurrentSession, switchSession, signOutSession, forgetOtherSessions,
  getUser, requireAuth, isOwner, teacherClassNames, teachingClassNames, whoName, accessScope, teacherScope,
};
