// Visitor counts (Vercel Web Analytics) for the public side only: the front page, the privacy
// policy and terms, and the demo. Nothing is counted inside a real madrasah's app, no cookies
// are used and no one is identified. Vercel serves the script only on the live site, so this
// does nothing locally or on preview links.
const LIVE = typeof window !== 'undefined' && /(^|\.)suhuf\.uk$/.test(window.location.hostname);
let loaded = false;

export function countVisit(path) {
  if (!LIVE) return;
  if (!loaded) {
    loaded = true;
    window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
    const script = document.createElement('script');
    script.src = '/_vercel/insights/script.js';
    script.defer = true;
    script.dataset.disableAutoTrack = '1'; // only the visits counted here, never pages after sign-in
    document.head.appendChild(script);
  }
  window.va('pageview', { route: path, path });
}
