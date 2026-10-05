import React, { useState } from 'react';
import { LayoutDashboard, BookOpen, Users, Repeat, LogOut } from 'lucide-react';
import { startDemo, logout } from '../lib/store';

// "Try the demo" (server/demo.js): a private, made-up madrasah that deletes itself after
// a day. The visitor picks who to be — the head, a teacher or a parent — and can switch
// at any time from the bar shown on every page while in a demo.

const ROLES = [
  { role: 'head', icon: LayoutDashboard, title: 'Headteacher', who: 'Demo Madrasah',
    text: 'Everything: students, attendance, fees, Qur\'an progress, reports and settings.' },
  { role: 'teacher', icon: BookOpen, title: 'Teacher', who: 'Ustadh Yusuf · Hifdh Class',
    text: 'Their own class: the register, daily records and Qur\'an progress, ticking fees paid.' },
  { role: 'parent', icon: Users, title: 'Parent', who: 'The Rahman family · two children',
    text: 'Their children\'s attendance, fees, reports and Qur\'an progress; reporting an absence.' },
];

const SIGNED_IN_ROLE = { owner: 'head', teacher: 'teacher', parent: 'parent' };

// Start (or switch within) a demo, then open the app afresh as that person.
async function enter(role) {
  await startDemo(role);
  window.location.assign('/');
}

export function DemoChooser({ current }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function choose(role) {
    setBusy(role); setError('');
    try { await enter(role); }
    catch (err) { setError(err.message || 'Could not open the demo — try again.'); setBusy(''); }
  }

  return (
    <div style={{ display: 'grid', gap: 10, textAlign: 'left' }}>
      {ROLES.map(({ role, icon: Icon, title, who, text }) => {
        const here = current === role;
        return (
          <button key={role} type="button" onClick={() => choose(role)} disabled={!!busy || here}
            style={{ display: 'flex', gap: 12, alignItems: 'flex-start', textAlign: 'left', width: '100%', padding: '14px 14px', borderRadius: 14,
              border: `1px solid ${here ? 'var(--green)' : '#dfe3e8'}`, background: here ? 'var(--green-light)' : 'var(--surface)',
              cursor: busy || here ? 'default' : 'pointer', fontFamily: 'var(--font)', color: 'var(--text)', opacity: busy && busy !== role ? 0.6 : 1 }}>
            <span style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--ink)', color: '#fff' }}>
              <Icon size={18} />
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 700, fontSize: 14.5 }}>
                {title}{here && <span style={{ fontWeight: 600, fontSize: 11.5, color: 'var(--green-text)', marginLeft: 8 }}>You're here</span>}
                {busy === role && <span style={{ fontWeight: 500, fontSize: 11.5, color: 'var(--text-muted)', marginLeft: 8 }}>Opening…</span>}
              </span>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{who}</span>
              <span style={{ display: 'block', fontSize: 12.5, lineHeight: 1.4 }}>{text}</span>
            </span>
          </button>
        );
      })}
      {error && <div style={{ fontSize: 12.5, color: 'var(--red)' }}>{error}</div>}
    </div>
  );
}

// Leaving a demo forgets its name and settings on this device, so the sign-in screen
// goes back to normal.
export async function leaveDemo() {
  await logout().catch(() => {});
  try { localStorage.removeItem('madrasah_branding'); } catch {}
  window.location.assign('/');
}

// The strip across the top of every page while in a demo.
export function DemoBar({ user }) {
  const [switching, setSwitching] = useState(false);
  if (!user?.demo) return null;
  const btn = { display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,0.16)', color: '#fff', border: 'none', borderRadius: 999,
    padding: '5px 11px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', whiteSpace: 'nowrap' };
  const role = SIGNED_IN_ROLE[user.role];
  return (
    <>
      <div style={{ background: 'var(--green-text)', color: '#fff', padding: '7px 16px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, flexShrink: 0 }}>
        <span style={{ flex: 1, minWidth: 0 }} title="Made-up data — change anything; it's deleted after a day.">
          <strong>Demo</strong> · {ROLES.find(r => r.role === role)?.title || user.login} view
        </span>
        <button type="button" style={btn} onClick={() => setSwitching(true)}><Repeat size={13} />Switch view</button>
        <button type="button" style={btn} onClick={leaveDemo}><LogOut size={13} />Leave</button>
      </div>
      {switching && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setSwitching(false)}>
          <div className="modal" style={{ maxWidth: 440, padding: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Switch view</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 14 }}>Same demo madrasah — see it as someone else.</div>
            <DemoChooser current={role} />
            <button type="button" className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }} onClick={() => setSwitching(false)}>Cancel</button>
          </div>
        </div>
      )}
    </>
  );
}
