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

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isIOS() {
  const ua = window.navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

function isAndroid() { return /Android/.test(window.navigator.userAgent); }

const MANUAL_STEPS = {
  ios: 'To install this app on your iPhone or iPad:\n\n1. Tap the Share button (the square with an arrow) in Safari\n2. Choose "Add to Home Screen"\n3. Tap "Add"',
  android: 'To install this app:\n\n1. Tap Chrome\'s menu (⋮) at the top right\n2. Choose "Install app" or "Add to Home screen"\n\nIf it\'s already on your home screen, open it from there instead.',
  desktop: 'To install this app:\n\nClick the install icon at the right of the address bar, or open the browser menu (⋮) and choose "Install" (Chrome: Cast, save and share → Install page as app).\n\nIf it\'s already installed, open it from your Start menu or desktop instead.',
};

// → { available, install } — `available` is false only when opened as the installed app.
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
    window.alert(isIOS() ? MANUAL_STEPS.ios : isAndroid() ? MANUAL_STEPS.android : MANUAL_STEPS.desktop);
  }

  return { available, install };
}
