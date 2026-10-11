import React, { useEffect, useState } from 'react';
import { Bell, BellOff, Send } from 'lucide-react';
import { getPushKey, savePushSubscription, removePushSubscription, sendTestNotification } from '../lib/store';

// Madaaris page: switch on a notification on this phone whenever a madrasah signs up, and
// send a test (also by email once that is set up — server/notify.js).
const b64ToBytes = b64 => {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, c => c.charCodeAt(0));
};
const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

// Makes sure this device runs the latest public/sw.js (the part that shows notifications) —
// an older copy would leave Chrome showing an empty notification of its own.
async function freshWorker() {
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return navigator.serviceWorker.ready;
  await reg.update().catch(() => {});
  const w = reg.installing || reg.waiting;
  if (w) await new Promise(done => {
    const check = () => { if (w.state === 'activated' || w.state === 'redundant') done(); };
    w.addEventListener('statechange', check); check(); setTimeout(done, 5000);
  });
  return reg;
}

// Signs this phone up with its push service (a brand-new registration when `fresh`, e.g. after
// the old one expired) and saves it on the server.
async function subscribeHere(fresh) {
  const reg = await navigator.serviceWorker.ready;
  const old = await reg.pushManager.getSubscription();
  if (old && fresh) await old.unsubscribe().catch(() => {});
  const { publicKey } = await getPushKey();
  const sub = (!fresh && old) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
  await savePushSubscription(sub.toJSON());
  return sub;
}
const expired = r => r.thisPhone && !r.thisPhone.ok && (r.thisPhone.status === 404 || r.thisPhone.status === 410);

// With ?debug in the address, or after tapping the card's title 5 times: what this phone's app
// last received (public/sw.js notes it), and which address it runs on.
const DEBUG = typeof window !== 'undefined' && /[?&]debug\b/.test(window.location.search);
async function debugInfo() {
  const out = { site: window.location.host };
  try { const hit = await (await caches.open('suhuf-push-log')).match('/__push-log'); out.last = hit ? await hit.json() : null; } catch { out.last = 'unreadable'; }
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && await reg.pushManager.getSubscription();
    out.endpoint = sub ? sub.endpoint.slice(-12) : 'none';
    out.permission = Notification.permission;
    out.worker = reg && reg.active ? await new Promise(done => {
      const ch = new MessageChannel(); ch.port1.onmessage = e => done(e.data); reg.active.postMessage('version', [ch.port2]); setTimeout(() => done('?'), 2000);
    }) : 'none';
  } catch (err) { out.error = String(err); }
  return out;
}

export default function SignupNotifications() {
  const [on, setOn] = useState(null);       // this device subscribed?
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [debug, setDebug] = useState(null);
  const [debugOn, setDebugOn] = useState(DEBUG);
  const [taps, setTaps] = useState(0);
  useEffect(() => {
    if (!debugOn) return undefined;
    const tick = () => debugInfo().then(setDebug);
    tick(); const t = setInterval(tick, 3000); return () => clearInterval(t);
  }, [debugOn]);

  useEffect(() => {
    if (!supported()) { setOn(false); return; }
    freshWorker().catch(() => {});
    // Re-save this phone's details each visit, so the server never holds an out-of-date copy.
    navigator.serviceWorker.getRegistration().then(reg => reg ? reg.pushManager.getSubscription() : null)
      .then(sub => { setOn(!!sub); if (sub) savePushSubscription(sub.toJSON()).catch(() => {}); }).catch(() => setOn(false));
  }, []);

  async function turnOn() {
    setBusy(true); setNote('');
    try {
      if (!supported()) throw new Error('This browser can\'t show notifications. On a phone, use the installed app.');
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') throw new Error('Notifications are blocked for this app — allow them in your phone\'s settings, then try again.');
      await freshWorker();
      await subscribeHere(false);
      setOn(true); setNote('On — you\'ll get a notification on this device when a madrasah signs up.');
    } catch (err) { setNote(err.message || 'Could not switch notifications on.'); }
    setBusy(false);
  }
  async function turnOff() {
    setBusy(true); setNote('');
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg && await reg.pushManager.getSubscription();
      if (sub) { await removePushSubscription(sub.endpoint); await sub.unsubscribe(); }
      setOn(false);
    } catch (err) { setNote(err.message || 'Could not switch notifications off.'); }
    setBusy(false);
  }
  async function test() {
    setBusy(true); setNote('');
    try {
      let endpoint = '';
      if (supported()) {
        const reg = await freshWorker().catch(() => null);
        const sub = reg && await reg.pushManager.getSubscription();
        if (sub) { endpoint = sub.endpoint; await savePushSubscription(sub.toJSON()); }
      }
      let r = await sendTestNotification(endpoint);
      // This phone's registration has expired: make a new one and try once more.
      if (expired(r) && Notification.permission === 'granted') {
        endpoint = (await subscribeHere(true)).endpoint;
        r = await sendTestNotification(endpoint);
      }
      const mine = r.thisPhone;
      setNote((!endpoint || !mine ? 'Sent.' : mine.ok ? 'Sent — it should arrive in a few seconds.' : `Couldn't reach this phone (${mine.status || 'no answer'}). Tap Turn off on this device, then turn it on again.`)
        + (r.email ? ' An email was sent too.' : ''));
    } catch (err) { setNote(err.message || 'Could not send a test.'); }
    setBusy(false);
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header" style={{ marginBottom: 12 }}>
        <div className="card-title" onClick={() => { const n = taps + 1; setTaps(n); if (n >= 5) setDebugOn(true); }}><Bell size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />When a madrasah signs up</div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {on
          ? <button className="btn btn-sm" onClick={turnOff} disabled={busy}><BellOff size={13} />Turn off on this device</button>
          : <button className="btn btn-primary btn-sm" onClick={turnOn} disabled={busy}><Bell size={13} />Turn on phone notifications</button>}
        <button className="btn btn-sm" onClick={test} disabled={busy}><Send size={13} />Send a test</button>
      </div>
      {note && <div className="text-sm" style={{ marginTop: 10, color: 'var(--text-muted)' }}>{note}</div>}
      {debug && <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', marginTop: 10, color: 'var(--text-muted)' }}>{JSON.stringify(debug, null, 1)}</pre>}
    </div>
  );
}
