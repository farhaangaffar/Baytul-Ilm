import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import SignupNotifications from '../components/SignupNotifications';
import { LoadingState, ErrorState } from '../components/DataState';
import { getMadaaris, createMadrasah, updateMadrasah, deleteMadrasah, formatDateGB, getDbUsage, getIncome, getPayments, addPayment, deletePayment } from '../lib/store';
import { billing, billingStart, prices, monthBoxes, addMonths, dayBefore, monthName, money, todayLocal, DEFAULT_PRICE } from '../lib/billing';
import { APP_NAME, APP_URL } from '../lib/branding';
import { Plus, X, Save, Pencil, KeyRound, Power, Sparkles, ExternalLink, Copy, Share2, PlayCircle, Database, Trash2, PoundSterling, ChevronLeft, ChevronRight, MessageCircle, Phone, Mail } from 'lucide-react';

// The platform owner's page: every madrasah using the app, with counts only (never
// another madrasah's students, fees or reports). Add a madrasah with its head's first
// login, rename it or change its sign-in code, reset the head's password, or switch
// it off (its logins stop working; its data is kept) and back on.

// Where the AI credit is topped up (Anthropic's billing page — the balance is shown there;
// Anthropic offers no way for an app to read it).
const AI_BILLING_URL = 'https://console.anthropic.com/settings/billing';
// A rough guide only: one report summary is a few thousand words in and a paragraph out.
const PENCE_PER_AI_REQUEST = 1;
// The free database plan's space (Neon Free: 0.5 GB per project).
const DB_LIMIT_BYTES = 512 * 1024 * 1024;

// A UK number as WhatsApp wants it: 07700 900123 → 447700900123.
function whatsappNumber(phone) {
  const d = String(phone).replace(/[^0-9]/g, '');
  return d.startsWith('0') ? `44${d.slice(1)}` : d;
}

// Colours for where a madrasah is with paying: grey (free), green (paid), yellow (due within 2 weeks), red (overdue).
function tone(b) {
  if (b.state === 'overdue') return { text: 'var(--red-text)', bar: 'var(--red)' };
  if (b.warn) return { text: 'var(--amber-text)', bar: '#e0b416' };
  if (b.state === 'paid') return { text: 'var(--green-text)', bar: '#6fae3c' };
  if (b.state === 'free') return { text: 'var(--text-muted)', bar: '#94a3b8' };
  return { text: 'var(--text-soft)', bar: 'transparent' };
}

function suggestCode(name) {
  return String(name || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
}

export default function Madaaris() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [list, setList] = useState([]);
  const [modal, setModal] = useState(null); // { kind: 'add' } | { kind: 'detail'|'edit'|'password'|'power'|'delete', m, back }
  const [created, setCreated] = useState(null); // details to hand over after adding one
  const [toast, setToast] = useState('');
  const [dbBytes, setDbBytes] = useState(null);
  useEffect(() => { getDbUsage().then(u => setDbBytes(u.dbBytes)).catch(() => {}); }, []);
  const [income, setIncome] = useState(null);
  const loadIncome = useCallback(() => getIncome().then(setIncome).catch(() => {}), []);
  useEffect(() => { loadIncome(); }, [loadIncome]);

  const load = useCallback(async () => {
    setError(null);
    try { setList(await getMadaaris()); } catch (err) { setError(err); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 2500); }
  // Closing a pop-up opened from a madrasah's details goes back to its details.
  const back = () => setModal(cur => (cur?.back ? { kind: 'detail', m: cur.m } : null));

  if (loading) return <Layout title="Madaaris"><LoadingState /></Layout>;
  if (error) return <Layout title="Madaaris"><ErrorState error={error} onRetry={load} /></Layout>;

  const totals = list.reduce((t, m) => ({ students: t.students + m.students, ai: t.ai + m.aiThisMonth, aiAll: t.aiAll + m.aiTotal }), { students: 0, ai: 0, aiAll: 0 });
  const pounds = n => `£${((n * PENCE_PER_AI_REQUEST) / 100).toFixed(2)}`;
  const demoLink = `${APP_URL}/?demo`;
  async function copyDemo() {
    try { await navigator.clipboard.writeText(demoLink); showToast('Demo link copied'); }
    catch { window.prompt('Copy the demo link:', demoLink); }
  }
  async function shareDemo() {
    try { await navigator.share({ title: `${APP_NAME} demo`, text: `Have a look around ${APP_NAME}, the madrasah app:`, url: demoLink }); }
    catch { /* closed, or sharing not available */ }
  }
  const signInLink = code => `${APP_URL}/?m=${encodeURIComponent(code)}`;

  return (
    <Layout title="Madaaris" subtitle="Every madrasah using the app">
      <div className="stat-grid-v2">
        <div className="stat-card-v2"><div className="n">{list.length}</div><div className="l">Madaaris</div></div>
        <div className="stat-card-v2"><div className="n">{list.filter(m => m.active).length}</div><div className="l">Switched on</div></div>
        <div className="stat-card-v2"><div className="n">{totals.students}</div><div className="l">Active students, all madaaris</div></div>
        <div className="stat-card-v2"><div className="n">{totals.ai}</div><div className="l">AI requests this month</div></div>
      </div>

      <SignupNotifications />

      {/* Money from madaaris: received, expected each month, and who's behind. */}
      {(() => {
        const paying = list.map(m => ({ m, b: billing(m) })).filter(x => x.b.state === 'paid' || x.b.state === 'overdue');
        const expected = paying.reduce((t, { m }) => t + (m.billingPlan === 'yearly' ? prices(m).yearly / 12 : prices(m).monthly), 0);
        const overdue = paying.map(x => x.b).filter(b => b.owed > 0);
        return (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header" style={{ marginBottom: 10 }}>
              <div className="card-title"><PoundSterling size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />Payments from madaaris</div>
            </div>
            <div className="stat-grid-v2" style={{ marginBottom: 0 }}>
              <div className="stat-card-v2"><div className="n" style={{ color: 'var(--green-text)' }}>{income ? money(income.thisMonth) : '…'}</div><div className="l">Received this month</div></div>
              <div className="stat-card-v2"><div className="n">{income ? money(income.last12) : '…'}</div><div className="l">Last 12 months</div></div>
              <div className="stat-card-v2"><div className="n">{money(expected)}</div><div className="l">Expected each month</div></div>
              <div className="stat-card-v2"><div className="n" style={{ color: overdue.length ? 'var(--red-text)' : undefined }}>{overdue.length ? money(overdue.reduce((t, b) => t + b.owed, 0)) : '£0'}</div><div className="l">{overdue.length ? `Overdue from ${overdue.length} madrasah${overdue.length === 1 ? '' : 's'}` : 'Nothing overdue'}</div></div>
            </div>
          </div>
        );
      })()}

      <div className="flex items-center justify-between mb-5" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div className="text-muted text-sm">You only see counts here — each madrasah's students, fees and reports stay private to them.</div>
        <button className="btn btn-primary" onClick={() => setModal({ kind: 'add' })}><Plus size={14} /> Add madrasah</button>
      </div>

      {list.map(m => {
        const b = billing(m);
        const t = tone(b);
        const isNew = m.selfSignup && Date.now() - new Date(m.createdAt) < 14 * 864e5;
        return (
          <button key={m.id} type="button" className="card madrasah-card" onClick={() => setModal({ kind: 'detail', m })}
            style={{ opacity: m.active ? 1 : 0.65 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ minWidth: 0 }}>
                  <span className="madrasah-card-name">{m.name}</span>
                  {isNew && <span className="badge badge-amber" style={{ marginLeft: 8, verticalAlign: '2px' }}>New</span>}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: t.text, whiteSpace: 'nowrap' }}>{b.label}</span>
              </div>
              <div className="text-muted" style={{ fontSize: 13, marginTop: 4 }}>
                {m.students} {m.students === 1 ? 'child' : 'children'} · {m.classes} class{m.classes === 1 ? '' : 'es'}
                {' · '}<Sparkles size={12} style={{ verticalAlign: '-1px' }} /> {m.aiThisMonth} AI this month
              </div>
            </div>
            {(b.state === 'free' || b.state === 'paid' || b.state === 'overdue') && (
              <div className="madrasah-bar"><div style={{ width: `${Math.max(3, Math.round(b.fill * 100))}%`, background: t.bar }} /></div>
            )}
          </button>
        );
      })}
      <div className="text-muted" style={{ fontSize: 12, margin: '2px 2px 4px' }}>
        Bar: grey = free months · green = paid · yellow = due within 2 weeks · red = overdue. Tap a madrasah for its details and payments.
      </div>

      {/* Just for the platform owner: AI credit and the demo link to send out. */}
      <div className="card" style={{ marginTop: 16, marginBottom: 12 }}>
        <div className="card-title" style={{ marginBottom: 4 }}><Sparkles size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />AI credit</div>
        <div className="card-sub" style={{ marginBottom: 12 }}>Your balance is on Anthropic's billing page — top up there.</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginBottom: 12 }}>
          <div className="info-box"><strong>{totals.ai} · ≈ {pounds(totals.ai)}</strong><span className="info-box-label">AI requests this month</span></div>
          <div className="info-box"><strong>{totals.aiAll} · ≈ {pounds(totals.aiAll)}</strong><span className="info-box-label">All time</span></div>
        </div>
        <a className="btn btn-primary" href={AI_BILLING_URL} target="_blank" rel="noopener noreferrer" style={{ width: '100%', justifyContent: 'center', textDecoration: 'none' }}>
          <ExternalLink size={14} /> Check balance & top up
        </a>
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 8 }}>Costs are a rough guide (about {PENCE_PER_AI_REQUEST}p per summary).</div>
      </div>

      {dbBytes != null && (() => {
        const pct = Math.min(100, Math.round((dbBytes / DB_LIMIT_BYTES) * 100));
        const tone = pct >= 80 ? 'var(--red)' : pct >= 60 ? 'var(--amber)' : 'var(--green)';
        return (
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="card-title" style={{ marginBottom: 4 }}><Database size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />Database space</div>
            <div className="card-sub" style={{ marginBottom: 10 }}>{Math.round(dbBytes / 1048576)} MB of 512 MB on the free plan ({pct}%).{pct >= 80 ? ' Time to move to a paid plan.' : ''}</div>
            <div style={{ height: 8, borderRadius: 99, background: '#eef0f3', overflow: 'hidden' }}>
              <div style={{ width: `${Math.max(pct, 2)}%`, height: '100%', background: tone }} />
            </div>
          </div>
        );
      })()}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title" style={{ marginBottom: 4 }}><PlayCircle size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />Demo link</div>
        <div className="card-sub" style={{ marginBottom: 10 }}>Send this to anyone who wants to try the app — they get their own made-up madrasah.</div>
        <div style={{ background: '#f3f4f6', borderRadius: 'var(--r-md)', padding: '9px 12px', fontSize: 13, wordBreak: 'break-all', marginBottom: 10 }}>{demoLink}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={copyDemo}><Copy size={14} /> Copy</button>
          {typeof navigator !== 'undefined' && navigator.share && <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={shareDemo}><Share2 size={14} /> Share</button>}
        </div>
      </div>


      {modal?.kind === 'add' && (
        <AddModal onClose={() => setModal(null)} onCreated={async details => { setModal(null); setCreated(details); await load(); }} />
      )}
      {modal?.kind === 'edit' && (
        <EditModal m={modal.m} onClose={back} onSaved={async () => { back(); showToast('Saved'); await load(); }} />
      )}
      {modal?.kind === 'password' && (
        <PasswordModal m={modal.m} onClose={back} onSaved={async () => { back(); showToast("Head's password reset"); await load(); }} />
      )}
      {modal?.kind === 'detail' && (
        <DetailModal m={list.find(x => x.id === modal.m.id) || modal.m} onClose={() => setModal(null)} open={(kind, m) => setModal({ kind, m, back: true })}
          onChanged={async () => { await load(); await loadIncome(); }} />
      )}
      {modal?.kind === 'delete' && (
        <DeleteModal m={modal.m} onClose={back} onDeleted={async () => { setModal(null); showToast(`${modal.m.name} deleted`); await load(); }} />
      )}
      {modal?.kind === 'power' && (
        <ConfirmModal
          title={`${modal.m.active ? 'Switch off' : 'Switch on'} ${modal.m.name}?`}
          text={modal.m.active
            ? "Everyone at this madrasah is signed out and can't sign in until you switch it back on. Nothing is deleted."
            : 'Their logins will work again, with all their data as they left it.'}
          confirm={modal.m.active ? 'Switch off' : 'Switch on'}
          danger={modal.m.active}
          onClose={back}
          onConfirm={async () => { await updateMadrasah(modal.m.id, { active: !modal.m.active }); back(); await load(); }}
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

function ModalShell({ title, sub, onClose, busy, children, footer, width = 420 }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal" style={{ maxWidth: width }}>
        <div className="modal-header">
          <div style={{ minWidth: 0 }}>
            <div className="modal-title">{title}</div>
            {sub && <div className="text-muted" style={{ fontSize: 12.5, marginTop: 3 }}>{sub}</div>}
          </div>
          <button className="btn btn-icon" onClick={onClose} disabled={busy}><X size={16} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
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
      <div style={{ fontSize: 11.5, color: 'var(--text-soft)' }}>The head can change this once signed in. Their madrasah starts empty, with this academic year added, and is free for 6 months.</div>
      {error && <div style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 10 }}>{error}</div>}
    </ModalShell>
  );
}

function EditModal({ m, onClose, onSaved }) {
  const [name, setName] = useState(m.name);
  const [code, setCode] = useState(m.code);
  const [freeUntil, setFreeUntil] = useState(m.freeUntil || '');
  const { busy, error, setError, submit } = useSubmit();
  const changes = {};
  if (name.trim() !== m.name) changes.name = name;
  if (code.trim().toLowerCase() !== m.code) changes.code = code;
  if (freeUntil && freeUntil !== m.freeUntil) changes.freeUntil = freeUntil;
  return (
    <ModalShell title={`Edit details — ${m.name}`} onClose={onClose} busy={busy} footer={<>
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
      {!m.isYours && (
        <div className="form-group" style={{ marginTop: 12 }}>
          <label>Free until</label>
          <input type="date" value={freeUntil} onChange={e => { setFreeUntil(e.target.value); setError(''); }} />
          <span style={{ fontSize: 11.5, color: 'var(--text-soft)', marginTop: 4 }}>6 months from joining (free to the end of that month) — change it to give them longer.</span>
        </div>
      )}
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

// Everything about one madrasah: where it is with paying (one-tap payments, month boxes,
// plan and price, payments received), who to contact, its size, and the manage buttons.
function DetailModal({ m, onClose, open, onChanged }) {
  const b = billing(m);
  const p = prices(m);
  const today = todayLocal();
  const nextDue = addMonths(billingStart(m.freeUntil), m.monthsPaid || 0);
  const [payments, setPayments] = useState(null);
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [sel, setSel] = useState(null); // a month box tapped: pay up to it
  const [other, setOther] = useState(false);
  const [f, setF] = useState({ paidOn: today, amount: String(p.monthly), months: '1', note: '' });
  const [price, setPrice] = useState(String(m.billingPlan === 'yearly' ? p.yearly : p.monthly));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const reload = useCallback(() => getPayments(m.id).then(setPayments).catch(err => setError(err.message)), [m.id]);
  useEffect(() => { if (!m.isYours) reload(); }, [reload, m.isYours]);
  useEffect(() => { setPrice(String(m.billingPlan === 'yearly' ? p.yearly : p.monthly)); }, [m.billingPlan, p.monthly, p.yearly]);

  const run = async (fn, msg) => {
    setBusy(true); setError(''); setDone('');
    try { await fn(); await reload(); await onChanged(); if (msg) setDone(msg); } catch (err) { setError(err.message || 'Something went wrong'); }
    setBusy(false);
  };
  const pay = (months, amount, extra = {}) => run(
    () => addPayment(m.id, { paidOn: today, amount, months, note: '', ...extra }),
    `Recorded ${money(amount)} — ${months === 1 ? monthName(nextDue) : `${monthName(nextDue)} to ${monthName(addMonths(nextDue, months - 1))}`}`);
  const savePlan = (plan, amount) => run(() => updateMadrasah(m.id, { billingPlan: plan, billingAmount: amount }));

  const boxes = monthBoxes(m, year, today);
  const selCount = sel ? sel.n - (m.monthsPaid || 0) + 1 : 0;
  const selAmount = selCount === 12 && m.billingPlan === 'yearly' ? p.yearly : selCount * p.monthly;
  const big = {
    yours: null,
    off: ['Switched off', 'Their logins are stopped. Nothing is deleted.'],
    free: [`Free until ${formatDateGB(dayBefore(b.start || nextDue))}`, `First payment due ${formatDateGB(b.start || nextDue)}`],
    paid: [`Paid to ${formatDateGB(b.paidTo || dayBefore(nextDue))}`, `Next due ${formatDateGB(nextDue)}`],
    overdue: [`Overdue · ${money(b.owed || 0)}`, `Unpaid since ${formatDateGB(nextDue)} (${b.monthsOwed} month${b.monthsOwed === 1 ? '' : 's'})`],
  }[b.state];
  const planLine = m.billingPlan === 'yearly' ? `Yearly · ${money(p.yearly)}` : `Monthly · ${money(p.monthly)} on the 1st`;
  const joined = formatDateGB(String(m.createdAt).slice(0, 10));

  return (
    <ModalShell title={m.name} width={480} onClose={onClose} busy={busy}
      sub={<>Joined {joined}{m.selfSignup ? ' · signed themselves up' : ''}{!m.isYours && <> · {m.termsAccepted ? `terms agreed ${formatDateGB(m.termsAccepted)}` : 'terms not agreed yet'}</>}</>}>
      {big && (
        <div className={`pay-status pay-${b.state === 'paid' && b.warn ? 'warn' : b.state === 'free' && b.warn ? 'warn' : b.state}`}>
          <div className="pay-status-big">{big[0]}</div>
          <div className="pay-status-sub">{big[1]}{b.state !== 'off' && <> · {planLine}</>}</div>
        </div>
      )}

      {!m.isYours && m.active && <>
        <div className="form-section-title pay-h">They've just paid…</div>
        <div className="pay-quick">
          <button type="button" className="pay-quick-btn" disabled={busy} onClick={() => pay(1, p.monthly)}>
            Next month<small>{money(p.monthly)} · covers {monthName(nextDue)}</small>
          </button>
          <button type="button" className="pay-quick-btn pay-quick-year" disabled={busy} onClick={() => pay(12, p.yearly)}>
            A year<small>{money(p.yearly)} · {monthName(nextDue)} – {monthName(addMonths(nextDue, 11))}</small>
          </button>
        </div>
        {!other ? (
          <button type="button" className="pay-link" onClick={() => setOther(true)}>A different amount</button>
        ) : (
          <div className="pay-other">
            <div className="pay-other-grid">
              <div className="form-group"><label>Amount (£)</label>
                <input type="number" min="0" step="0.01" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} /></div>
              <div className="form-group"><label>Months it pays for</label>
                <input type="number" min="0" max="60" step="1" value={f.months} onChange={e => setF({ ...f, months: e.target.value })} /></div>
              <div className="form-group"><label>Paid on</label>
                <input type="date" value={f.paidOn} onChange={e => setF({ ...f, paidOn: e.target.value })} /></div>
            </div>
            <div className="form-group" style={{ marginTop: 8 }}>
              <input value={f.note} onChange={e => setF({ ...f, note: e.target.value })} placeholder="Note (optional)" maxLength={200} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="btn btn-primary btn-sm" disabled={busy || !(Number(f.amount) > 0) || !f.paidOn}
                onClick={() => run(async () => { await addPayment(m.id, { paidOn: f.paidOn, amount: Number(f.amount), months: Number(f.months) || 0, note: f.note }); setOther(false); }, `Recorded ${money(Number(f.amount) || 0)}`)}>
                <Plus size={13} /> Record payment
              </button>
              <button className="btn btn-sm" onClick={() => setOther(false)}>Cancel</button>
            </div>
          </div>
        )}
      </>}
      {done && <div className="pay-done">✓ {done}</div>}
      {error && <div style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 10 }}>{error}</div>}

      {!m.isYours && <>
        <div className="pay-year">
          <button type="button" className="btn btn-icon btn-sm" onClick={() => { setYear(year - 1); setSel(null); }} aria-label="Previous year"><ChevronLeft size={15} /></button>
          <span>{year}</span>
          <button type="button" className="btn btn-icon btn-sm" onClick={() => { setYear(year + 1); setSel(null); }} aria-label="Next year"><ChevronRight size={15} /></button>
        </div>
        <div className="pay-months">
          {boxes.map(x => (
            <button key={x.first} type="button" disabled={!m.active || !(x.kind === 'owed' || x.kind === 'notdue')}
              className={`pay-month pay-month-${x.kind}${sel && sel.first === x.first ? ' is-sel' : ''}`}
              onClick={() => setSel(sel && sel.first === x.first ? null : x)}>
              {x.name}<small>{{ before: '—', free: 'Free', paid: 'Paid', owed: 'Owed', notdue: 'Not due yet' }[x.kind]}</small>
            </button>
          ))}
        </div>
        {sel ? (
          <div className="pay-sel">
            <span>Paid {money(selAmount)} for {selCount === 1 ? monthName(sel.first) : `${monthName(nextDue)} – ${monthName(sel.first)}`}?</span>
            <span style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={async () => { await pay(selCount, selAmount); setSel(null); }}>Record</button>
              <button className="btn btn-sm" onClick={() => setSel(null)}>Cancel</button>
            </span>
          </div>
        ) : m.active && <div className="pay-hint">Tap a month to mark it (and any before it) paid.</div>}

        <div className="form-section-title pay-h">Plan</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="pill-tabs" style={{ marginBottom: 0 }}>
            {[['monthly', 'Monthly'], ['yearly', 'Yearly']].map(([k, l]) => (
              <button key={k} type="button" className={`pill-tab ${m.billingPlan === k ? 'active' : ''}`} disabled={busy}
                onClick={() => m.billingPlan !== k && savePlan(k, DEFAULT_PRICE[k])}>{l}</button>
            ))}
          </div>
          <span className="pay-price">£<input type="number" min="0" step="1" value={price} onChange={e => setPrice(e.target.value)}
            onBlur={() => Number(price) > 0 && Number(price) !== Number(m.billingAmount) && savePlan(m.billingPlan, Number(price))} />
            {m.billingPlan === 'yearly' ? 'a year' : 'a month'}</span>
        </div>

        {payments && payments.length > 0 && <>
          <div className="form-section-title pay-h">Payments received</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {payments.map(x => (
              <div key={x.id} className="pay-row">
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong>{money(x.amount)}</strong> · {x.months} month{x.months === 1 ? '' : 's'}
                  <span className="text-muted"> · {formatDateGB(x.paidOn)}{x.note ? ` · ${x.note}` : ''}</span>
                </span>
                <button className="btn btn-icon btn-sm" title="Remove this payment" disabled={busy} onClick={() => {
                  if (window.confirm(`Remove the ${money(x.amount)} payment from ${formatDateGB(x.paidOn)}?`)) run(() => deletePayment(m.id, x.id));
                }}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        </>}
      </>}

      <div className="form-section-title pay-h">Contact</div>
      <div className="pay-contact">
        {m.contactName && <div><span>Head</span>{m.contactName}</div>}
        {m.headLogin && <div><span>Login</span>{m.headLogin}</div>}
        <div><span>Code</span>{m.code}</div>
        {(m.contactPhone || m.contactEmail) && (
          <div className="pay-contact-btns">
            {m.contactPhone && <a className="btn btn-sm" href={`https://wa.me/${whatsappNumber(m.contactPhone)}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={13} /> WhatsApp</a>}
            {m.contactPhone && <a className="btn btn-sm" href={`tel:${m.contactPhone.replace(/\s/g, '')}`}><Phone size={13} /> {m.contactPhone}</a>}
            {m.contactEmail && <a className="btn btn-sm" href={`mailto:${m.contactEmail}`}><Mail size={13} /> Email</a>}
          </div>
        )}
      </div>

      <div className="form-section-title pay-h">Size</div>
      <div className="pay-stats">
        {[['Children', m.students], ['Teachers', m.teachers], ['Classes', m.classes], ['AI this month', m.aiThisMonth], ['AI all time', m.aiTotal]].map(([l, v]) => (
          <div key={l}><b>{v}</b>{l}</div>
        ))}
      </div>

      <div className="form-section-title pay-h">Manage</div>
      <div className="pay-manage">
        <button className="btn" onClick={() => open('edit', m)}><Pencil size={13} /> Edit details</button>
        {!m.isYours && <button className="btn" onClick={() => open('password', m)}><KeyRound size={13} /> Reset head's password</button>}
        {!m.isYours && <button className="btn" style={m.active ? { color: 'var(--red)' } : undefined} onClick={() => open('power', m)}><Power size={13} /> {m.active ? 'Switch off' : 'Switch on'}</button>}
        {!m.isYours && !m.active && <button className="btn" style={{ color: 'var(--red)' }} onClick={() => open('delete', m)}><Trash2 size={13} /> Delete</button>}
      </div>
    </ModalShell>
  );
}

// Deletes a switched-off madrasah and everything in it — typed code to confirm.
function DeleteModal({ m, onClose, onDeleted }) {
  const [typed, setTyped] = useState('');
  const { busy, error, setError, submit } = useSubmit();
  const matches = typed.trim().toLowerCase() === String(m.code).toLowerCase();
  return (
    <ModalShell title={`Delete ${m.name}?`} onClose={onClose} busy={busy} footer={<>
      <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
      <button className="btn btn-danger" disabled={busy || !matches}
        onClick={() => submit(async () => { await deleteMadrasah(m.id, typed.trim()); await onDeleted(); })}>
        <Trash2 size={13} />{busy ? 'Deleting…' : 'Delete for ever'}
      </button>
    </>}>
      <div style={{ fontSize: 13, marginBottom: 12 }}>
        This deletes <strong>everything</strong> for this madrasah — its {m.students} student{m.students === 1 ? '' : 's'}, attendance, fees,
        reports, Qur'an records, logins and settings. <strong>It can't be undone.</strong>
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 12 }}>
        If they might want their records, ask the head to download a Backup first (Settings → Backup) — switch it back on for them to do that.
      </div>
      <div className="form-group">
        <label>Type its code to confirm</label>
        <input value={typed} onChange={e => { setTyped(e.target.value); setError(''); }} placeholder={m.code} {...noAuto} autoFocus />
        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>The code is <strong style={{ color: 'var(--ink)' }}>{m.code}</strong></span>
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
