import React, { useState, useEffect } from 'react';
import { Rocket, Check, ArrowLeft, MessageCircle } from 'lucide-react';
import { signUp, suggestSignupCode, signupCodeFree } from '../lib/store';
import { setMadrasahCode } from '../lib/madrasahCode';
import { APP_NAME, APP_NAME_ARABIC, WHATSAPP_NUMBER } from '../lib/branding';
import { LegalModal } from '../components/Legal';
import { countVisit } from '../lib/analytics';
import { referralCode } from '../lib/referral';

// "Start free" (/?start, from the front page): a madrasah signs itself up — its name, the
// head's name, email (their login), phone and a password — and is straight in as its head,
// free for 6 months (server/routes/signup.js). First it says what kind it is — a maktab (evening and weekend
// classes), a Darul Uloom / Aalimiyyah course (full-time or part-time; /?start=darul-uloom picks it) or a school's Islamic
// Studies department (/?start=school — primary, secondary or all-through, and its forms of entry: 1–3 sign up here, 4 or more
// message us; the first term free, then yearly by invoice, and the data processing agreement agreed with the terms), each
// with its own price. The sign-in code is made from the name and can be changed here.
const KINDS = [
  ['maktab', 'Maktab', 'Evening & weekend classes', 'Free for 6 months, then £20 a month or £200 a year (up to 200 children). No card needed.'],
  ['darul_uloom', 'Darul Uloom / Aalimiyyah', 'Full-time, or an Aalimiyyah course', 'Free for 6 months, then £50 a month or £500 a year (up to 500 students). No card needed.'],
  ['school', 'School', 'Islamic Studies department', 'The first term free, then yearly by invoice: £500 for one form of entry, £800 for two, £1,000 for three. No card needed.'],
];
const PHASES = [['primary', 'Primary'], ['secondary', 'Secondary'], ['all-through', 'All-through']];
const FORMS = [[1, '1 form', '£500 a year'], [2, '2 forms', '£800 a year'], [3, '3 forms', '£1,000 a year'], [4, '4 or more', 'Message us']];
const START = { 'darul-uloom': 'darul_uloom', school: 'school' };
const WHATSAPP_SCHOOL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("Salaam, I'd like to use Suhuf for our school's Islamic Studies department — we have four or more forms of entry.")}`;
export default function Signup({ onDone }) {
  const [f, setF] = useState({ madrasahName: '', headName: '', email: '', phone: '', password: '', website: '' });
  const [kind, setKind] = useState(() => START[new URLSearchParams(window.location.search).get('start')] || 'maktab');
  const school = kind === 'school';
  const [phase, setPhase] = useState('');
  const [forms, setForms] = useState(0);
  const word = school ? 'school' : 'madrasah';
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
  // Recommended by another madrasah (its ?ref= link): say who — they get a month free when this one signs up.
  const [ref] = useState(referralCode);
  const [refName, setRefName] = useState('');
  useEffect(() => {
    if (!ref) return;
    fetch(`/api/settings?m=${encodeURIComponent(ref)}`).then(r => (r.ok ? r.json() : {})).then(s => setRefName(s.schoolName || '')).catch(() => {});
  }, [ref]);
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

  const ready = f.madrasahName.trim() && f.headName.trim() && f.email.trim() && f.password.length >= 8 && agree && code && codeFree
    && (!school || (phase && forms >= 1 && forms <= 3));

  async function submit(e) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true); setError('');
    try {
      const r = await signUp({ ...f, code, kind, agree: true, ref, ...(school ? { phase, forms } : {}) });
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
          {refName && <div style={{ fontSize: 13, color: 'var(--green-text)', marginTop: 4 }}>Recommended by {refName}</div>}
        </div>
        <div className="signup-kinds" role="radiogroup" aria-label="What kind of madrasah?">
          {KINDS.map(([k, label, sub]) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
              <b>{label}</b><span>{sub}</span>
            </button>
          ))}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '-4px 0 14px', textAlign: 'center' }}>{KINDS.find(x => x[0] === kind)[3]}</div>
        {field(school ? "Your school's name" : "Your madrasah's name", 'madrasahName', { placeholder: school ? 'e.g. Huda Academy' : 'e.g. Madrasatul Huda', autoFocus: true, maxLength: 80 })}
        {school && <>
          <div className="form-group" style={{ textAlign: 'left', marginBottom: 12 }}>
            <label>Your school is</label>
            <div className="signup-small-boxes">
              {PHASES.map(([k, l]) => <button key={k} type="button" className={phase === k ? 'on' : ''} aria-pressed={phase === k} onClick={() => { setPhase(k); setError(''); }}>{l}</button>)}
            </div>
          </div>
          <div className="form-group" style={{ textAlign: 'left', marginBottom: 12 }}>
            <label>Forms of entry (classes in each year)</label>
            <div className="signup-small-boxes four">
              {FORMS.map(([n, l, p]) => <button key={n} type="button" className={forms === n ? 'on' : ''} aria-pressed={forms === n} onClick={() => { setForms(n); setError(''); }}>{l}<small>{p}</small></button>)}
            </div>
          </div>
        </>}
        {school && forms === 4 ? (
          <div className="signup-message-us">
            <div>With four forms of entry or more, we'll agree a price with you and set your department up ourselves — with the first term free, as for every school.</div>
            <a className="btn btn-primary" href={WHATSAPP_SCHOOL} target="_blank" rel="noopener noreferrer" style={{ width: '100%', justifyContent: 'center' }}><MessageCircle size={14} />Message us on WhatsApp</a>
            <a href="mailto:hello@suhuf.uk" style={{ fontSize: 12.5 }}>or email hello@suhuf.uk</a>
          </div>
        ) : <>
        {field('Your name', 'headName', { placeholder: school ? 'Usually the Head of Islamic Studies' : 'The head or person in charge', autoComplete: 'name', maxLength: 80 })}
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
                <label>{school ? 'School code' : 'Madrasah code'}</label>
                <input value={code} onChange={e => { setCode(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); setCodeEdited(true); setError(''); }}
                  autoCapitalize="none" spellCheck={false} maxLength={30} />
                <span style={{ fontSize: 11.5, marginTop: 4, color: codeFree ? 'var(--text-soft)' : 'var(--red)' }}>
                  {codeFree ? `Your teachers${school ? ', pupils' : ''} and parents type this once to sign in.` : `Another ${word} already uses that — try another.`}
                </span>
              </div>
            ) : (
              <>Your {word} code: <strong>{code}</strong> <button type="button" style={linkBtn} onClick={() => setEditingCode(true)}>change</button></>
            )}
          </div>
        )}

        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, textAlign: 'left', marginBottom: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} style={{ marginTop: 2 }} />
          {school
            ? <span>I'm allowed to agree for my school, and I agree to the <button type="button" style={linkBtn} onClick={() => setLegal('terms')}>terms of use</button>, <button type="button" style={linkBtn} onClick={() => setLegal('privacy')}>privacy policy</button> and <button type="button" style={linkBtn} onClick={() => setLegal('dpa')}>data processing agreement</button> for it.</span>
            : <span>I agree to the <button type="button" style={linkBtn} onClick={() => setLegal('terms')}>terms of use</button> and <button type="button" style={linkBtn} onClick={() => setLegal('privacy')}>privacy policy</button> for my madrasah.</span>}
        </label>
        {error && <div style={{ fontSize: 12.5, color: 'var(--red)', marginBottom: 12, textAlign: 'left' }}>{error}</div>}
        <button type="submit" className="btn btn-primary" disabled={!ready || busy} style={{ width: '100%', justifyContent: 'center' }}>
          {busy ? 'Setting up…' : <><Rocket size={14} />Start free</>}
        </button>
        <div style={{ display: 'grid', gap: 6, marginTop: 14, fontSize: 12, color: 'var(--text-muted)', textAlign: 'left' }}>
          {(school ? ['Every feature included — trackers, reports, homework and quizzes', 'Bring in your pupils and tracker sheets from spreadsheets', 'No contract — leave any time']
            : ['Every feature included — AI reports too', 'Add your classes and students in minutes', 'No contract — leave any time']).map(t => (
            <div key={t} style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Check size={13} color="var(--green-text)" />{t}</div>
          ))}
        </div>
        </>}
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
