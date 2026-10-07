import React, { useState, useEffect } from 'react';
import { LegalLinks } from '../components/Legal';
import { login, setupOwner, recoverOwner, getSettings } from '../lib/store';
import { getBranding, setBranding, isNeutralBranding, APP_NAME, APP_NAME_ARABIC, APP_TAGLINE } from '../lib/branding';
import { getMadrasahCode, setMadrasahCode } from '../lib/madrasahCode';
import { LogIn, KeyRound, UserPlus, PlayCircle } from 'lucide-react';
import { DemoChooser } from '../components/Demo';

// Three screens share this card:
//  - sign in (madrasah code + username or email + password)
//  - first-time setup: the old shared password, once, to create the very first owner
//    account — shown when the server says no owner exists yet
//  - recovery: the recovery key (that same password) to reset a forgotten platform-owner
//    password
// Many madaaris share this site, so a device remembers the code of the madrasah it
// signs in to (src/lib/madrasahCode.js): the code is typed once, and the screen then
// shows that madrasah's name.
// A fourth screen, "Try the demo" (also opened by a link ending ?demo), offers a made-up
// madrasah to look around as its head, a teacher or a parent (components/Demo.js).
const demoLink = () => { try { return new URLSearchParams(window.location.search).has('demo'); } catch { return false; } };

export default function Login({ setupRequired, notice, onSuccess }) {
  const [mode, setMode] = useState(() => (!setupRequired && demoLink() ? 'demo' : 'signin')); // 'signin' | 'setup' | 'recover' | 'demo'
  const [code, setCode] = useState(getMadrasahCode());
  const [editingCode, setEditingCode] = useState(!getMadrasahCode());
  const [loginName, setLoginName] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [branding, setBrandingState] = useState(getBranding());

  // A madrasah's name is public (api/settings serves it before sign-in, by code), so the
  // login screen shows the madrasah this device belongs to — or a neutral name.
  useEffect(() => {
    getSettings().then(s => {
      if (s.schoolName) { setBranding({ schoolName: s.schoolName, schoolNameArabic: s.schoolNameArabic }); setBrandingState(getBranding()); }
    }).catch(() => {});
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

  // Remember which madrasah this device signs in to.
  function remember(result) {
    if (result?.madrasah?.code) setMadrasahCode(result.madrasah.code);
  }

  function submitSignIn(e) {
    e.preventDefault();
    if (!password) return;
    run(async () => {
      const result = await login(code.trim().toLowerCase(), loginName, password);
      if (result.setupRequired) {
        // The school password was right, but there's no owner account yet.
        setRecoveryKey(password);
        setPassword('');
        switchMode('setup');
        return;
      }
      remember(result);
      onSuccess();
    });
  }

  function submitNewPassword(e) {
    e.preventDefault();
    if (newPassword !== confirm) { setError("The two passwords don't match."); return; }
    run(async () => {
      const result = mode === 'setup' ? await setupOwner(recoveryKey, loginName, newPassword) : await recoverOwner(recoveryKey, newPassword);
      remember(result);
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

  const usernameProps = { autoCapitalize: 'none', autoCorrect: 'off', autoComplete: 'username', spellCheck: false };
  const neutral = isNeutralBranding();
  const linkBtn = { background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12.5, cursor: 'pointer', fontFamily: 'var(--font)' };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--page)', padding: 20 }}>
      <div className="card" style={{ width: '100%', maxWidth: mode === 'demo' ? 440 : 360, textAlign: 'center' }}>
        {mode !== 'demo' && (neutral ? <>
          {/* No madrasah on this device yet: the app's own name. */}
          <div style={{ fontFamily: "'Amiri', serif", fontSize: 28, color: 'var(--ink)', marginBottom: 0 }}>{APP_NAME_ARABIC}</div>
          <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--ink)' }}>{APP_NAME}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>{APP_TAGLINE}</div>
        </> : <>
          {branding.schoolNameArabic && <div style={{ fontFamily: "'Amiri', serif", fontSize: 26, color: 'var(--ink)', marginBottom: 4 }}>{branding.schoolNameArabic}</div>}
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>{branding.schoolName}</div>
        </>)}

        {mode === 'demo' && (
          <>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>Try the demo</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 16 }}>
              A made-up madrasah, just for you. Change anything — it's deleted after a day. Who would you like to be?
            </div>
            <DemoChooser />
            <button type="button" onClick={() => switchMode('signin')} style={{ ...linkBtn, marginTop: 14 }}>Back to sign in</button>
          </>
        )}

        {mode === 'signin' && (
          <form onSubmit={submitSignIn}>
            {notice && <div style={{ fontSize: 12.5, background: 'var(--red-light)', color: 'var(--red-text)', borderRadius: 'var(--r-md)', padding: '8px 12px', marginBottom: 14, textAlign: 'left' }}>{notice}</div>}
            {setupRequired ? (
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 16, textAlign: 'left' }}>
                <strong>First time with individual logins?</strong> Enter the school password to set up your own account.
              </div>
            ) : (
              <>
                {editingCode ? (
                  <div className="form-group" style={{ textAlign: 'left', marginBottom: 14 }}>
                    <label>Madrasah code</label>
                    <input value={code} onChange={e => { setCode(e.target.value); setError(''); }} placeholder="e.g. al-noor" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
                    <span style={{ fontSize: 11.5, color: 'var(--text-soft)', marginTop: 4 }}>From your madrasah office. This device remembers it after you sign in.</span>
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14, textAlign: 'left' }}>
                    Madrasah code: <strong>{code}</strong>{' '}
                    <button type="button" style={{ ...linkBtn, fontSize: 12, textDecoration: 'underline', padding: 0 }} onClick={() => setEditingCode(true)}>change</button>
                  </div>
                )}
                {field('Username or email', loginName, setLoginName, { ...usernameProps, autoFocus: !editingCode })}
              </>
            )}
            {field(setupRequired ? 'School password' : 'Password', password, setPassword, { type: 'password', autoComplete: 'current-password', autoFocus: setupRequired })}
            {error && <div style={{ fontSize: 12.5, color: 'var(--red)', marginBottom: 14, textAlign: 'left' }}>{error}</div>}
            {submitBtn(<LogIn size={14} />, 'Sign in', 'Signing in…', !password || (!setupRequired && (!loginName || !code.trim())))}
            {!setupRequired && (
              <button type="button" onClick={() => switchMode('recover')} style={{ ...linkBtn, marginTop: 14 }}>
                Forgot the platform owner password?
              </button>
            )}
            {!setupRequired && (
              <div style={{ fontSize: 11.5, color: 'var(--text-soft)', marginTop: 6 }}>Everyone else: ask the madrasah office to reset your password.</div>
            )}
            {/* Only on a device that isn't any madrasah's yet, so a madrasah's own people
                don't see it; the ?demo link works anywhere. */}
            {!setupRequired && !getMadrasahCode() && (
              <button type="button" className="btn" onClick={() => switchMode('demo')} style={{ width: '100%', justifyContent: 'center', marginTop: 18 }}>
                <PlayCircle size={14} />Try the demo
              </button>
            )}
          </form>
        )}

        {mode === 'setup' && (
          <form onSubmit={submitNewPassword}>
            <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 6 }}>Create your owner account</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 16, textAlign: 'left' }}>
              This is your own super-admin login from now on. The school password won't sign anyone in after this — keep it as your recovery key.
            </div>
            {field('Your email address or a username', loginName, setLoginName, { ...usernameProps, autoFocus: true })}
            {field('Choose a password (8+ characters)', newPassword, setNewPassword, { type: 'password', autoComplete: 'new-password' })}
            {field('Type the password again', confirm, setConfirm, { type: 'password', autoComplete: 'new-password' })}
            {error && <div style={{ fontSize: 12.5, color: 'var(--red)', marginBottom: 14, textAlign: 'left' }}>{error}</div>}
            {submitBtn(<UserPlus size={14} />, 'Create account', 'Creating…', !loginName || !newPassword || !confirm)}
          </form>
        )}

        {mode === 'recover' && (
          <form onSubmit={submitNewPassword}>
            <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 6 }}>Reset the platform owner password</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 16, textAlign: 'left' }}>
              Enter the recovery key (the school password kept in Vercel) and choose a new password.
            </div>
            {field('Recovery key', recoveryKey, setRecoveryKey, { type: 'password', autoFocus: true, autoComplete: 'off' })}
            {field('New password (8+ characters)', newPassword, setNewPassword, { type: 'password', autoComplete: 'new-password' })}
            {field('Type it again', confirm, setConfirm, { type: 'password', autoComplete: 'new-password' })}
            {error && <div style={{ fontSize: 12.5, color: 'var(--red)', marginBottom: 14, textAlign: 'left' }}>{error}</div>}
            {submitBtn(<KeyRound size={14} />, 'Reset password', 'Resetting…', !recoveryKey || !newPassword || !confirm)}
            <button type="button" onClick={() => switchMode('signin')} style={{ ...linkBtn, marginTop: 14 }}>
              Back to sign in
            </button>
          </form>
        )}
      </div>
      <LegalLinks style={{ marginTop: 14 }} />
    </div>
  );
}
