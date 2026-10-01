import React, { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { changePassword } from '../lib/store';

// Any signed-in user changing their own password. Other devices signed in to the
// same account are signed out; this one stays signed in.
export default function ChangePasswordModal({ onClose }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (next !== confirm) { setError("The two new passwords don't match."); return; }
    setSaving(true); setError('');
    try { await changePassword(current, next); setDone(true); }
    catch (err) { setError(err.message || 'Could not change your password'); }
    setSaving(false);
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="modal" style={{ maxWidth: 380 }}>
        <form onSubmit={submit}>
          <div className="modal-body" style={{ paddingTop: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <KeyRound size={16} /> Change your password
            </div>
            {done ? (
              <div style={{ fontSize: 13, color: 'var(--green-text)' }}>Password changed. Use the new one next time you sign in.</div>
            ) : (
              <>
                {[['Current password', current, setCurrent, 'current-password'],
                  ['New password (8+ characters)', next, setNext, 'new-password'],
                  ['Type the new password again', confirm, setConfirm, 'new-password']].map(([label, value, set, ac]) => (
                  <div className="form-group" key={label} style={{ marginBottom: 12 }}>
                    <label>{label}</label>
                    <input type="password" autoComplete={ac} value={value} onChange={e => { set(e.target.value); setError(''); }} />
                  </div>
                ))}
                {error && <div style={{ fontSize: 12.5, color: 'var(--red)' }}>{error}</div>}
              </>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn" onClick={onClose} disabled={saving}>{done ? 'Close' : 'Cancel'}</button>
            {!done && <button type="submit" className="btn btn-primary" disabled={saving || !current || !next || !confirm}>{saving ? 'Saving…' : 'Change password'}</button>}
          </div>
        </form>
      </div>
    </div>
  );
}
