const crypto = require('crypto');

const COOKIE_NAME = 'baytul_session';
const SESSION_DAYS = 30;

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

function setSessionCookie(res) {
  const token = sign({ exp: Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000 });
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

function isAuthed(req) {
  const cookies = parseCookies(req.headers.cookie);
  return !!verify(cookies[COOKIE_NAME]);
}

function requireAuth(handler) {
  return async (req, res) => {
    if (!isAuthed(req)) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    return handler(req, res);
  };
}

module.exports = { COOKIE_NAME, setSessionCookie, clearSessionCookie, isAuthed, requireAuth };
