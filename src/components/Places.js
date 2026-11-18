// Switch (the owner's plan): one person can belong to more than one madrasah or school on Suhuf — a teacher at a maktab
// and a school, a parent with children at two. "Your places" lists the ones this device is signed in to: tap one to switch
// (no password — server/auth.js keeps each sign-in), "Add another madrasah or school" signs in to one more without leaving
// this one (/?add → Login's add mode), "Sign out of everything" clears them all. Each place stays completely separate.
// Never for pupils or demos.
import React, { useState } from 'react';
import { X, Check, Plus, LogOut } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { useSettings } from '../lib/SettingsContext';
import { switchPlace, logout } from '../lib/store';
import { setMadrasahCode } from '../lib/madrasahCode';
import { useBackToClose } from '../lib/useBackToClose';

const ROLE = { owner: 'Head', teacher: 'Teacher', parent: 'Parent' };
const KIND = { maktab: 'Maktab', darul_uloom: 'Darul Uloom', school: 'School' };
const sub = (role, kind) => [ROLE[role], KIND[kind]].filter(Boolean).join(' · ');

// Opening a place: remember its code on this device (its name, logo and app icon follow), then start the app afresh in it.
export function openPlace(code) { if (code) setMadrasahCode(code); window.location.assign('/'); }

export default function PlacesModal({ onClose }) {
  const { user } = useAuth();
  const settings = useSettings();
  const close = useBackToClose(true, onClose);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const others = user?.others || [];
  async function go(id) {
    setBusy(id); setError('');
    try { const r = await switchPlace(id); openPlace(r.madrasah?.code); }
    catch (e) { setError(e.message || 'Could not switch'); setBusy(''); }
  }
  async function signOutAll() {
    setBusy('out');
    await logout(true).catch(() => {});
    window.location.assign('/');
  }
  const line = { display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left' };
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && close()}>
      <div className="modal" style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <div className="modal-title">Your places</div>
          <button className="btn btn-icon" onClick={close}><X size={16} /></button>
        </div>
        <div className="modal-body" style={{ display: 'grid', gap: 6 }}>
          <div className="line-row on" style={{ ...line, cursor: 'default' }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="line-row-name" style={{ display: 'block' }}>{settings?.schoolName || user?.madrasah?.name}</span>
              <span className="line-row-sub" style={{ display: 'block' }}>{sub(user?.role, user?.madrasah?.kind)} · In use</span>
            </span>
            <Check size={16} />
          </div>
          {others.map(o => (
            <button key={o.id} type="button" className="line-row" style={line} disabled={!!busy} onClick={() => go(o.id)}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="line-row-name" style={{ display: 'block' }}>{o.madrasah.name}</span>
                <span className="line-row-sub" style={{ display: 'block' }}>{busy === o.id ? 'Opening…' : sub(o.role, o.madrasah.kind)}</span>
              </span>
              <span style={{ fontSize: 12.5, color: 'var(--teal)' }}>Switch</span>
            </button>
          ))}
          <button type="button" className="line-row add" style={{ marginTop: 4 }} disabled={!!busy} onClick={() => window.location.assign('/?add')}>
            <Plus size={13} /> Add another madrasah or school
          </button>
          <div className="text-muted" style={{ fontSize: 12, marginTop: 2 }}>
            {others.length ? 'Each place stays separate — switching never needs your password again on this device.'
              : "Belong to another madrasah or school on Suhuf too? Add it here and switch between them without signing in each time."}
          </div>
          {error && <div style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>}
        </div>
        {others.length > 0 && (
          <div className="modal-footer">
            <button className="btn" disabled={!!busy} onClick={signOutAll}><LogOut size={13} />{busy === 'out' ? 'Signing out…' : 'Sign out of everything'}</button>
          </div>
        )}
      </div>
    </div>
  );
}
