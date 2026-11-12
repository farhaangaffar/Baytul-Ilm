// "Who's signing in?" (the owner's ask — brothers and sisters sharing a device): the pupils who have signed in on this
// device, per school code, kept only in this browser — just each one's username and first name, never a password.
// The sign-in screen (Login.js) shows them as boxes; tapping one fills the username, so the pupil types only their password.
// Added by the pupil's page (PupilPortal.js) once they're in; a ✕ on a box forgets it.
const KEY = code => `suhuf_pupils:${String(code || '').toLowerCase()}`;
const MAX = 6;

export function devicePupils(code) {
  if (!code) return [];
  try { const list = JSON.parse(localStorage.getItem(KEY(code)) || '[]'); return Array.isArray(list) ? list.filter(p => p && p.login) : []; } catch { return []; }
}

export function rememberPupil(code, login, name) {
  if (!code || !login) return;
  try {
    const rest = devicePupils(code).filter(p => p.login.toLowerCase() !== String(login).toLowerCase());
    localStorage.setItem(KEY(code), JSON.stringify([{ login, name: String(name || '').slice(0, 40) }, ...rest].slice(0, MAX)));
  } catch { /* a private window: fine, they type their username */ }
}

export function forgetPupil(code, login) {
  try { localStorage.setItem(KEY(code), JSON.stringify(devicePupils(code).filter(p => p.login !== login))); } catch { /* fine */ }
}
