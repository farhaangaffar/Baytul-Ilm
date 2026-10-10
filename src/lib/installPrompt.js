// "Install app" support. Chrome/Edge (Android, Windows, Mac) fire
// beforeinstallprompt when the app is installable, but no longer reliably show
// their own install pop-up — so the event is kept here and replayed from our own
// button. Chrome only fires it when it chooses to (not after a dismissal, a failed
// install, or before enough use), and iPhone/iPad Safari never does — so the
// button is always offered outside the installed app, and falls back to that
// browser's manual install steps whenever there's no event to replay.
// Imported by src/index.js so the listener is attached before the event can fire.
import { useEffect, useState } from 'react';

let deferred = null;
const listeners = new Set();
const notify = () => listeners.forEach(fn => fn());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; notify(); });
  window.addEventListener('appinstalled', () => { deferred = null; notify(); });
}

export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isIOS() {
  const ua = window.navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

function isAndroid() { return /Android/.test(window.navigator.userAgent); }

// The browser's own install steps, shown in a pop-up (components/InstallSteps.js) when
// there's no install event to replay — always the case on iPhone and iPad.
const MANUAL_STEPS = {
  ios: { title: 'Add to your Home Screen', steps: [
    'Tap the Share button — the square with an arrow, at the bottom of Safari (or top right on iPad).',
    'Scroll down and tap "Add to Home Screen".',
    'Tap "Add". The app now opens from its own icon, like any other app.',
  ], note: 'Use Safari for this. In another browser, open this page in Safari first.' },
  android: { title: 'Install the app', steps: [
    'Tap Chrome\'s menu (⋮) at the top right.',
    'Choose "Install app" or "Add to Home screen".',
  ], note: 'If it\'s already on your home screen, open it from there.' },
  desktop: { title: 'Install the app', steps: [
    'Click the install icon at the right of the address bar,',
    'or open the browser menu (⋮) and choose "Install" (Chrome: Cast, save and share → Install page as app).',
  ], note: 'If it\'s already installed, open it from your Start menu or desktop.' },
};
let steps = null; // the steps pop-up currently open, if any

// → { available, install, steps, closeSteps } — `available` is false only when opened as the
// installed app; `steps` is the manual-install pop-up to show (null when closed).
export function useInstallPrompt() {
  const [, rerender] = useState(0);
  useEffect(() => {
    const fn = () => rerender(n => n + 1);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);

  const available = !isStandalone();

  async function install() {
    if (deferred) {
      const e = deferred;
      deferred = null;
      notify();
      await e.prompt();
      return;
    }
    steps = isIOS() ? MANUAL_STEPS.ios : isAndroid() ? MANUAL_STEPS.android : MANUAL_STEPS.desktop;
    notify();
  }
  function closeSteps() { steps = null; notify(); }

  return { available, install, steps, closeSteps };
}
