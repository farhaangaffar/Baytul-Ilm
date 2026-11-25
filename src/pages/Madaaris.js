import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import SignupNotifications from '../components/SignupNotifications';
import BoxRow from '../components/BoxRow';
import { LoadingState, ErrorState } from '../components/DataState';
import { getMadaaris, createMadrasah, updateMadrasah, deleteMadrasah, formatDateGB, getDbUsage, getPlatformCounts, getIncome, getPayments, addPayment, deletePayment, getInvoiceDetails, saveInvoiceDetails, changeMadrasahHead } from '../lib/store';
import { billing, billingStart, prices, monthBoxes, addMonths, dayBefore, monthName, money, todayLocal, defaultPrice, KIND_LABELS } from '../lib/billing';
import { APP_NAME, APP_URL } from '../lib/branding';
import { Plus, X, Save, Pencil, KeyRound, UserCog, Power, Sparkles, ExternalLink, Copy, Share2, PlayCircle, Database, Trash2, ChevronLeft, ChevronRight, MessageCircle, Phone, Mail, FileText, Download, Search, Bell } from 'lucide-react';
import { askConfirm } from '../lib/dialog';

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

function suggestCode(name) {
  return String(name || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
}

// The kinds, in the order they're shown (the boxes at the top of Customers and the Add button's words).
const KINDS = [['maktab', 'Maktabs', 'a maktab'], ['darul_uloom', 'Darul Ulooms', 'a Darul Uloom'], ['school', 'Schools', 'a school']];
const TAB_KEY = 'suhuf_hq_tab';
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// One line's second line: what kind of place it is and its size, in its own words.
function placeWords(m, withKind) {
  if (m.kind === 'school') {
    return [PHASE_LABELS[m.schoolPhase] || 'School', m.schoolForms ? plural(m.schoolForms, 'form', 'forms') : '', plural(m.students, 'pupil', 'pupils')].filter(Boolean).join(' · ');
  }
  const kind = m.kind === 'darul_uloom' ? 'Darul Uloom' : 'Maktab';
  const size = m.kind === 'darul_uloom' ? `${plural(m.students, 'student', 'students')} · ${plural(m.classes, 'class', 'classes')}` : `${plural(m.students, 'child', 'children')} · ${plural(m.classes, 'class', 'classes')}`;
  return withKind ? `${kind} · ${size}` : size;
}

// Why a place needs the platform owner: overdue, due (or free ending) within 2 weeks, or new (signed up in the last 14 days).
function needOf(m, b) {
  if (b.state === 'overdue') return { word: 'Overdue', colour: 'var(--red-text)', rank: 0 };
  if (b.warn) return { word: b.state === 'free' ? 'Free ending' : 'Due soon', colour: 'var(--amber-text)', rank: 1 };
  if (m.selfSignup && Date.now() - new Date(m.createdAt) < 14 * 864e5) return { word: 'New', colour: 'var(--teal-dark)', rank: 2 };
  return null;
}

export default function Madaaris() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [list, setList] = useState([]);
  const [modal, setModal] = useState(null); // { kind: 'add', placeKind } | { kind: 'detail'|'edit'|'password'|'power'|'delete'|'invoice'|'head', m, back } | { kind: 'ai'|'db'|'counts'|'demos'|'alerts'|'pick-invoice' }
  const [created, setCreated] = useState(null); // details to hand over after adding one
  const [toast, setToast] = useState('');
  const [tab, setTabState] = useState(() => { try { return localStorage.getItem(TAB_KEY) || 'customers'; } catch { return 'customers'; } });
  const setTab = t => { setTabState(t); try { localStorage.setItem(TAB_KEY, t); } catch { /* not kept */ } };
  const [show, setShow] = useState('all'); // 'need' | 'all' | a kind
  const [find, setFind] = useState('');
  const [allPayments, setAllPayments] = useState(false);
  const [dbBytes, setDbBytes] = useState(null);
  useEffect(() => { getDbUsage().then(u => setDbBytes(u.dbBytes)).catch(() => {}); }, []);
  const [counts, setCounts] = useState(null);
  useEffect(() => { getPlatformCounts().then(setCounts).catch(() => {}); }, []);
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

  const TITLE = 'Suhuf HQ';
  if (loading) return <Layout title={TITLE}><LoadingState /></Layout>;
  if (error) return <Layout title={TITLE}><ErrorState error={error} onRetry={load} /></Layout>;

  const totals = list.reduce((t, m) => ({ students: t.students + m.students, ai: t.ai + m.aiThisMonth, aiAll: t.aiAll + m.aiTotal }), { students: 0, ai: 0, aiAll: 0 });
  const pounds = n => `£${((n * PENCE_PER_AI_REQUEST) / 100).toFixed(2)}`;
  // The three demos — each made-up madrasah or school of its own kind.
  const DEMOS = [
    ['Maktab', `${APP_URL}/?demo`, `Have a look around ${APP_NAME}, the madrasah app:`],
    ['Darul Uloom & Aalimiyyah', `${APP_URL}/?demo=darul-uloom`, `Have a look around ${APP_NAME} for Darul Ulooms and Aalimiyyah courses:`],
    ['School Islamic Studies', `${APP_URL}/?demo=school`, `Have a look around ${APP_NAME} for a school's Islamic Studies department:`],
  ];
  async function copyDemo(link) {
    try { await navigator.clipboard.writeText(link); showToast('Demo link copied'); }
    catch { window.prompt('Copy the demo link:', link); }
  }
  async function shareDemo(link, text) {
    try { await navigator.share({ title: `${APP_NAME} demo`, text, url: link }); }
    catch { /* closed, or sharing not available */ }
  }
  const signInLink = code => `${APP_URL}/?m=${encodeURIComponent(code)}`;

  // Every place with where it is with paying and whether it needs the platform owner.
  const rows = list.map(m => { const b = billing(m); return { m, b, need: needOf(m, b) }; });
  const needCount = rows.filter(r => r.need).length;
  const kindCount = k => list.filter(m => (m.kind || 'maktab') === k).length;
  const shownKind = show === 'need' || show === 'all' ? null : show;
  const q = find.trim().toLowerCase();
  const shown = rows
    .filter(r => show === 'need' ? r.need : show === 'all' ? true : (r.m.kind || 'maktab') === show)
    .filter(r => !q || r.m.name.toLowerCase().includes(q) || String(r.m.code).includes(q))
    .sort((a, b) => (a.need ? a.need.rank : 9) - (b.need ? b.need.rank : 9) || (b.m.active - a.m.active) || a.m.name.localeCompare(b.m.name));
  const shownTitle = show === 'need' ? 'Need you' : show === 'all' ? 'Everyone' : KINDS.find(k => k[0] === show)[1];
  const shownChildren = shown.reduce((t, r) => t + r.m.students, 0);

  // Money: expected each month from those paying, due soon and overdue.
  const paying = rows.filter(x => x.b.state === 'paid' || x.b.state === 'overdue');
  const overdue = paying.filter(x => x.b.owed > 0);
  const dueSoon = rows.filter(x => x.b.state === 'paid' && x.b.warn).length;
  const payments = income?.recent || [];
  const openPlace = id => { const m = list.find(x => x.id === id); if (m) setModal({ kind: 'detail', m }); };

  // Suhuf tab: a line each, its figure on the right, opening its pop-up.
  const dbPct = dbBytes == null ? null : Math.min(100, Math.round((dbBytes / DB_LIMIT_BYTES) * 100));
  const sum3 = (a, b, k) => counts ? (counts[a]?.[k] || 0) + (counts[b]?.[k] || 0) + (counts[`${a}_school`]?.[k] || 0) : null;
  const suhufLines = [
    ['ai', Sparkles, 'AI this month', `${plural(totals.ai, 'request', 'requests')} · balance on Anthropic's page`, pounds(totals.ai)],
    ['db', Database, 'Database space', dbBytes == null ? 'Checking…' : `${Math.round(dbBytes / 1048576)} MB of 512 MB on the free plan`, dbPct == null ? '' : `${dbPct}%`],
    ['counts', PlayCircle, 'Demos & sign-ups', 'This month · last month · all time', counts ? `${sum3('demo', 'demo_du', 'thisMonth')} · ${sum3('signup', 'signup_du', 'thisMonth')}` : ''],
    ['demos', Share2, 'Demo links', 'Maktab · Darul Uloom · School — copy or share', '3'],
    ['alerts', Bell, 'Phone alerts', 'When a madrasah or school signs up', ''],
  ];

  return (
    <Layout title={TITLE} subtitle="Every maktab, Darul Uloom and school on Suhuf">
      <div className="student-tabs" role="tablist" style={{ maxWidth: 520 }}>
        {[['customers', 'Customers'], ['money', 'Money'], ['suhuf', 'Suhuf']].map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'customers' && <>
        <BoxRow columns={`repeat(${needCount ? 5 : 4}, minmax(0, 1fr))`} cells={[
          ...(needCount ? [{ text: String(needCount), sub: 'Need you', tone: 'amber', onClick: () => setShow('need'), className: show === 'need' ? 'hq-picked' : undefined }] : []),
          { text: String(list.length), sub: 'Everyone', tone: show === 'all' ? 'blue' : undefined, className: show === 'all' ? undefined : 'ct-figure', onClick: () => setShow('all') },
          ...KINDS.map(([k, l]) => ({ text: String(kindCount(k)), sub: l, tone: show === k ? 'blue' : undefined, className: show === k ? undefined : 'ct-figure', onClick: () => setShow(k) })),
        ]} />
        <div style={{ height: 10 }} />

        <div className="card">
          <div className="hq-card-head">
            <div className="card-title">{shownTitle}</div>
            <div className="text-muted" style={{ fontSize: 12.5 }}>{shownChildren.toLocaleString('en-GB')} {shownKind === 'school' ? 'pupils' : shownKind === 'darul_uloom' ? 'students' : shownKind === 'maktab' ? 'children' : 'children, students and pupils'}</div>
            {list.length > 12 && (
              <label className="hq-find">
                <Search size={14} aria-hidden="true" />
                <input value={find} onChange={e => setFind(e.target.value)} placeholder="Find a name" aria-label="Find a name" />
                {find && <button type="button" className="btn btn-icon" style={{ padding: 2 }} onClick={() => setFind('')} aria-label="Clear"><X size={13} /></button>}
              </label>
            )}
          </div>
          <div className="hq-lines">
            {shown.map(({ m, b, need }) => (
              <button key={m.id} type="button" className="line-row" onClick={() => setModal({ kind: 'detail', m })} style={{ opacity: m.active ? 1 : 0.6 }}>
                <span className="ct-two">
                  <span className="line-row-name">{m.name}</span>
                  <span className="line-row-sub">
                    {need && <b style={{ color: need.colour }}>{need.word} · </b>}
                    {placeWords(m, !shownKind)}
                  </span>
                </span>
                <span style={{ fontSize: 12.5, color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>{b.state === 'overdue' ? `${money(b.owed)} owed` : b.label}</span>
              </button>
            ))}
            {!shown.length && <div className="text-muted" style={{ fontSize: 13, padding: '6px 2px' }}>{q ? `Nothing called “${find.trim()}”.` : show === 'need' ? 'Nothing needs you right now.' : 'None yet.'}</div>}
          </div>
          <button className="btn" style={{ marginTop: 12 }} onClick={() => setModal({ kind: 'add', placeKind: shownKind || 'maktab' })}>
            <Plus size={14} /> {shownKind ? `Add ${KINDS.find(k => k[0] === shownKind)[2]}` : 'Add a maktab, Darul Uloom or school'}
          </button>
        </div>
        <div className="text-muted" style={{ fontSize: 12, margin: '10px 2px 0' }}>You only see counts here — each one's children, fees and reports stay private to them.</div>
      </>}

      {tab === 'money' && <>
        <BoxRow className="hq-boxes-4" columns={null} cells={[
          { text: income ? money(income.thisMonth) : '…', sub: 'In this month', className: 'ct-figure' },
          { text: income ? money(income.last12) : '…', sub: 'Last 12 months', className: 'ct-figure' },
          dueSoon ? { text: String(dueSoon), sub: 'Due soon', tone: 'amber' } : { text: '0', sub: 'Due soon', className: 'ct-figure' },
          overdue.length ? { text: money(overdue.reduce((t, x) => t + x.b.owed, 0)), sub: `Overdue · ${overdue.length}`, tone: 'red', onClick: () => { setShow('need'); setTab('customers'); } } : { text: '£0', sub: 'Overdue', className: 'ct-figure' },
        ]} />
        <div className="text-muted" style={{ fontSize: 12, margin: '4px 2px 12px' }}>
          Expected each month from those paying: {money(paying.reduce((t, { m }) => t + (m.billingPlan === 'yearly' ? prices(m).yearly / 12 : prices(m).monthly), 0))}
        </div>

        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card-title" style={{ marginBottom: 10 }}>Payments received</div>
          <div className="hq-lines">
            {(allPayments ? payments : payments.slice(0, 10)).map(p => (
              <button key={p.id} type="button" className="line-row" onClick={() => openPlace(p.madrasahId)}>
                <span className="ct-two">
                  <span className="line-row-name">{p.name}</span>
                  <span className="line-row-sub">{formatDateGB(p.paidOn)} · {p.months === 12 ? 'a year' : plural(p.months, 'month', 'months')}</span>
                </span>
                <span style={{ fontFamily: 'var(--font-num)', fontWeight: 600, whiteSpace: 'nowrap' }}>{money(p.amount)}</span>
              </button>
            ))}
            {income && !payments.length && <div className="text-muted" style={{ fontSize: 13 }}>No payments yet — record one inside a customer.</div>}
          </div>
          {!allPayments && payments.length > 10 && <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={() => setAllPayments(true)}>Show all {payments.length} payments</button>}
        </div>

        <div className="card">
          <button type="button" className="line-row" onClick={() => setModal({ kind: 'pick-invoice' })}>
            <FileText size={16} style={{ flexShrink: 0 }} />
            <span className="ct-two">
              <span className="line-row-name">Make an invoice</span>
              <span className="line-row-sub">For any customer · your bank details are kept</span>
            </span>
            <ChevronRight size={16} style={{ color: 'var(--text-soft)', flexShrink: 0 }} />
          </button>
        </div>
      </>}

      {tab === 'suhuf' && (
        <div className="card">
          <div className="hq-lines">
            {suhufLines.map(([k, Icon, name, sub, fig]) => (
              <button key={k} type="button" className="line-row" onClick={() => setModal({ kind: k })}>
                <Icon size={16} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
                <span className="ct-two">
                  <span className="line-row-name">{name}</span>
                  <span className="line-row-sub">{sub}</span>
                </span>
                {fig && <span style={{ fontFamily: 'var(--font-num)', fontWeight: 600, whiteSpace: 'nowrap' }}>{fig}</span>}
                <ChevronRight size={16} style={{ color: 'var(--text-soft)', flexShrink: 0 }} />
              </button>
            ))}
          </div>
        </div>
      )}

      {modal?.kind === 'ai' && (
        <ModalShell title="AI this month" sub="Your balance is on Anthropic's billing page — top up there." onClose={() => setModal(null)}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginBottom: 12 }}>
            <div className="info-box"><strong>{totals.ai} · ≈ {pounds(totals.ai)}</strong><span className="info-box-label">This month</span></div>
            <div className="info-box"><strong>{totals.aiAll} · ≈ {pounds(totals.aiAll)}</strong><span className="info-box-label">All time</span></div>
          </div>
          <a className="btn btn-primary" href={AI_BILLING_URL} target="_blank" rel="noopener noreferrer" style={{ width: '100%', justifyContent: 'center', textDecoration: 'none' }}>
            <ExternalLink size={14} /> Check balance & top up
          </a>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 8 }}>Costs are a rough guide (about {PENCE_PER_AI_REQUEST}p per summary).</div>
        </ModalShell>
      )}
      {modal?.kind === 'db' && (
        <ModalShell title="Database space" onClose={() => setModal(null)}>
          {dbBytes == null ? <div className="text-muted">Checking…</div> : <>
            <div style={{ fontSize: 13, marginBottom: 10 }}>{Math.round(dbBytes / 1048576)} MB of 512 MB on the free plan ({dbPct}%).{dbPct >= 80 ? ' Time to move to a paid plan.' : ''}</div>
            <div style={{ height: 8, borderRadius: 99, background: '#eef0f3', overflow: 'hidden' }}>
              <div style={{ width: `${Math.max(dbPct, 2)}%`, height: '100%', background: dbPct >= 80 ? 'var(--red)' : dbPct >= 60 ? 'var(--amber)' : 'var(--green)' }} />
            </div>
          </>}
        </ModalShell>
      )}
      {modal?.kind === 'counts' && (
        <ModalShell title="Demos & sign-ups" sub="Kept for good — the visitor figures in Vercel only go back 31 days." width={520} onClose={() => setModal(null)}>
          {counts ? <CountsCard counts={counts} /> : <div className="text-muted">Loading…</div>}
        </ModalShell>
      )}
      {modal?.kind === 'demos' && (
        <ModalShell title="Demo links" sub="Send the right one to anyone who wants to try the app — they get their own made-up madrasah or school." width={480} onClose={() => setModal(null)}>
          <div style={{ display: 'grid', gap: 8 }}>
            {DEMOS.map(([label, link, text]) => (
              <div key={link} className="line-row" style={{ cursor: 'default' }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 600 }}>{label}</span>
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{link.replace(/^https?:\/\//, '')}</span>
                </span>
                <button className="btn btn-sm" onClick={() => copyDemo(link)} aria-label={`Copy the ${label} demo link`}><Copy size={13} /> Copy</button>
                {typeof navigator !== 'undefined' && navigator.share && <button className="btn btn-sm" onClick={() => shareDemo(link, text)} aria-label={`Share the ${label} demo link`}><Share2 size={13} /></button>}
              </div>
            ))}
          </div>
        </ModalShell>
      )}
      {modal?.kind === 'alerts' && (
        <ModalShell title="Phone alerts" width={480} onClose={() => setModal(null)}>
          <SignupNotifications />
        </ModalShell>
      )}
      {modal?.kind === 'pick-invoice' && (
        <ModalShell title="Make an invoice" sub="Which one is it for?" width={480} onClose={() => setModal(null)}>
          <div style={{ display: 'grid', gap: 8 }}>
            {rows.filter(r => !r.m.isYours).sort((a, b) => (a.need ? a.need.rank : 9) - (b.need ? b.need.rank : 9) || a.m.name.localeCompare(b.m.name)).map(({ m, b }) => (
              <button key={m.id} type="button" className="line-row" onClick={() => setModal({ kind: 'invoice', m })}>
                <span className="ct-two">
                  <span className="line-row-name">{m.name}</span>
                  <span className="line-row-sub">{placeWords(m, true)}</span>
                </span>
                <span style={{ fontSize: 12.5, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{b.label}</span>
              </button>
            ))}
          </div>
        </ModalShell>
      )}

      {modal?.kind === 'add' && (
        <AddModal startKind={modal.placeKind} onClose={() => setModal(null)} onCreated={async details => { setModal(null); setCreated(details); await load(); }} />
      )}
      {modal?.kind === 'edit' && (
        <EditModal m={modal.m} onClose={back} onSaved={async () => { back(); showToast('Saved'); await load(); }} />
      )}
      {modal?.kind === 'head' && (
        <ChangeHeadModal m={modal.m} onClose={back} onSaved={async () => { back(); showToast('Head changed'); await load(); }} />
      )}
      {modal?.kind === 'invoice' && <InvoiceModal m={list.find(x => x.id === modal.m.id) || modal.m} onClose={back} />}
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

function AddModal({ startKind = 'maktab', onClose, onCreated }) {
  const [f, setF] = useState({ name: '', code: '', headLogin: '', headPassword: '', kind: startKind, schoolPhase: 'primary', schoolForms: 1 });
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
      <KindChoice value={f.kind} onChange={k => set('kind', k)} />
      {f.kind === 'school' && <SchoolSize phase={f.schoolPhase} forms={f.schoolForms} onPhase={v => set('schoolPhase', v)} onForms={v => set('schoolForms', v)} />}
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
      <div style={{ fontSize: 11.5, color: 'var(--text-soft)' }}>The head can change this once signed in. Their madrasah starts empty, with this academic year added, and is free for {f.kind === 'school' ? `the rest of this term, then ${{ 1: '£500', 2: '£800', 3: '£1,000' }[f.schoolForms] || 'the price you agree (set it in Payments)'} a year` : `6 months${f.kind === 'darul_uloom' ? ', then £500 a year' : ''}`}.</div>
      {error && <div style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 10 }}>{error}</div>}
    </ModalShell>
  );
}

// Maktab or Darul Uloom — a Darul Uloom also gets the Darul Uloom pages. Only set here, by
// the platform owner (so a mistake can be put right).
function KindChoice({ value, onChange }) {
  return (
    <div className="form-group" style={{ marginBottom: 12 }}>
      <label>Type</label>
      <div className="pill-tabs" style={{ marginBottom: 0 }}>
        {Object.entries(KIND_LABELS).map(([k, l]) => (
          <button key={k} type="button" className={`pill-tab ${value === k ? 'active' : ''}`} onClick={() => onChange(k)}>{l}</button>
        ))}
      </div>
    </div>
  );
}

// A school's phase and forms of entry (its yearly price follows the forms: 1 £500, 2 £800, 3 £1,000; more is agreed).
const PHASES = [['primary', 'Primary'], ['secondary', 'Secondary'], ['all-through', 'All-through']];
export const PHASE_LABELS = Object.fromEntries(PHASES);
function SchoolSize({ phase, forms, onPhase, onForms }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: 10, marginBottom: 12 }}>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label>School</label>
        <select value={phase || ''} onChange={e => onPhase(e.target.value || null)}>
          <option value="">Not said</option>
          {PHASES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label>Forms of entry</label>
        <input type="number" min="1" max="20" step="1" value={forms || ''} onChange={e => onForms(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} />
      </div>
    </div>
  );
}

function EditModal({ m, onClose, onSaved }) {
  const [name, setName] = useState(m.name);
  const [code, setCode] = useState(m.code);
  const [freeUntil, setFreeUntil] = useState(m.freeUntil || '');
  const [kind, setKind] = useState(m.kind || 'maktab');
  const [phase, setPhase] = useState(m.schoolPhase || null);
  const [forms, setForms] = useState(m.schoolForms || 1);
  const { busy, error, setError, submit } = useSubmit();
  const changes = {};
  if (kind !== (m.kind || 'maktab')) changes.kind = kind;
  if (kind === 'school' && (phase || null) !== (m.schoolPhase || null)) changes.schoolPhase = phase;
  if (kind === 'school' && Number(forms) !== Number(m.schoolForms || (changes.kind ? 0 : 1))) changes.schoolForms = Number(forms);
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
      <div style={{ marginTop: 12 }}><KindChoice value={kind} onChange={k => { setKind(k); setError(''); }} /></div>
      {changes.kind && <div style={{ fontSize: 11.5, color: 'var(--amber-text)', marginTop: -6, marginBottom: 10 }}>Their plan and price change to a {KIND_LABELS[kind]}'s ({kind === 'darul_uloom' ? '£500 a year' : kind === 'school' ? '£500 a year — £800 for two forms, £1,000 for three' : '£20 a month'}). Nothing they've entered is lost.</div>}
      {kind === 'school' && <SchoolSize phase={phase} forms={forms} onPhase={v => { setPhase(v); setError(''); }} onForms={v => { setForms(v); setError(''); }} />}
      {kind === 'school' && !changes.kind && changes.schoolForms && <div style={{ fontSize: 11.5, color: 'var(--amber-text)', marginTop: -6 }}>{changes.schoolForms <= 3 ? `Their price changes to ${{ 1: '£500', 2: '£800', 3: '£1,000' }[changes.schoolForms]} a year.` : 'Set the price you agree with them in Plan.'}</div>}
      {!m.isYours && (
        <div className="form-group" style={{ marginTop: 12 }}>
          <label>Free until</label>
          <input type="date" value={freeUntil} onChange={e => { setFreeUntil(e.target.value); setError(''); }} />
          <span style={{ fontSize: 11.5, color: 'var(--text-soft)', marginTop: 4 }}>{m.kind === 'school' ? 'The end of the term they joined in (the next term too if they joined near its end)' : '6 months from joining (free to the end of that month)'} — change it to give them longer.</span>
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
// Demos tried and madaaris signed up (platform_counts, kept for good): this month · last month · all time, with how many of
// each were Darul Uloom. Started-demo counts begin the day this card was added; sign-ups include every earlier self sign-up.
function CountsCard({ counts }) {
  const sum = (a, b, k) => (counts[a]?.[k] || 0) + (counts[b]?.[k] || 0) + (counts[`${a}_school`]?.[k] || 0);
  const firstDemo = [counts.demo?.since, counts.demo_du?.since, counts.demo_school?.since].filter(Boolean).sort()[0];
  const rows = [['Demos tried', 'demo', 'demo_du'], ['Sign-ups', 'signup', 'signup_du']];
  return (
    <div>
      {rows.map(([label, a, b]) => (
        <div key={a} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{label}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
            {[['thisMonth', 'This month'], ['lastMonth', 'Last month'], ['allTime', 'All time']].map(([k, l]) => {
              const du = counts[b]?.[k] || 0;
              return (
                <div key={k} className="info-box">
                  <strong>{sum(a, b, k)}</strong>
                  <span className="info-box-label">{l}</span>
                  <span className="info-box-label" style={{ fontSize: 11 }}>{du} Darul Uloom{counts[`${a}_school`]?.[k] ? ` · ${counts[`${a}_school`][k]} school` : ''}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
        {firstDemo ? `Demos counted since ${formatDateGB(String(firstDemo).slice(0, 10))}.` : 'Demos are counted from today.'}
      </div>
    </div>
  );
}

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
                onClick={() => m.billingPlan !== k && savePlan(k, prices(m)[k])}>{l}</button>
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
                <button className="btn btn-icon btn-sm" title="Remove this payment" disabled={busy} onClick={async () => {
                  if (await askConfirm(`Remove the ${money(x.amount)} payment from ${formatDateGB(x.paidOn)}?`, { ok: 'Remove', danger: true })) run(() => deletePayment(m.id, x.id));
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
        {m.referredBy && <div><span>Recommended by</span>{m.referredBy}{m.referralRewarded ? ' (given a month free)' : ' (same address — no free month)'}</div>}
        {m.referrals > 0 && <div><span>Recommended</span>{m.referrals} madrasah{m.referrals === 1 ? '' : 's'}</div>}
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
        {(m.kind === 'school'
          ? [['Pupils', m.students], ['Teachers', m.teachers], ['Classes', m.classes], ['Forms of entry', m.schoolForms || '—'], ['School', PHASE_LABELS[m.schoolPhase] || '—']]
          : [['Children', m.students], ['Teachers', m.teachers], ['Classes', m.classes], ['AI this month', m.aiThisMonth], ['AI all time', m.aiTotal]]).map(([l, v]) => (
          <div key={l}><b>{v}</b>{l}</div>
        ))}
      </div>

      <div className="form-section-title pay-h">Manage</div>
      <div className="pay-manage">
        <button className="btn" onClick={() => open('edit', m)}><Pencil size={13} /> Edit details</button>
        {!m.isYours && <button className="btn" onClick={() => open('invoice', m)}><FileText size={13} /> Invoice</button>}
        {!m.isYours && <button className="btn" onClick={() => open('password', m)}><KeyRound size={13} /> Reset head's password</button>}
        {!m.isYours && <button className="btn" onClick={() => open('head', m)}><UserCog size={13} /> Change head</button>}
        {!m.isYours && <button className="btn" style={m.active ? { color: 'var(--red)' } : undefined} onClick={() => open('power', m)}><Power size={13} /> {m.active ? 'Switch off' : 'Switch on'}</button>}
        {!m.isYours && !m.active && <button className="btn" style={{ color: 'var(--red)' }} onClick={() => open('delete', m)}><Trash2 size={13} /> Delete</button>}
      </div>
    </ModalShell>
  );
}

// "Change head": a head left without handing over, or the madrasah appoints someone else. The chosen head login (the main
// head, or the second one) gets the new person's name, email (their login) and a starting password; the old person is signed
// out everywhere; for the main head the madrasah's contact details change too. Check with the madrasah first.
function ChangeHeadModal({ m, onClose, onSaved }) {
  const heads = m.heads || [];
  const [userId, setUserId] = useState(heads[0]?.id || '');
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '' });
  const { busy, error, setError, submit } = useSubmit();
  const set = k => e => { setF({ ...f, [k]: e.target.value }); setError(''); };
  const ok = userId && f.name.trim() && f.email.trim() && f.password.length >= 8;
  return (
    <ModalShell title={`Change head — ${m.name}`} onClose={onClose} busy={busy} footer={<>
      <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
      <button className="btn btn-primary" disabled={busy || !ok} onClick={() => submit(async () => { await changeMadrasahHead(m.id, { ...f, userId }); await onSaved(); })}>
        <Save size={13} />{busy ? 'Saving…' : 'Change head'}
      </button>
    </>}>
      <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>Check with the {m.kind === 'school' ? 'school' : 'madrasah'} first. The old head is signed out and can't sign in again; everything they've entered stays.</div>
      {heads.length > 1 && (
        <div className="form-group" style={{ marginBottom: 12 }}>
          <label>Which head?</label>
          <div className="pill-tabs" style={{ marginBottom: 0 }}>
            {heads.map((h, i) => (
              <button key={h.id} type="button" className={`pill-tab ${userId === h.id ? 'active' : ''}`} onClick={() => setUserId(h.id)}>{h.name || h.login}{i === 0 ? ' (main)' : ''}</button>
            ))}
          </div>
        </div>
      )}
      {heads.length === 1 && <div style={{ fontSize: 12.5, marginBottom: 12 }}>Now: <strong>{heads[0].name || heads[0].login}</strong>{heads[0].name ? ` · ${heads[0].login}` : ''}</div>}
      <div className="form-group" style={{ marginBottom: 12 }}><label>New head's name</label><input value={f.name} onChange={set('name')} maxLength={80} autoFocus /></div>
      <div className="form-group" style={{ marginBottom: 12 }}><label>Their email (their login)</label><input value={f.email} onChange={set('email')} type="email" {...noAuto} /></div>
      <div className="form-group" style={{ marginBottom: 12 }}><label>Their phone (optional)</label><input value={f.phone} onChange={set('phone')} type="tel" /></div>
      <div className="form-group" style={{ marginBottom: 6 }}><label>Starting password (8+ characters)</label><input value={f.password} onChange={set('password')} type="text" {...noAuto} /></div>
      {error && <div style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 10 }}>{error}</div>}
    </ModalShell>
  );
}

// An invoice to download and send (a school's finance office pays by bank transfer): for the next months not yet paid — a
// year on a yearly plan, a month on a monthly one — at their price. Your bank details are typed once and kept for every invoice.
function InvoiceModal({ m, onClose }) {
  const p = prices(m);
  const today = todayLocal();
  const start = addMonths(billingStart(m.freeUntil), m.monthsPaid || 0);
  const yearly = m.billingPlan === 'yearly';
  const end = dayBefore(addMonths(start, yearly ? 12 : 1));
  const forWhat = m.kind === 'school'
    ? `${APP_NAME} for Islamic Studies - ${m.schoolForms || 1} form${(m.schoolForms || 1) === 1 ? '' : 's'} of entry, ${formatDateGB(start)} to ${formatDateGB(end)}`
    : `${APP_NAME} - ${yearly ? 'a year' : 'a month'}, ${formatDateGB(start)} to ${formatDateGB(end)}`;
  const [inv, setInv] = useState({ item: forWhat, amount: String(yearly ? p.yearly : p.monthly), date: today, due: start > today ? start : addDays(today, 30) });
  const [from, setFrom] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { getInvoiceDetails().then(setFrom).catch(() => setFrom({})); }, []);
  const number = `${m.code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)}-${start.slice(0, 7).replace('-', '')}`;
  const ok = from && from.payee && from.sortCode && from.account && Number(inv.amount) > 0 && inv.item.trim();
  async function download() {
    setBusy(true); setError('');
    try {
      await saveInvoiceDetails(from);
      const [{ buildInvoicePdf }, { downloadPdfBytes }] = await Promise.all([import('../lib/invoicePdf'), import('../lib/reportPdf')]);
      const bytes = await buildInvoicePdf({
        number, date: inv.date, due: inv.due, item: inv.item.trim(), amount: Number(inv.amount), reference: number,
        to: { name: m.name, contact: m.contactName ? `For the attention of ${m.contactName}` : '', email: m.contactEmail || '' }, from,
      });
      downloadPdfBytes(bytes, `Invoice ${number} - ${m.name}.pdf`);
    } catch (err) { setError(err.message || 'Could not make the invoice'); }
    setBusy(false);
  }
  const setF = (k, v) => { setFrom(prev => ({ ...prev, [k]: v })); setError(''); };
  const setI = (k, v) => { setInv(prev => ({ ...prev, [k]: v })); setError(''); };
  return (
    <ModalShell title={`Invoice — ${m.name}`} sub={`No. ${number}`} width={480} onClose={onClose} busy={busy} footer={<>
      <button className="btn" onClick={onClose} disabled={busy}>Close</button>
      <button className="btn btn-primary" disabled={busy || !ok} onClick={download}><Download size={13} />{busy ? 'Making…' : 'Download PDF'}</button>
    </>}>
      <div className="form-group" style={{ marginBottom: 10 }}>
        <label>For</label>
        <input value={inv.item} onChange={e => setI('item', e.target.value)} maxLength={200} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 6 }}>
        <div className="form-group" style={{ marginBottom: 0 }}><label>Amount (£)</label>
          <input type="number" min="0" step="0.01" value={inv.amount} onChange={e => setI('amount', e.target.value)} /></div>
        <div className="form-group" style={{ marginBottom: 0 }}><label>Dated</label>
          <input type="date" value={inv.date} onChange={e => setI('date', e.target.value)} /></div>
        <div className="form-group" style={{ marginBottom: 0 }}><label>Pay by</label>
          <input type="date" value={inv.due} onChange={e => setI('due', e.target.value)} /></div>
      </div>
      <div className="form-section-title pay-h">Your details (kept for every invoice)</div>
      {!from ? <div className="text-muted text-sm">Loading…</div> : <>
        <div className="form-group" style={{ marginBottom: 10 }}><label>Pay to (account name)</label>
          <input value={from.payee || ''} onChange={e => setF('payee', e.target.value)} placeholder="The name on your bank account" /></div>
        <div className="form-group" style={{ marginBottom: 10 }}><label>Your address (optional)</label>
          <input value={from.address || ''} onChange={e => setF('address', e.target.value)} placeholder="Street, town, postcode" /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 10 }}>
          <div className="form-group" style={{ marginBottom: 0 }}><label>Bank</label>
            <input value={from.bank || ''} onChange={e => setF('bank', e.target.value)} /></div>
          <div className="form-group" style={{ marginBottom: 0 }}><label>Sort code</label>
            <input value={from.sortCode || ''} onChange={e => setF('sortCode', e.target.value)} placeholder="00-00-00" inputMode="numeric" /></div>
          <div className="form-group" style={{ marginBottom: 0 }}><label>Account no.</label>
            <input value={from.account || ''} onChange={e => setF('account', e.target.value)} inputMode="numeric" /></div>
        </div>
      </>}
      <div style={{ fontSize: 11.5, color: 'var(--text-soft)', marginTop: 10 }}>They pay by bank transfer with the reference {number}. When it arrives, record it with "They've just paid…".</div>
      {error && <div style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 10 }}>{error}</div>}
    </ModalShell>
  );
}
const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

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
        reports, Qur'aan records, logins and settings. <strong>It can't be undone.</strong>
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
