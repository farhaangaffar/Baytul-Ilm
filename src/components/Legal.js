import React, { useState } from 'react';
import { X, ShieldCheck, Check } from 'lucide-react';
import { PRIVACY, TERMS, LEGAL_UPDATED } from '../lib/legal';
import { acceptTerms } from '../lib/store';

// The privacy policy and terms: a page of their own (/privacy, /terms — anyone can open
// them), small links that open them in a pop-up, and the one-time "agree" screen a head
// sees on first sign-in (and again whenever TERMS_VERSION changes).
const DOCS = { privacy: ['Privacy policy', PRIVACY], terms: ['Terms of use', TERMS] };

function Sections({ sections }) {
  return sections.map(([heading, paras]) => (
    <div key={heading} style={{ marginBottom: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{heading}</div>
      {paras.map((p, i) => <p key={i} style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--text)', margin: '0 0 8px' }}>{p}</p>)}
    </div>
  ));
}

export function LegalPage({ kind }) {
  const [title, sections] = DOCS[kind];
  return (
    <div style={{ minHeight: '100vh', background: 'var(--page)', padding: '24px 16px' }}>
      <div className="card" style={{ maxWidth: 680, margin: '0 auto' }}>
        <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 2 }}>{title}</div>
        <div className="text-muted text-sm" style={{ marginBottom: 20 }}>Last updated {LEGAL_UPDATED}</div>
        <Sections sections={sections} />
        <div style={{ display: 'flex', gap: 14, fontSize: 13, marginTop: 8 }}>
          <a href="/">Back to the app</a>
          <a href={kind === 'privacy' ? '/terms' : '/privacy'}>{kind === 'privacy' ? 'Terms of use' : 'Privacy policy'}</a>
        </div>
      </div>
    </div>
  );
}

export function LegalModal({ kind, onClose }) {
  const [title, sections] = DOCS[kind];
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()} style={{ zIndex: 1200 }}>
      <div className="modal" style={{ maxWidth: 620 }}>
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button className="btn btn-icon" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="modal-body" style={{ textAlign: 'left' }}>
          <div className="text-muted text-sm" style={{ marginBottom: 14 }}>Last updated {LEGAL_UPDATED}</div>
          <Sections sections={sections} />
        </div>
      </div>
    </div>
  );
}

// "Privacy policy · Terms of use", opening each in a pop-up.
export function LegalLinks({ style }) {
  const [open, setOpen] = useState(null);
  const link = { background: 'none', border: 'none', padding: 0, color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font)', textDecoration: 'underline' };
  return (
    <div style={{ display: 'flex', gap: 14, justifyContent: 'center', ...style }}>
      <button type="button" style={link} onClick={() => setOpen('privacy')}>Privacy policy</button>
      <button type="button" style={link} onClick={() => setOpen('terms')}>Terms of use</button>
      {open && <LegalModal kind={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

// A head's first sign-in: agree to the terms for their madrasah before going on.
export function AcceptTerms({ madrasahName, onAccepted, onSignOut }) {
  const [ticked, setTicked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function agree() {
    setBusy(true); setError('');
    try { await acceptTerms(); await onAccepted(); }
    catch (err) { setError(err.message || 'Could not save — please try again'); setBusy(false); }
  }
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--page)', padding: 16 }}>
      <div className="card" style={{ width: '100%', maxWidth: 440 }}>
        <div style={{ textAlign: 'center', marginBottom: 14 }}>
          <ShieldCheck size={30} style={{ color: 'var(--green)' }} />
          <div style={{ fontWeight: 700, fontSize: 17, marginTop: 6 }}>Before you start</div>
          <div className="text-muted" style={{ fontSize: 13, marginTop: 4 }}>
            {madrasahName ? <>{madrasahName} will keep children's and parents' details in this app.</> : <>Your madrasah will keep children's and parents' details in this app.</>}
            {' '}Please read how they're looked after.
          </div>
        </div>
        <LegalLinks style={{ marginBottom: 16 }} />
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, cursor: 'pointer', background: '#f3f4f6', borderRadius: 'var(--r-md)', padding: '10px 12px' }}>
          <input type="checkbox" checked={ticked} onChange={e => setTicked(e.target.checked)} style={{ marginTop: 2, width: 16, height: 16, flexShrink: 0 }} />
          <span>I agree to the terms of use for {madrasahName || 'my madrasah'}, and I'll let parents know their children's records are kept here.</span>
        </label>
        {error && <div style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 10 }}>{error}</div>}
        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 14 }} disabled={!ticked || busy} onClick={agree}>
          <Check size={14} />{busy ? 'Saving…' : 'Agree and continue'}
        </button>
        <button type="button" onClick={onSignOut} style={{ display: 'block', margin: '12px auto 0', background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12.5, cursor: 'pointer', fontFamily: 'var(--font)' }}>Not now — sign out</button>
      </div>
    </div>
  );
}
