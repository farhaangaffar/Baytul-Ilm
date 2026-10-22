// "Recommend Suhuf": a madrasah's link is suhuf.uk/?ref=<its code>. The code is remembered on this device (for 90 days),
// so someone who reads the front page first and taps "Start free" later still signs up as recommended — and the
// recommending madrasah gets a month free (server/newMadrasah.js giveReferralMonth).
const KEY = 'suhuf-ref';
const DAYS = 90;

export function rememberReferral() {
  try {
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (ref && /^[a-z0-9-]{2,40}$/i.test(ref)) localStorage.setItem(KEY, JSON.stringify({ code: ref.toLowerCase(), at: Date.now() }));
  } catch { /* private mode — the link still works for this visit */ }
}

export function referralCode() {
  const fromUrl = new URLSearchParams(window.location.search).get('ref');
  if (fromUrl) return fromUrl.toLowerCase();
  try {
    const r = JSON.parse(localStorage.getItem(KEY) || 'null');
    return r && Date.now() - r.at < DAYS * 864e5 ? r.code : '';
  } catch { return ''; }
}

export const referralLink = code => `https://suhuf.uk/?ref=${encodeURIComponent(code)}`;
