import React, { useState, useEffect, useCallback } from 'react';
import { X, UserPlus, Repeat, Trash2 } from 'lucide-react';
import { getHeads, addHead, handOverHead, removeHead } from '../lib/store';

// Settings → Heads (a head only; in a demo it shows, and the pop-ups open, but nothing saves — the server refuses): the madrasah's or school's head logins — up to two, the main head and an
// optional second head (a deputy) with the same access. "Add a second head", "Hand over to a new head" (your own login goes to
// someone new — you're signed out) and Remove on the other head. The platform owner can also change a head from the
// Madaaris page. Server: routes/heads.js.
export default function HeadsCard({ word = 'madrasah', platformAdmin, demo }) {
  const [list, setList] = useState(null);
  const [open, setOpen] = useState(null); // the other head's id, opened to Remove
  const [modal, setModal] = useState(null); // 'add' | 'handover'
  const [error, setError] = useState('');
  const load = useCallback(() => getHeads().then(setList).catch(err => setError(err.message || 'Could not load')), []);
  useEffect(() => { load(); }, [load]);
  if (!list) return null;

  async function remove(h) {
    if (!window.confirm(`Remove ${h.name || h.login} as a head? They won't be able to sign in any more.`)) return;
    try { await removeHead(h.id); setOpen(null); await load(); } catch (err) { setError(err.message || 'Could not remove'); }
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-title" style={{ marginBottom: 4 }}>Heads</div>
      <div className="card-sub" style={{ marginBottom: 12 }}>Who signs in as the head of your {word} — up to two, with the same access.</div>
      {demo && <div style={{ fontSize: 12, color: 'var(--amber-text)', marginBottom: 10 }}>In the demo you can look, but heads can't be changed.</div>}
      <div style={{ display: 'grid', gap: 8 }}>
        {list.map(h => (
          <div key={h.id}>
            <button type="button" className={`line-row ${open === h.id ? 'on' : ''}`} onClick={() => !h.you && setOpen(open === h.id ? null : h.id)} style={h.you ? { cursor: 'default' } : undefined}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 600 }}>{h.name || h.login}{h.you ? ' (you)' : ''}</span>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.name ? `${h.login} · ` : ''}{h.main ? 'Main head' : 'Second head'}</span>
              </span>
            </button>
            {open === h.id && (
              <div style={{ padding: '8px 2px 2px' }}>
                <button type="button" className="btn btn-sm" style={{ color: 'var(--red)' }} onClick={() => remove(h)}><Trash2 size={13} /> Remove as head</button>
              </div>
            )}
          </div>
        ))}
        {list.length < 2 && (
          <button type="button" className="line-row" onClick={() => { setModal('add'); setError(''); }}><UserPlus size={15} /><span style={{ flex: 1 }}>Add a second head</span></button>
        )}
        {!platformAdmin && (
          <button type="button" className="line-row" onClick={() => { setModal('handover'); setError(''); }}><Repeat size={15} /><span style={{ flex: 1 }}>Hand over to a new head</span></button>
        )}
      </div>
      {error && <div style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 10 }}>{error}</div>}
      {modal && <HeadModal kind={modal} word={word} onClose={() => setModal(null)} onDone={async () => { setModal(null); await load(); }} />}
    </div>
  );
}

function HeadModal({ kind, word, onClose, onDone }) {
  const handover = kind === 'handover';
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const set = k => e => { setF({ ...f, [k]: e.target.value }); setError(''); };
  const ok = f.name.trim() && f.email.trim() && f.password.length >= 8;
  async function save() {
    setBusy(true); setError('');
    try {
      if (handover) { await handOverHead(f); setDone(true); } else { await addHead(f); await onDone(); }
    } catch (err) { setError(err.message || 'Could not save'); setBusy(false); }
  }
  const field = (label, k, props = {}, hint) => (
    <div className="form-group" style={{ marginBottom: 12 }}>
      <label>{label}</label>
      <input value={f[k]} onChange={set(k)} {...props} />
      {hint && <span style={{ fontSize: 11.5, color: 'var(--text-soft)', marginTop: 4 }}>{hint}</span>}
    </div>
  );
  // Handed over: this person is now signed out — say so, then go to the sign-in page.
  if (done) {
    return (
      <div className="modal-overlay">
        <div className="modal" style={{ maxWidth: 440 }}>
          <div className="modal-header"><div className="modal-title">Handed over</div></div>
          <div className="modal-body" style={{ fontSize: 13.5, lineHeight: 1.6 }}>
            <p style={{ margin: '0 0 10px' }}><strong>{f.name}</strong> is now the head. They sign in with <strong>{f.email.trim().toLowerCase()}</strong> and the password you chose, and can change it in Change password.</p>
            <p style={{ margin: 0 }}>You've been signed out of this login. JazakAllahu khayran for everything.</p>
          </div>
          <div className="modal-footer"><button className="btn btn-primary" onClick={() => window.location.assign('/?signin')}>OK</button></div>
        </div>
      </div>
    );
  }
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-header">
          <div className="modal-title">{handover ? 'Hand over to a new head' : 'Add a second head'}</div>
          <button className="btn btn-icon" onClick={onClose} disabled={busy} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="modal-body">
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
            {handover
              ? `Your head login goes to the new head: their email becomes the login and you're signed out everywhere. Everything at the ${word} stays as it is.`
              : `They get the same access as you. Give them the email and password below.`}
          </div>
          {field("Their name", 'name', { autoFocus: true, maxLength: 80, autoComplete: 'off' })}
          {field('Their email', 'email', { type: 'email', autoCapitalize: 'none', spellCheck: false, autoComplete: 'off' }, 'This is how they sign in.')}
          {handover && field('Their phone (optional)', 'phone', { type: 'tel', autoComplete: 'off' })}
          {field('A starting password', 'password', { type: 'text', autoComplete: 'new-password', autoCapitalize: 'none', spellCheck: false }, 'At least 8 characters — they can change it once signed in.')}
          {error && <div style={{ fontSize: 12.5, color: 'var(--red)' }}>{error}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className={`btn ${handover ? 'btn-danger' : 'btn-primary'}`} disabled={!ok || busy} onClick={save}>{busy ? 'Saving…' : handover ? 'Hand over' : 'Add head'}</button>
        </div>
      </div>
    </div>
  );
}
