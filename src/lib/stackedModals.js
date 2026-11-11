// A pop-up opened on top of another is never narrower than the one under it (the owner's ask — e.g. a quiz, then one of
// its questions, or a pupil's answers, opened smaller than the quiz). Works for every pop-up in the app (`.modal`), so new
// ones get it too: when two or more are open, each later one is widened to at least the width of the one beneath it
// (its own max-width is kept in data-own-width and put back when it's the bottom one again). Phones are unchanged — there
// every pop-up is already the screen's width.
let queued = false;

function fit() {
  queued = false;
  const open = [...document.querySelectorAll('.modal')].filter(m => m.isConnected && m.getClientRects().length);
  let under = 0;
  open.forEach((m, i) => {
    if (m.dataset.ownWidth === undefined) m.dataset.ownWidth = m.style.maxWidth || '';
    const own = m.dataset.ownWidth;
    if (i === 0) {
      if (m.style.maxWidth !== own) m.style.maxWidth = own;
    } else {
      m.style.maxWidth = own; // measure at its own width first
      if (m.getBoundingClientRect().width < under - 1) m.style.maxWidth = `${Math.ceil(under)}px`;
    }
    under = Math.max(under, m.getBoundingClientRect().width);
  });
}

export function matchStackedModals() {
  if (typeof MutationObserver === 'undefined' || !document.body) return;
  const later = () => { if (!queued) { queued = true; requestAnimationFrame(fit); } };
  new MutationObserver(later).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', later);
}
