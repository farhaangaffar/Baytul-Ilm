import React, { useState, useEffect } from 'react';
import { Rocket, Check, ArrowLeft } from 'lucide-react';
import { signUp, suggestSignupCode, signupCodeFree } from '../lib/store';
import { setMadrasahCode } from '../lib/madrasahCode';
import { APP_NAME, APP_NAME_ARABIC } from '../lib/branding';
import { LegalModal } from '../components/Legal';
import { countVisit } from '../lib/analytics';

// "Start free" (/?start, from the front page): a madrasah signs itself up — its name, the
// head's name, email (their login), phone and a password — and is straight in as its head,
// free for 6 months (server/routes/signup.js). The sign-in code is made from the name and can
// be changed here.
export default function Signup({ onDone }) {
  const [f, setF] = useState({ madrasahName: '', headName: '', email: '', phone: '', password: '', website: '' });
  const [code, setCode] = useState('');
  const [codeEdited, setCodeEdited] = useState(false);
  const [editingCode, setEditingCode] = useState(false);
  const [codeFree, setCodeFree] = useState(true);
  const [agree, setAgree] = useState(false);
  const [legal, setLegal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = k => e => { setF({ ...f, [k]: e.target.value }); setError(''); };

  useEffect(() => { countVisit('/start'); }, []);
  // Suggest a sign-in code from the madrasah's name (until they type their own).
  useEffect(() => {
    if (codeEdited || f.madrasahName.trim().length < 2) return undefined;
    const t = setTimeout(() => suggestSignupCode(f.madrasahName).then(r => { setCode(r.code); setCodeFree(true); }).catch(() => {}), 350);
    return () => clearTimeout(t);
  }, [f.madrasahName, codeEdited]);
  // Check a code they typed themselves.
  useEffect(() => {
    if (!codeEdited || !code) return undefined;
    const t = setTimeout(() => signupCodeFree(code).then(r => setCodeFree(r.available)).catch(() => {}), 350);
    return () => clearTimeout(t);
  }, [code, codeEdited]);

  const ready = f.madrasahName.trim() && f.headName.trim() && f.email.trim() && f.password.length >= 8 && agree && code && codeFree;

  async function submit(e) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true); setError('');
    try {
      const r = await signUp({ ...f, code, agree: true });
      setMadrasahCode(r.code);
      countVisit('/start/done');
      window.history.replaceState(null, '', '/');
      await onDone();
    } catch (err) { setError(err.message || 'Something went wrong — please try again.'); setBusy(false); }
  }

  const field = (label, k, props = {}, hint) => (
    <div className="form-group" style={{ textAlign: 'left', marginBottom: 12 }}>
      <label>{label}</label>
      <input value={f[k]} onChange={set(k)} {...props} />
      {hint && <span style={{ fontSize: 11.5, color: 'var(--text-soft)', marginTop: 4 }}>{hint}</span>}
    </div>
  );
  const linkBtn = { background: 'none', border: 'none', padding: 0, color: 'var(--blue)', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 'inherit', textDecoration: 'underline' };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--page)', padding: 20 }}>
      <form className="card" style={{ width: '100%', maxWidth: 420 }} onSubmit={submit}>
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{ fontFamily: "'Amiri', serif", fontSize: 26, color: 'var(--ink)' }}>{APP_NAME_ARABIC}</div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>Start {APP_NAME} free</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>Free for 6 months, then £20 a month. No card needed.</div>
        </div>
        {field("Your madrasah's name", 'madrasahName', { placeholder: 'e.g. Madrasatul Huda', autoFocus: true, maxLength: 80 })}
        {field('Your name', 'headName', { placeholder: 'The head or person in charge', autoComplete: 'name', maxLength: 80 })}
        {field('Email', 'email', { type: 'email', autoComplete: 'email', autoCapitalize: 'none', spellCheck: false }, 'This is how you sign in.')}
        {field('Phone (optional)', 'phone', { type: 'tel', autoComplete: 'tel', placeholder: 'So we can help you get set up' })}
        {field('Choose a password', 'password', { type: 'password', autoComplete: 'new-password' }, 'At least 8 characters.')}
        {/* Only bots fill this in. */}
        <input value={f.website} onChange={set('website')} tabIndex={-1} autoComplete="off" aria-hidden="true"
          style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }} name="website" />

        {code && (
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 12, textAlign: 'left' }}>
            {editingCode ? (
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Madrasah code</label>
                <input value={code} onChange={e => { setCode(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); setCodeEdited(true); setError(''); }}
                  autoCapitalize="none" spellCheck={false} maxLength={30} />
                <span style={{ fontSize: 11.5, marginTop: 4, color: codeFree ? 'var(--text-soft)' : 'var(--red)' }}>
                  {codeFree ? 'Your teachers and parents type this once to sign in.' : 'Another madrasah already uses that — try another.'}
                </span>
              </div>
            ) : (
              <>Your madrasah code: <strong>{code}</strong> <button type="button" style={linkBtn} onClick={() => setEditingCode(true)}>change</button></>
            )}
          </div>
        )}

        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, textAlign: 'left', marginBottom: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} style={{ marginTop: 2 }} />
          <span>I agree to the <button type="button" style={linkBtn} onClick={() => setLegal('terms')}>terms of use</button> and <button type="button" style={linkBtn} onClick={() => setLegal('privacy')}>privacy policy</button> for my madrasah.</span>
        </label>
        {error && <div style={{ fontSize: 12.5, color: 'var(--red)', marginBottom: 12, textAlign: 'left' }}>{error}</div>}
        <button type="submit" className="btn btn-primary" disabled={!ready || busy} style={{ width: '100%', justifyContent: 'center' }}>
          {busy ? 'Setting up…' : <><Rocket size={14} />Start free</>}
        </button>
        <div style={{ display: 'grid', gap: 6, marginTop: 14, fontSize: 12, color: 'var(--text-muted)', textAlign: 'left' }}>
          {['Every feature included — AI reports too', 'Add your classes and students in minutes', 'No contract — leave any time'].map(t => (
            <div key={t} style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Check size={13} color="var(--green-text)" />{t}</div>
          ))}
        </div>
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <a href="/?signin" style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Already using {APP_NAME}? Sign in</a>
          {' · '}
          <a href="/about" style={{ fontSize: 12.5, color: 'var(--text-muted)' }}><ArrowLeft size={11} style={{ verticalAlign: -1 }} /> Back</a>
        </div>
      </form>
      {legal && <LegalModal kind={legal} onClose={() => setLegal(null)} />}
    </div>
  );
}
