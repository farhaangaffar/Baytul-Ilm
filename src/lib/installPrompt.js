// "Install app" support. Chrome/Edge (Android, Windows, Mac) fire
// beforeinstallprompt when the app is installable, but no longer reliably show
// their own install pop-up — so the event is kept here and replayed from our own
// button. iPhone/iPad Safari has no such event; installing there is always
// Share → Add to Home Screen, so the button shows those steps instead.
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

// → { available, install } — `available` is false once installed / when opened as the app.
export function useInstallPrompt() {
  const [, rerender] = useState(0);
  useEffect(() => {
    const fn = () => rerender(n => n + 1);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);

  const standalone = isStandalone();
  const ios = isIOS();
  const available = !standalone && (!!deferred || ios);

  async function install() {
    if (deferred) {
      const e = deferred;
      deferred = null;
      notify();
      await e.prompt();
      return;
    }
    if (ios) {
      window.alert('To install this app on your iPhone or iPad:\n\n1. Tap the Share button (the square with an arrow) in Safari\n2. Choose "Add to Home Screen"\n3. Tap "Add"');
    }
  }

  return { available, install };
}
