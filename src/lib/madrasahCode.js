// Many madaaris share this site. Each device remembers the code of the madrasah it
// last signed in to, so the sign-in screen, the installed app's name and its icon are
// that madrasah's from the start, and nobody has to type the code again. A link with
// ?m=<code> (handed out by the madrasah) sets it too.

const KEY = 'madrasah_code';

export function getMadrasahCode() {
  try {
    const fromLink = new URLSearchParams(window.location.search).get('m');
    if (fromLink) { localStorage.setItem(KEY, fromLink.trim().toLowerCase()); return fromLink.trim().toLowerCase(); }
    return localStorage.getItem(KEY) || '';
  } catch { return ''; }
}

export function setMadrasahCode(code) {
  try {
    if (code) localStorage.setItem(KEY, code); else localStorage.removeItem(KEY);
  } catch {}
  pointHeadLinksAt(code);
}

// Point the install manifest and icons at this madrasah's (see public/index.html).
export function pointHeadLinksAt(code) {
  const m = code ? `&m=${encodeURIComponent(code)}` : '';
  const links = { manifest: '/api/settings?manifest', icon: '/api/settings?icon', 'apple-touch-icon': '/api/settings?icon' };
  for (const [rel, base] of Object.entries(links)) {
    const el = document.querySelector(`link[rel="${rel}"]`);
    if (el) el.setAttribute('href', base + m);
  }
}
