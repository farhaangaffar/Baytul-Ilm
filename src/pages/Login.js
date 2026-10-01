import React, { useState, useEffect } from 'react';
import { login, setupOwner, recoverOwner, getSettings } from '../lib/store';
import { getBranding, setBranding } from '../lib/branding';
import { LogIn, KeyRound, UserPlus } from 'lucide-react';

// Three screens share this card:
//  - sign in (email address + password)
//  - first-time setup: the school's old shared password, once, to create the owner
//    (super admin) account — shown when the server says no owner exists yet
//  - recovery: the recovery key (that same school password) to reset a forgotten
//    owner password
export default function Login({ setupRequired, onSuccess }) {
  const [mode, setMode] = useState('signin'); // 'signin' | 'setup' | 'recover'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [branding, setBrandingState] = useState(getBranding());

  // The school's name is public (api/settings serves it before sign-in), so the
  // login screen shows whichever madrasah this deployment belongs to.
  useEffect(() => {
    getSettings().then(s => { setBranding({ schoolName: s.schoolName, schoolNameArabic: s.schoolNameArabic }); setBrandingState(getBranding()); }).catch(() => {});
  }, []);

  function switchMode(next) {
    setMode(next); setError(''); setNewPassword(''); setConfirm('');
  }

  async function run(fn) {
    setLoading(true);
    setError('');
    try { await fn(); }
    catch (err) { setError(err.message || 'Something went wrong — try again.'); }
    setLoading(false);
  }

  function submitSignIn(e) {
    e.preventDefault();
    if (!password) return;
    run(async () => {
      const result = await login(email, password);
      if (result.setupRequired) {
        // The school password was right, but there's no owner account yet.
        setRecoveryKey(password);
        setPassword('');
        switchMode('setup');
        return;
      }
      onSuccess();
    });
  }

  function submitNewPassword(e) {
    e.preventDefault();
    if (newPassword !== confirm) { setError("The two passwords don't match."); return; }
    run(async () => {
      if (mode === 'setup') await setupOwner(recoveryKey, email, newPassword);
      else await recoverOwner(recoveryKey, newPassword);
      onSuccess();
    });
  }

  const field = (label, value, onChange, props = {}) => (
    <div className="form-group" style={{ textAlign: 'left', marginBottom: 14 }}>
      <label>{label}</label>
      <input value={value} onChange={e => { onChange(e.target.value); setError(''); }} {...props} />
    </div>
  );

  const submitBtn = (icon, idle, busy, disabled) => (
    <button type="submit" className="btn btn-primary" disabled={loading || disabled} style={{ width: '100%', justifyContent: 'center', padding: '10px' }}>
      {icon}{loading ? busy : idle}
    </button>
  );

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--page)', padding: 20 }}>
      <div className="card" style={{ width: '100%', maxWidth: 360, textAlign: 'center' }}>
        {branding.schoolNameArabic && <div style={{ fontFamily: "'Amiri', serif", fontSize: 26, color: 'var(--ink)', marginBottom: 4 }}>{branding.schoolNameArabic}</div>}
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>{branding.schoolName}</div>

        {mode === 'signin' && (
          <form onSubmit={submitSignIn}>
            {setupRequired ? (
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 16, textAlign: 'left' }}>
                <strong>First time with individual logins?</strong> Enter the school password to set up your own account.
              </div>
            ) : field('Email address', email, setEmail, { type: 'email', inputMode: 'email', autoFocus: true, autoCapitalize: 'none', autoCorrect: 'off', autoComplete: 'username', spellCheck: false })}
            {field(setupRequired ? 'School password' : 'Password', password, setPassword, { type: 'password', autoComplete: 'current-password', autoFocus: setupRequired })}
            {error && <div style={{ fontSize: 12.5, color: 'var(--red)', marginBottom: 14, textAlign: 'left' }}>{error}</div>}
            {submitBtn(<LogIn size={14} />, 'Sign in', 'Signing in…', !password || (!setupRequired && !email))}
            {!setupRequired && (
              <button type="button" onClick={() => switchMode('recover')}
                style={{ marginTop: 14, background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12.5, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                Forgot the owner password?
              </button>
            )}
            {!setupRequired && (
              <div style={{ fontSize: 11.5, color: 'var(--text-soft)', marginTop: 6 }}>Teachers: ask the madrasah office to reset your password.</div>
            )}
          </form>
        )}

        {mode === 'setup' && (
          <form onSubmit={submitNewPassword}>
            <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 6 }}>Create your owner account</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 16, textAlign: 'left' }}>
              This is your own super-admin login from now on. The school password won't sign anyone in after this — keep it as your recovery key.
            </div>
            {field('Your email address', email, setEmail, { type: 'email', inputMode: 'email', autoFocus: true, autoCapitalize: 'none', autoCorrect: 'off', autoComplete: 'username', spellCheck: false })}
            {field('Choose a password (8+ characters)', newPassword, setNewPassword, { type: 'password', autoComplete: 'new-password' })}
            {field('Type the password again', confirm, setConfirm, { type: 'password', autoComplete: 'new-password' })}
            {error && <div style={{ fontSize: 12.5, color: 'var(--red)', marginBottom: 14, textAlign: 'left' }}>{error}</div>}
            {submitBtn(<UserPlus size={14} />, 'Create account', 'Creating…', !email || !newPassword || !confirm)}
          </form>
        )}

        {mode === 'recover' && (
          <form onSubmit={submitNewPassword}>
            <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 6 }}>Reset the owner password</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 16, textAlign: 'left' }}>
              Enter the recovery key (the school password kept in Vercel) and choose a new password.
            </div>
            {field('Recovery key', recoveryKey, setRecoveryKey, { type: 'password', autoFocus: true, autoComplete: 'off' })}
            {field('New password (8+ characters)', newPassword, setNewPassword, { type: 'password', autoComplete: 'new-password' })}
            {field('Type it again', confirm, setConfirm, { type: 'password', autoComplete: 'new-password' })}
            {error && <div style={{ fontSize: 12.5, color: 'var(--red)', marginBottom: 14, textAlign: 'left' }}>{error}</div>}
            {submitBtn(<KeyRound size={14} />, 'Reset password', 'Resetting…', !recoveryKey || !newPassword || !confirm)}
            <button type="button" onClick={() => switchMode('signin')}
              style={{ marginTop: 14, background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12.5, cursor: 'pointer', fontFamily: 'var(--font)' }}>
              Back to sign in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
