import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import { LoadingState, ErrorState } from '../components/DataState';
import { getMadaaris, createMadrasah, updateMadrasah, formatDateGB } from '../lib/store';
import { Plus, X, Save, Pencil, KeyRound, Power } from 'lucide-react';

// The platform owner's page: every madrasah using the app, with counts only (never
// another madrasah's students, fees or reports). Add a madrasah with its head's first
// login, rename it or change its sign-in code, reset the head's password, or switch
// it off (its logins stop working; its data is kept) and back on.

function suggestCode(name) {
  return String(name || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
}

export default function Madaaris() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [list, setList] = useState([]);
  const [modal, setModal] = useState(null); // { kind: 'add' } | { kind: 'edit'|'password'|'power', m }
  const [created, setCreated] = useState(null); // details to hand over after adding one
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try { setList(await getMadaaris()); } catch (err) { setError(err); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 2500); }

  if (loading) return <Layout title="Madaaris"><LoadingState /></Layout>;
  if (error) return <Layout title="Madaaris"><ErrorState error={error} onRetry={load} /></Layout>;

  const totals = list.reduce((t, m) => ({ students: t.students + m.students, ai: t.ai + m.aiThisMonth }), { students: 0, ai: 0 });
  const signInLink = code => `${window.location.origin}/?m=${encodeURIComponent(code)}`;

  return (
    <Layout title="Madaaris" subtitle="Every madrasah using the app">
      <div className="stat-grid-v2">
        <div className="stat-card-v2"><div className="n">{list.length}</div><div className="l">Madaaris</div></div>
        <div className="stat-card-v2"><div className="n">{list.filter(m => m.active).length}</div><div className="l">Switched on</div></div>
        <div className="stat-card-v2"><div className="n">{totals.students}</div><div className="l">Active students, all madaaris</div></div>
        <div className="stat-card-v2"><div className="n">{totals.ai}</div><div className="l">AI requests this month</div></div>
      </div>

      <div className="flex items-center justify-between mb-5" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div className="text-muted text-sm">You only see counts here — each madrasah's students, fees and reports stay private to them.</div>
        <button className="btn btn-primary" onClick={() => setModal({ kind: 'add' })}><Plus size={14} /> Add madrasah</button>
      </div>

      {list.map(m => (
        <div key={m.id} className="card" style={{ marginBottom: 12, opacity: m.active ? 1 : 0.7 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{m.name}</span>
                {m.isYours && <span className="badge badge-teal">Yours</span>}
                <span className={`badge ${m.active ? 'badge-green' : 'badge-gray'}`}>{m.active ? 'On' : 'Switched off'}</span>
              </div>
              <div className="text-muted text-sm" style={{ marginTop: 4 }}>
                Code <strong style={{ color: 'var(--ink)' }}>{m.code}</strong>
                {m.headLogin && <> · Head login <strong style={{ color: 'var(--ink)' }}>{m.headLogin}</strong></>}
                {' '}· Added {formatDateGB(String(m.createdAt).slice(0, 10))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button className="btn btn-sm" onClick={() => setModal({ kind: 'edit', m })}><Pencil size={12} /> Edit</button>
              {!m.isYours && <button className="btn btn-sm" onClick={() => setModal({ kind: 'password', m })}><KeyRound size={12} /> Reset head's password</button>}
              {!m.isYours && (
                <button className="btn btn-sm" style={m.active ? { color: 'var(--red)' } : undefined} onClick={() => setModal({ kind: 'power', m })}>
                  <Power size={12} /> {m.active ? 'Switch off' : 'Switch on'}
                </button>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            {[['Students', m.students], ['Teachers', m.teachers], ['Classes', m.classes], ['AI this month', m.aiThisMonth], ['AI all time', m.aiTotal]].map(([l, v]) => (
              <div key={l} style={{ flex: '1 1 90px', background: '#f3f4f6', borderRadius: 'var(--r-md)', padding: '8px 10px', textAlign: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--ink)' }}>{v}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {modal?.kind === 'add' && (
        <AddModal onClose={() => setModal(null)} onCreated={async details => { setModal(null); setCreated(details); await load(); }} />
      )}
      {modal?.kind === 'edit' && (
        <EditModal m={modal.m} onClose={() => setModal(null)} onSaved={async () => { setModal(null); showToast('Saved'); await load(); }} />
      )}
      {modal?.kind === 'password' && (
        <PasswordModal m={modal.m} onClose={() => setModal(null)} onSaved={async () => { setModal(null); showToast("Head's password reset"); await load(); }} />
      )}
      {modal?.kind === 'power' && (
        <ConfirmModal
          title={`${modal.m.active ? 'Switch off' : 'Switch on'} ${modal.m.name}?`}
          text={modal.m.active
            ? "Everyone at this madrasah is signed out and can't sign in until you switch it back on. Nothing is deleted."
            : 'Their logins will work again, with all their data as they left it.'}
          confirm={modal.m.active ? 'Switch off' : 'Switch on'}
          danger={modal.m.active}
          onClose={() => setModal(null)}
          onConfirm={async () => { await updateMadrasah(modal.m.id, { active: !modal.m.active }); setModal(null); await load(); }}
        />
      )}

      {created && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setCreated(null)}>
          <div className="modal" style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <div className="modal-title">{created.name} is ready</div>
              <button className="btn btn-icon" onClick={() => setCreated(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div style={{ fontSize: 13, marginBottom: 12 }}>Pass these on to the head. They can change the password once signed in.</div>
              <div style={{ background: '#f3f4f6', borderRadius: 'var(--r-md)', padding: '12px 14px', fontSize: 13, lineHeight: 1.8 }}>
                <div>Link: <strong style={{ wordBreak: 'break-all' }}>{signInLink(created.code)}</strong></div>
                <div>Madrasah code: <strong>{created.code}</strong></div>
                <div>Username: <strong>{created.headLogin}</strong></div>
                <div>Password: <strong>{created.headPassword}</strong></div>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-soft)', marginTop: 10 }}>Opening the link fills in the madrasah code for them.</div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setCreated(null)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">✓ {toast}</div>}
    </Layout>
  );
}

function ModalShell({ title, onClose, busy, children, footer }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal" style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button className="btn btn-icon" onClick={onClose} disabled={busy}><X size={16} /></button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-footer">{footer}</div>
      </div>
    </div>
  );
}

// Shared busy/error handling for the modals below.
function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(fn) {
    setBusy(true); setError('');
    try { await fn(); } catch (err) { setError(err.message || 'Something went wrong'); setBusy(false); }
  }
  return { busy, error, setError, submit };
}

const noAuto = { autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false, autoComplete: 'off' };

function AddModal({ onClose, onCreated }) {
  const [f, setF] = useState({ name: '', code: '', headLogin: '', headPassword: '' });
  const [codeTouched, setCodeTouched] = useState(false);
  const { busy, error, setError, submit } = useSubmit();
  const set = (k, v) => { setError(''); setF(prev => ({ ...prev, [k]: v, ...(k === 'name' && !codeTouched ? { code: suggestCode(v) } : {}) })); };
  const ok = f.name.trim() && f.code.trim() && f.headLogin.trim() && f.headPassword.length >= 8;
  return (
    <ModalShell title="Add a madrasah" onClose={onClose} busy={busy} footer={<>
      <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
      <button className="btn btn-primary" disabled={busy || !ok}
        onClick={() => submit(async () => { await createMadrasah(f); await onCreated({ ...f, code: f.code.trim().toLowerCase(), headLogin: f.headLogin.trim().toLowerCase() }); })}>
        <Save size={13} />{busy ? 'Adding…' : 'Add madrasah'}
      </button>
    </>}>
      <div className="form-group" style={{ marginBottom: 12 }}>
        <label>Madrasah name</label>
        <input value={f.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Al-Noor Academy" autoFocus />
      </div>
      <div className="form-group" style={{ marginBottom: 12 }}>
        <label>Sign-in code</label>
        <input value={f.code} onChange={e => { setCodeTouched(true); set('code', e.target.value); }} placeholder="e.g. al-noor" {...noAuto} />
        <span style={{ fontSize: 11.5, color: 'var(--text-soft)', marginTop: 4 }}>Short and memorable — lowercase letters, numbers and dashes. Everyone at the madrasah types it once per device.</span>
      </div>
      <div className="form-group" style={{ marginBottom: 12 }}>
        <label>Head's username or email</label>
        <input value={f.headLogin} onChange={e => set('headLogin', e.target.value)} placeholder="e.g. head or ahmed@gmail.com" {...noAuto} />
      </div>
      <div className="form-group" style={{ marginBottom: 6 }}>
        <label>Starting password (8+ characters)</label>
        <input type="text" value={f.headPassword} onChange={e => set('headPassword', e.target.value)} {...noAuto} />
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-soft)' }}>The head can change this once signed in. Their madrasah starts empty, with this academic year added.</div>
      {error && <div style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 10 }}>{error}</div>}
    </ModalShell>
  );
}

function EditModal({ m, onClose, onSaved }) {
  const [name, setName] = useState(m.name);
  const [code, setCode] = useState(m.code);
  const { busy, error, setError, submit } = useSubmit();
  const changes = {};
  if (name.trim() !== m.name) changes.name = name;
  if (code.trim().toLowerCase() !== m.code) changes.code = code;
  return (
    <ModalShell title={`Edit ${m.name}`} onClose={onClose} busy={busy} footer={<>
      <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
      <button className="btn btn-primary" disabled={busy || !Object.keys(changes).length}
        onClick={() => submit(async () => { await updateMadrasah(m.id, changes); await onSaved(); })}>
        <Save size={13} />{busy ? 'Saving…' : 'Save'}
      </button>
    </>}>
      <div className="form-group" style={{ marginBottom: 12 }}>
        <label>Madrasah name</label>
        <input value={name} onChange={e => { setName(e.target.value); setError(''); }} />
      </div>
      <div className="form-group" style={{ marginBottom: 6 }}>
        <label>Sign-in code</label>
        <input value={code} onChange={e => { setCode(e.target.value); setError(''); }} {...noAuto} />
      </div>
      {changes.code && <div style={{ fontSize: 11.5, color: 'var(--amber-text)' }}>Devices that remember the old code will need the new one typed in once.</div>}
      {error && <div style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 10 }}>{error}</div>}
    </ModalShell>
  );
}

function PasswordModal({ m, onClose, onSaved }) {
  const [password, setPassword] = useState('');
  const { busy, error, setError, submit } = useSubmit();
  return (
    <ModalShell title={`Reset ${m.name}'s head password`} onClose={onClose} busy={busy} footer={<>
      <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
      <button className="btn btn-primary" disabled={busy || password.length < 8}
        onClick={() => submit(async () => { await updateMadrasah(m.id, { headPassword: password }); await onSaved(); })}>
        <KeyRound size={13} />{busy ? 'Saving…' : 'Reset password'}
      </button>
    </>}>
      <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 12 }}>
        For <strong>{m.headLogin}</strong>. They're signed out everywhere and can change it again once signed in.
      </div>
      <div className="form-group">
        <label>New password (8+ characters)</label>
        <input type="text" value={password} onChange={e => { setPassword(e.target.value); setError(''); }} {...noAuto} autoFocus />
      </div>
      {error && <div style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 10 }}>{error}</div>}
    </ModalShell>
  );
}

function ConfirmModal({ title, text, confirm, danger, onClose, onConfirm }) {
  const { busy, error, submit } = useSubmit();
  return (
    <ModalShell title={title} onClose={onClose} busy={busy} footer={<>
      <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
      <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} disabled={busy} onClick={() => submit(onConfirm)}>
        <Power size={13} />{busy ? 'Saving…' : confirm}
      </button>
    </>}>
      <div style={{ fontSize: 13 }}>{text}</div>
      {error && <div style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 10 }}>{error}</div>}
    </ModalShell>
  );
}
