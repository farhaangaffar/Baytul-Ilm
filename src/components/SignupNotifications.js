import React, { useEffect, useState } from 'react';
import { Bell, BellOff, Send } from 'lucide-react';
import { getPushKey, savePushSubscription, removePushSubscription, sendTestNotification } from '../lib/store';

// Madaaris page: switch on a notification on this phone whenever a madrasah signs up, and
// see whether sign-up emails are set up (server/notify.js).
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

// Which copy of public/sw.js is running here ('' if none answers — an old copy).
async function workerVersion() {
  const reg = await navigator.serviceWorker.getRegistration();
  const w = reg && reg.active;
  if (!w) return '';
  return new Promise(done => {
    const ch = new MessageChannel();
    ch.port1.onmessage = e => done(String(e.data || ''));
    w.postMessage('version', [ch.port2]);
    setTimeout(() => done(''), 2000);
  });
}

// The service worker's note of the last notification message this phone received, if any.
async function lastPush() {
  try {
    const hit = await (await caches.open('suhuf-push-log')).match('/__push-log');
    return hit ? await hit.json() : null;
  } catch { return null; }
}
const timeAgo = iso => {
  const s = Math.round((Date.now() - new Date(iso)) / 1000);
  return s < 90 ? `${s} seconds ago` : s < 5400 ? `${Math.round(s / 60)} minutes ago` : new Date(iso).toLocaleString('en-GB');
};

export default function SignupNotifications() {
  const [on, setOn] = useState(null);       // this device subscribed?
  const [email, setEmail] = useState(null); // email notifications set up on the server?
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [version, setVersion] = useState(null);
  const [last, setLast] = useState(undefined);
  const checkLast = () => lastPush().then(setLast);
  useEffect(() => { checkLast(); const t = setInterval(checkLast, 3000); return () => clearInterval(t); }, []);

  useEffect(() => {
    getPushKey().then(k => setEmail(k.email)).catch(() => {});
    if (!supported()) { setOn(false); return; }
    freshWorker().catch(() => {}).then(workerVersion).then(v => setVersion(v || 'old')).catch(() => setVersion('old'));
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
      const reg = await navigator.serviceWorker.ready;
      const { publicKey } = await getPushKey();
      const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
      await savePushSubscription(sub.toJSON());
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
  // Shows a notification straight from this page — no internet involved — to check this
  // phone displays them at all.
  async function showHere() {
    setBusy(true); setNote('');
    try {
      if (!supported()) throw new Error('This browser can\'t show notifications.');
      if (Notification.permission !== 'granted' && (await Notification.requestPermission()) !== 'granted') throw new Error('Notifications are blocked for this app in your phone\'s settings.');
      const reg = await freshWorker();
      await reg.showNotification('Suhuf — test on this phone', { body: 'If you can read this, this phone shows notifications.', icon: '/icons/book-192.png', tag: 'suhuf-local', vibrate: [200, 100, 200] });
      setNote('Shown on this phone (check the notification bar).');
      setVersion((await workerVersion()) || 'old');
    } catch (err) { setNote(err.message || 'Could not show one.'); }
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
      const r = await sendTestNotification(endpoint);
      const here = !endpoint ? 'This device isn\'t switched on.'
        : !r.thisPhone ? 'This phone wasn\'t found — turn notifications off and on again.'
        : r.thisPhone.ok ? `Sent to this phone (accepted, ${r.thisPhone.status}). It should arrive within a minute.`
        : `This phone's notification service refused it (${r.thisPhone.status || 'no answer'}): ${r.thisPhone.error || 'no details'}`;
      setNote(`${here} ${r.phones} of ${r.devices} device${r.devices === 1 ? '' : 's'} reached${r.email ? ', and sent by email' : ''}.`);
    } catch (err) { setNote(err.message || 'Could not send a test.'); }
    setBusy(false);
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header" style={{ marginBottom: 6 }}>
        <div className="card-title"><Bell size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />When a madrasah signs up</div>
      </div>
      <div className="text-muted text-sm" style={{ marginBottom: 12 }}>
        Phone notification on this device: <strong style={{ color: 'var(--ink)' }}>{on === null ? '…' : on ? 'On' : 'Off'}</strong>
        {' · '}Email: <strong style={{ color: 'var(--ink)' }}>{email === null ? '…' : email ? 'On' : 'Not set up yet'}</strong>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {on
          ? <button className="btn btn-sm" onClick={turnOff} disabled={busy}><BellOff size={13} />Turn off on this device</button>
          : <button className="btn btn-primary btn-sm" onClick={turnOn} disabled={busy}><Bell size={13} />Turn on phone notifications</button>}
        <button className="btn btn-sm" onClick={test} disabled={busy}><Send size={13} />Send a test</button>
        <button className="btn btn-sm" onClick={showHere} disabled={busy}><Bell size={13} />Show one here</button>
      </div>
      {version && <div style={{ fontSize: 11, color: 'var(--text-soft)', marginTop: 8 }}>
        App helper: {version} · Last message this phone received: {last === undefined ? '…' : !last ? 'none yet'
          : `${timeAgo(last.at)}${last.shown ? ' (shown)' : ` (couldn't show: ${last.error})`}`}
      </div>}
      {note && <div className="text-sm" style={{ marginTop: 10, color: 'var(--text-muted)' }}>{note}</div>}
    </div>
  );
}
