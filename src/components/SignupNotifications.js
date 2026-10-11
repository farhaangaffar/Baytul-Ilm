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

export default function SignupNotifications() {
  const [on, setOn] = useState(null);       // this device subscribed?
  const [email, setEmail] = useState(null); // email notifications set up on the server?
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    getPushKey().then(k => setEmail(k.email)).catch(() => {});
    if (!supported()) { setOn(false); return; }
    navigator.serviceWorker.getRegistration().then(reg => reg ? reg.pushManager.getSubscription() : null)
      .then(sub => setOn(!!sub)).catch(() => setOn(false));
  }, []);

  async function turnOn() {
    setBusy(true); setNote('');
    try {
      if (!supported()) throw new Error('This browser can\'t show notifications. On a phone, use the installed app.');
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') throw new Error('Notifications are blocked for this app — allow them in your phone\'s settings, then try again.');
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
      const r = await sendTestNotification();
      setNote(`Sent to ${r.phones} device${r.phones === 1 ? '' : 's'}${r.email ? ' and by email' : ''}.`);
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
      </div>
      {note && <div className="text-sm" style={{ marginTop: 10, color: 'var(--text-muted)' }}>{note}</div>}
    </div>
  );
}
