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

export default function SignupNotifications() {
  const [on, setOn] = useState(null);       // this device subscribed?
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

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
      const mine = r.thisPhone;
      setNote((!endpoint || !mine ? 'Sent.' : mine.ok ? 'Sent — it should arrive in a few seconds.' : `Couldn't reach this phone (${mine.status || 'no answer'}). Turn it off and on again.`)
        + (r.email ? ' An email was sent too.' : ''));
    } catch (err) { setNote(err.message || 'Could not send a test.'); }
    setBusy(false);
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header" style={{ marginBottom: 12 }}>
        <div className="card-title"><Bell size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />When a madrasah signs up</div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {on
          ? <button className="btn btn-sm" onClick={turnOff} disabled={busy}><BellOff size={13} />Turn off on this device</button>
          : <button className="btn btn-primary btn-sm" onClick={turnOn} disabled={busy}><Bell size={13} />Turn on phone notifications</button>}
        <button className="btn btn-sm" onClick={test} disabled={busy}><Send size={13} />Send a test</button>
      </div>
      {note && <div className="text-sm" style={{ marginTop: 10, color: 'var(--text-muted)' }}>{note}</div>}
    </div>
  );
}
