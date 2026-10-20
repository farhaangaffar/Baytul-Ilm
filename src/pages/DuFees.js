// A Darul Uloom's Fees page (server/routes/du-fees.js; a maktab keeps Fees.js). The year's figures on top, then Class ▾
// and a line per child — what's paid of their year's fee, and what's next or overdue — tap one for their instalments as
// boxes, extras, payments and receipts, "Record a payment", their own fee or way to pay. Head only (the office).
import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import { LoadingState, ErrorState } from '../components/DataState';
import BoxRow from '../components/BoxRow';
import ClassBar from '../components/ClassBar';
import { ChoiceBoxes } from '../components/StudentDetails';
import DuFeeSetupModal from '../components/DuFeeSetup';
import {
  getDuFees, getClassNames, saveDuFeeAccount, addDuFeeCharge, deleteDuFeeCharge, recordDuFeePayment, deleteDuFeePayment, importDuFees,
} from '../lib/store';
import { money, currencySymbol, getBranding } from '../lib/branding';
import { xlsxToText } from '../lib/xlsx';
import { ChevronRight, Plus, X, Save, Trash2, Pencil, Upload, Settings as Cog, Printer, Copy, MessageCircle } from 'lucide-react';

const nameOf = s => `${s.forename} ${s.surname}`;
const shortDate = d => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const longDate = d => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const niceYear = y => `20${y.slice(0, 2)}–${y.slice(3)}`;
const TONE = { paid: 'green', part: 'amber', due: 'amber', overdue: 'red' };
const STATUS = { paid: 'Paid', part: 'Part paid', due: 'Due today', overdue: 'Overdue', upcoming: 'Not due yet' };

function useBusy() {
  const [busy, setBusy] = useState(false);
  const wrap = fn => async (...a) => { setBusy(true); try { await fn(...a); } finally { setBusy(false); } };
  return [busy, wrap];
}

function Shell({ title, onClose, children, footer, width = 480 }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: width }}>
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button className="btn btn-icon" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

export default function DuFees() {
  const [data, setData] = useState(null);
  const [classes, setClasses] = useState([]);
  const [error, setError] = useState(null);
  const [year, setYear] = useState('');
  const [active, setActive] = useState('');
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');

  const load = useCallback(async y => {
    setError(null);
    try {
      const [d, names] = await Promise.all([getDuFees(y), getClassNames()]);
      setData(d); setYear(d.year); setClasses(names);
      setActive(a => (a && names.includes(a) ? a : names[0] || ''));
    } catch (err) { setError(err); }
  }, []);
  useEffect(() => { load(); }, [load]);
  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 2800); }
  async function run(fn, msg) {
    try { const r = await fn(); await load(year); if (msg) showToast(msg); return r || true; }
    catch (err) { showToast(err.message || 'Something went wrong'); return false; }
  }

  if (error) return <Layout title="Fees"><ErrorState error={error} onRetry={() => load(year)} /></Layout>;
  if (!data) return <Layout title="Fees"><LoadingState /></Layout>;

  const { students, setup, years } = data;
  const sum = k => students.reduce((t, s) => t + s[k], 0);
  const overdue = sum('overdue');
  const inClass = students.filter(s => s.class === active);
  const noClass = students.filter(s => !classes.includes(s.class));
  const shown = active ? inClass : students;
  const opened = modal?.kind === 'child' && students.find(s => s.id === modal.id);
  const notSet = !setup.saved && !setup.boarderFee && !setup.dayFee;

  return (
    <Layout title="Fees" subtitle={niceYear(year)}>
      <div className="boarding-page">
        {notSet ? (
          <div className="card" style={{ textAlign: 'center', padding: 24 }}>
            <div className="card-title" style={{ marginBottom: 6 }}>Set this year's fees</div>
            <div className="text-muted" style={{ fontSize: 13, marginBottom: 14 }}>The yearly fee for boarders and day students, and the ways parents can pay it.</div>
            <button className="btn btn-primary" onClick={() => setModal({ kind: 'setup' })}><Cog size={14} />Set the fees</button>
          </div>
        ) : (
          <BoxRow cells={[
            { text: money(sum('expected'), 0), sub: 'This year', className: 'ct-figure' },
            { text: money(sum('paid'), 0), sub: 'Paid', tone: 'green' },
            { text: money(sum('owed'), 0), sub: 'Still to pay', className: 'ct-figure' },
            overdue > 0 ? { text: money(overdue, 0), sub: 'Overdue', tone: 'red' } : { text: money(0, 0), sub: 'Overdue', className: 'ct-figure' },
          ]} />
        )}

        <div className="df-actions">
          <button type="button" className="line-row" onClick={() => setModal({ kind: 'setup' })}><Cog size={14} /><span className="line-row-name">Prices & ways to pay</span><ChevronRight size={15} /></button>
          <button type="button" className="line-row" onClick={() => setModal({ kind: 'charge', ids: null })}><Plus size={14} /><span className="line-row-name">Add a charge</span><ChevronRight size={15} /></button>
          <button type="button" className="line-row" onClick={() => setModal({ kind: 'import' })}><Upload size={14} /><span className="line-row-name">Import from a spreadsheet</span><ChevronRight size={15} /></button>
        </div>

        <ClassBar classes={classes} active={active} onPick={setActive} years={years.length > 1 ? years : undefined} year={year} onYear={y => load(y)} />

        <div className="card" style={{ marginTop: 10 }}>
          <div className="course-lines bd-two-lines">
            {shown.map(s => <ChildLine key={s.id} s={s} onOpen={() => setModal({ kind: 'child', id: s.id })} />)}
            {!shown.length && <div className="text-muted" style={{ fontSize: 13 }}>No children in {active || 'this class'}.</div>}
          </div>
        </div>
        {noClass.length > 0 && (
          <div className="card" style={{ marginTop: 12 }}>
            <div className="card-title" style={{ marginBottom: 10 }}>Not in a class</div>
            <div className="course-lines bd-two-lines">{noClass.map(s => <ChildLine key={s.id} s={s} onOpen={() => setModal({ kind: 'child', id: s.id })} />)}</div>
          </div>
        )}
      </div>

      {modal?.kind === 'setup' && (
        <DuFeeSetupModal setup={setup} onClose={() => setModal(null)} onSaved={async () => { await load(year); setModal(null); showToast('Fees saved'); }} />
      )}
      {opened && (
        <ChildSheet s={opened} setup={setup} onClose={() => setModal(null)}
          onPay={() => setModal({ kind: 'pay', id: opened.id })}
          onEdit={() => setModal({ kind: 'account', id: opened.id })}
          onCharge={() => setModal({ kind: 'charge', ids: [opened.id], back: opened.id })}
          onReceipt={p => setModal({ kind: 'receipt', id: opened.id, paymentId: p.id })}
          onDeleteCharge={c => run(() => deleteDuFeeCharge(c.id), 'Charge removed')} />
      )}
      {modal?.kind === 'pay' && (
        <PayModal s={students.find(x => x.id === modal.id)} methods={data.methods} today={data.today} onClose={() => setModal({ kind: 'child', id: modal.id })}
          onSave={async f => {
            const r = await run(() => recordDuFeePayment(year, modal.id, f), 'Payment recorded');
            if (r) setModal({ kind: 'receipt', id: modal.id, paymentId: r.id });
          }} />
      )}
      {modal?.kind === 'receipt' && (() => {
        const s = students.find(x => x.id === modal.id);
        const p = s?.payments.find(x => x.id === modal.paymentId);
        return p ? <ReceiptModal s={s} p={p} onClose={() => setModal({ kind: 'child', id: s.id })}
          onDelete={async () => { if (await run(() => deleteDuFeePayment(p.id), 'Payment removed')) setModal({ kind: 'child', id: s.id }); }} /> : null;
      })()}
      {modal?.kind === 'account' && (
        <AccountModal s={students.find(x => x.id === modal.id)} setup={setup} onClose={() => setModal({ kind: 'child', id: modal.id })}
          onSave={async f => { if (await run(() => saveDuFeeAccount(year, modal.id, f), 'Saved')) setModal({ kind: 'child', id: modal.id }); }} />
      )}
      {modal?.kind === 'charge' && (
        <ChargeModal ids={modal.ids} students={students} classes={classes} today={data.today}
          onClose={() => setModal(modal.back ? { kind: 'child', id: modal.back } : null)}
          onSave={async (ids, f) => { if (await run(() => addDuFeeCharge(year, ids, f), ids.length === 1 ? 'Charge added' : `Charge added for ${ids.length}`)) setModal(modal.back ? { kind: 'child', id: modal.back } : null); }} />
      )}
      {modal?.kind === 'import' && (
        <ImportModal year={year} onClose={() => setModal(null)} onDone={async () => { await load(year); }} />
      )}
      {toast && <div className="toast">✓ {toast}</div>}
    </Layout>
  );
}

// A child's line: name, then what's paid of the year and what's next — amber when something is due, red when overdue.
function ChildLine({ s, onOpen }) {
  const sub = s.overdue > 0 ? <b className="mt-urgent">{money(s.overdue)} overdue · </b> : null;
  const next = s.owed <= 0 ? 'All paid' : s.nextDue ? `next ${money(s.nextDue.amount)} on ${shortDate(s.nextDue.due)}` : '';
  return (
    <button type="button" className="line-row" onClick={onOpen}>
      <span className="ct-two">
        <span className="line-row-name">{nameOf(s)}{s.status === 'Inactive' && <span className="text-muted" style={{ fontWeight: 500 }}> · left</span>}</span>
        <span className="line-row-sub">{sub}{money(s.paid, 0)} of {money(s.expected, 0)} paid{next && ` · ${next}`}</span>
      </span>
      <ChevronRight size={16} />
    </button>
  );
}

// A child's fees: Year fee · Paid · Still to pay boxes, how it's worked out, the instalments and extras as boxes
// (green paid, amber part paid, red overdue), the payments (tap one for its receipt), and what can be done.
function ChildSheet({ s, setup, onClose, onPay, onEdit, onCharge, onReceipt, onDeleteCharge }) {
  const how = [
    s.ownAmount != null ? 'Own amount' : s.boarding === 'Boarder' ? 'Boarder' : 'Day student',
    s.discountPct ? `${s.discountPct}% sibling discount` : '',
    s.planName,
  ].filter(Boolean).join(' · ');
  return (
    <Shell title={nameOf(s)} onClose={onClose} width={520}
      footer={<>
        <button className="btn" style={{ marginRight: 'auto' }} onClick={onEdit}><Pencil size={13} />Change fee</button>
        <button className="btn btn-primary" onClick={onPay}><Plus size={13} />Record a payment</button>
      </>}>
      <BoxRow columns="repeat(3, minmax(0, 1fr))" cells={[
        { text: money(s.expected), sub: 'This year', className: 'ct-figure' },
        { text: money(s.paid), sub: 'Paid', tone: s.paid > 0 ? 'green' : undefined, className: s.paid > 0 ? undefined : 'ct-figure' },
        s.overdue > 0 ? { text: money(s.owed), sub: `${money(s.overdue)} overdue`, tone: 'red' } : { text: money(s.owed), sub: s.owed > 0 ? 'Still to pay' : 'All paid', className: 'ct-figure' },
      ]} />
      <div className="text-muted" style={{ fontSize: 12.5, margin: '2px 2px 10px' }}>{s.class}{how && ` · ${how}`}{s.family ? ` · child ${s.family.n} of ${s.family.of} in the family` : ''}</div>

      <div className="att-week-title">Instalments{s.items.some(i => i.kind === 'extra') ? ' & extras' : ''}</div>
      <BoxRow columns="repeat(3, minmax(0, 1fr))" cells={s.items.map(it => ({
        text: money(it.amount), wrap: 'words',
        sub: `${it.kind === 'extra' ? it.label : shortDate(it.due)} · ${it.status === 'part' || (it.paid > 0 && it.status !== 'paid') ? `${money(it.paid, 0)} paid` : STATUS[it.status]}`,
        ...(TONE[it.status] ? { tone: TONE[it.status] } : { className: 'ct-figure' }),
      }))} />
      {!s.items.length && <div className="text-muted" style={{ fontSize: 13 }}>Nothing to pay this year.</div>}
      {s.items.filter(i => i.kind === 'extra').map(c => (
        <div key={c.id} className="line-row" style={{ cursor: 'default', marginTop: 6 }}>
          <span className="ct-two"><span className="line-row-name">{c.label} · {money(c.amount)}</span><span className="line-row-sub">Due {shortDate(c.due)}{c.addedBy ? ` · added by ${c.addedBy}` : ''}</span></span>
          {c.paid === 0 && <button type="button" className="btn btn-icon btn-sm" aria-label={`Remove ${c.label}`} onClick={() => onDeleteCharge(c)}><Trash2 size={14} /></button>}
        </div>
      ))}
      <button type="button" className="line-row add" style={{ marginTop: 6 }} onClick={onCharge}><Plus size={13} /> Add a charge (books, a trip…)</button>

      <div className="att-week-title" style={{ marginTop: 6 }}>Payments</div>
      <div className="course-lines">
        {s.paidBefore > 0 && <div className="line-row" style={{ cursor: 'default' }}><span className="ct-two"><span className="line-row-name">{money(s.paidBefore)}</span><span className="line-row-sub">Paid before (imported)</span></span></div>}
        {[...s.payments].reverse().map(p => (
          <button key={p.id} type="button" className="line-row" onClick={() => onReceipt(p)}>
            <span className="ct-two"><span className="line-row-name">{money(p.amount)}</span><span className="line-row-sub">{shortDate(p.paidOn)} · {p.method} · Receipt {p.receiptNo}</span></span>
            <ChevronRight size={15} />
          </button>
        ))}
        {!s.payments.length && !s.paidBefore && <div className="text-muted" style={{ fontSize: 13 }}>No payments yet.</div>}
      </div>
    </Shell>
  );
}

// Record a payment: any amount (the next instalment suggested), how they paid, when — then its receipt.
function PayModal({ s, methods, today, onClose, onSave }) {
  const suggest = s.overdue > 0 ? s.overdue : s.nextDue ? s.nextDue.amount : s.owed;
  const [f, setF] = useState({ amount: suggest > 0 ? String(suggest) : '', method: 'Cash', paidOn: today, note: '' });
  const [busy, wrap] = useBusy();
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const sym = currencySymbol();
  return (
    <Shell title={`Payment from ${nameOf(s)}`} onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={busy || !(Number(f.amount) > 0)} onClick={wrap(() => onSave({ ...f, amount: Number(f.amount) }))}><Save size={13} />Save & make receipt</button>
      </>}>
      <div className="form-grid">
        <div className="form-group"><label>Amount ({sym})</label>
          <input type="number" min={0} step="0.01" value={f.amount} onChange={e => set('amount', e.target.value)} autoFocus /></div>
        {s.owed > 0 && (
          <div className="choice-boxes" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', marginTop: -4 }}>
            {[s.nextDue && ['Next', s.nextDue.amount], s.overdue > 0 && ['Overdue', s.overdue], ['Everything', s.owed]].filter(Boolean).map(([l, v]) => (
              <button key={l} type="button" className={Number(f.amount) === v ? 'on' : ''} onClick={() => set('amount', String(v))}>{l} · {money(v)}</button>
            ))}
          </div>
        )}
        <div className="form-group"><label>How they paid</label><ChoiceBoxes options={methods.slice(0, 3)} value={f.method} onChange={v => set('method', v)} /></div>
        <div className="form-grid form-grid-2">
          <div className="form-group"><label>Date</label><input type="date" value={f.paidOn} max={today} onChange={e => set('paidOn', e.target.value)} /></div>
          <div className="form-group"><label>Note (optional)</label><input value={f.note} onChange={e => set('note', e.target.value)} maxLength={300} placeholder="e.g. Paid by uncle" /></div>
        </div>
      </div>
    </Shell>
  );
}

// A receipt: shown as it will be sent, with WhatsApp (to the first contact), Print and Copy. The head can remove a
// payment recorded by mistake.
function ReceiptModal({ s, p, onClose, onDelete }) {
  const [sure, setSure] = useState(false);
  const [busy, wrap] = useBusy();
  const school = getBranding().schoolName || 'The madrasah';
  const lines = [
    `${school} — Receipt No. ${p.receiptNo}`,
    `Received ${money(p.amount)} for ${nameOf(s)} (${s.class}) on ${longDate(p.paidOn)}, by ${p.method.toLowerCase()}.`,
    p.note ? `Note: ${p.note}` : '',
    `Paid this year: ${money(s.paid)} of ${money(s.expected)}.${s.owed > 0 ? ` Still to pay: ${money(s.owed)}.` : ' All paid — thank you.'}`,
    `Recorded by ${p.recordedBy}.`,
  ].filter(Boolean);
  const text = lines.join('\n');
  const digits = String(s.phone || '').replace(/\D/g, '');
  const wa = /^07\d{9}$/.test(digits) ? `44${digits.slice(1)}` : /^447\d{9}$/.test(digits) ? digits : '';
  const print = () => {
    const w = window.open('', '_blank', 'width=480,height=600');
    if (!w) return;
    const esc = t => t.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    w.document.write(`<html><head><title>Receipt ${p.receiptNo}</title><style>body{font-family:sans-serif;padding:32px;line-height:1.6}h1{font-size:18px}</style></head><body><h1>${esc(lines[0])}</h1>${lines.slice(1).map(l => `<p>${esc(l)}</p>`).join('')}</body></html>`);
    w.document.close(); w.focus(); w.print();
  };
  return (
    <Shell title={`Receipt ${p.receiptNo}`} onClose={onClose}
      footer={<>
        {sure
          ? <button className="btn" style={{ marginRight: 'auto', background: 'var(--red)', color: '#fff' }} disabled={busy} onClick={wrap(onDelete)}>Remove this payment</button>
          : <button className="btn" style={{ marginRight: 'auto', color: 'var(--red-text)' }} onClick={() => setSure(true)}><Trash2 size={13} />Recorded by mistake</button>}
        <button className="btn btn-primary" onClick={onClose}>Done</button>
      </>}>
      <div className="mt-note" style={{ fontSize: 13.5 }}>{text}</div>
      <div className="choice-boxes" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', marginTop: 10 }}>
        <a className="df-share" href={`https://wa.me/${wa}?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer"><MessageCircle size={14} />WhatsApp</a>
        <button type="button" className="df-share" onClick={print}><Printer size={14} />Print</button>
        <button type="button" className="df-share" onClick={() => navigator.clipboard?.writeText(text)}><Copy size={14} />Copy</button>
      </div>
      {!wa && <div className="text-muted" style={{ fontSize: 12, marginTop: 6 }}>No mobile number for the first contact — WhatsApp will ask who to send it to.</div>}
    </Shell>
  );
}

// A child's own fee for the year (a bursary — blank uses the price), their way to pay, and no sibling discount.
function AccountModal({ s, setup, onClose, onSave }) {
  const [f, setF] = useState({ ownAmount: s.ownAmount != null ? String(s.ownAmount) : '', planId: s.planId, noDiscount: s.noDiscount });
  const [busy, wrap] = useBusy();
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const base = s.boarding === 'Boarder' ? setup.boarderFee : setup.dayFee;
  return (
    <Shell title={`${nameOf(s)}'s fee`} onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={busy} onClick={wrap(() => onSave({ ...f, ownAmount: f.ownAmount === '' ? null : Number(f.ownAmount) }))}><Save size={13} />Save</button>
      </>}>
      <div className="form-grid">
        <div className="form-group"><label>Yearly fee ({currencySymbol()})</label>
          <input type="number" min={0} step="0.01" value={f.ownAmount} onChange={e => set('ownAmount', e.target.value)} placeholder={`${base} — the ${s.boarding === 'Boarder' ? 'boarder' : 'day student'} price`} />
          <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>Leave blank for the usual price. Write an amount for a bursary or an agreed fee.</div></div>
        <div className="form-group"><label>Way to pay</label>
          <ChoiceBoxes options={setup.plans.map(p => p.name)} value={setup.plans.find(p => p.id === f.planId)?.name} onChange={v => set('planId', setup.plans.find(p => p.name === v)?.id || '')} /></div>
        {setup.siblingOn && f.ownAmount === '' && (
          <div className="form-group"><label>Sibling discount</label>
            <ChoiceBoxes options={['Yes', 'No']} value={f.noDiscount ? 'No' : 'Yes'} onChange={v => set('noDiscount', v === 'No')} /></div>
        )}
      </div>
    </Shell>
  );
}

// An extra charge (books, a trip, an exam fee) for one child, a class or everyone.
function ChargeModal({ ids, students, classes, today, onClose, onSave }) {
  const [f, setF] = useState({ label: '', amount: '', due: today });
  const [who, setWho] = useState(ids ? 'one' : 'class');
  const [cls, setCls] = useState(classes[0] || '');
  const [busy, wrap] = useBusy();
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const active = students.filter(s => s.status === 'Active');
  const target = who === 'one' ? ids : who === 'class' ? active.filter(s => s.class === cls).map(s => s.id) : active.map(s => s.id);
  return (
    <Shell title="Add a charge" onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={busy || !f.label.trim() || !(Number(f.amount) > 0) || !target?.length} onClick={wrap(() => onSave(target, { ...f, amount: Number(f.amount) }))}>
          <Save size={13} />Add{target?.length > 1 ? ` for ${target.length}` : ''}</button>
      </>}>
      <div className="form-grid">
        <div className="form-group"><label>What for?</label><input value={f.label} onChange={e => set('label', e.target.value)} maxLength={80} placeholder="e.g. Books, Trip, Exam fee" autoFocus /></div>
        <div className="form-grid form-grid-2">
          <div className="form-group"><label>Amount ({currencySymbol()})</label><input type="number" min={0} step="0.01" value={f.amount} onChange={e => set('amount', e.target.value)} /></div>
          <div className="form-group"><label>Due</label><input type="date" value={f.due} onChange={e => set('due', e.target.value)} /></div>
        </div>
        {!ids && (
          <div className="form-group"><label>For</label>
            <ChoiceBoxes options={['A class', 'Everyone']} value={who === 'class' ? 'A class' : 'Everyone'} onChange={v => setWho(v === 'A class' ? 'class' : 'all')} />
            {who === 'class' && <select style={{ marginTop: 8 }} value={cls} onChange={e => setCls(e.target.value)}>{classes.map(c => <option key={c}>{c}</option>)}</select>}
            <div className="text-muted" style={{ fontSize: 12, marginTop: 6 }}>{target.length} child{target.length === 1 ? '' : 'ren'}</div>
          </div>
        )}
      </div>
    </Shell>
  );
}

// Import: paste from a spreadsheet (or choose an .xlsx / .csv) — each child's name and what they've paid so far this
// year, and their yearly fee if it isn't the usual price. Matched by name.
// Reads only three columns, found by their headings — the child's name (or first name + surname), Paid, and Fee if
// there is one. Every other column is ignored, and nothing else about a child is ever changed. With no Name and Paid
// headings nothing is read (a sheet without them is probably not a fee sheet).
function splitSheet(text) {
  const lines = String(text || '').split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return { rows: [], used: [], ignored: 0 };
  const tab = lines[0].includes('\t');
  const cells = lines.map(l => (tab ? l.split('\t') : l.split(',')).map(c => c.trim().replace(/^"|"$/g, '')));
  const head = cells[0].map(h => h.toLowerCase().trim());
  const col = re => head.findIndex(h => re.test(h));
  const name = col(/^(full |child'?s |student'?s |pupil'?s )?name$|^(student|child|pupil)$/);
  const fore = col(/^(fore ?name|first ?name)$/), sur = col(/^(sur ?name|last ?name|family name)$/);
  const paid = col(/^(amount |total )?paid( so far)?( this year)?$/);
  const fee = col(/^(yearly |annual |year |total )?fee( for the year)?$/);
  if (paid < 0 || (name < 0 && (fore < 0 || sur < 0))) {
    return { rows: [], used: [], ignored: 0, error: 'Needs a heading row with Name (or First name and Surname) and Paid.' };
  }
  const usedCols = [name, fore, sur, paid, fee].filter(c => c >= 0);
  const amount = v => String(v || '').replace(/[£$€,\s]/g, '');
  const rows = cells.slice(1).map(r => ({
    name: name >= 0 ? (r[name] || '').trim() : `${r[fore] || ''} ${r[sur] || ''}`.trim(),
    paid: amount(r[paid]),
    fee: fee >= 0 ? amount(r[fee]) : '',
  })).filter(r => r.name && r.paid !== '');
  return { rows, used: usedCols.map(c => cells[0][c]), ignored: head.length - usedCols.length };
}

function ImportModal({ year, onClose, onDone }) {
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, wrap] = useBusy();
  const sheet = splitSheet(text);
  const rows = sheet.rows;
  async function file(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setText(/\.xlsx$/i.test(f.name) ? await xlsxToText(f) : await f.text());
  }
  return (
    <Shell title="Import fees" onClose={onClose} width={520}
      footer={result
        ? <button className="btn btn-primary" onClick={onClose}>Done</button>
        : <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !rows.length} onClick={wrap(async () => {
            setError('');
            try { setResult(await importDuFees(year, rows)); await onDone(); } catch (err) { setError(err.message || 'Could not import'); }
          })}><Upload size={13} />Import {rows.length || ''}</button>
        </>}>
      {result ? (
        <>
          <BoxRow columns="repeat(2, minmax(0, 1fr))" cells={[
            { text: result.matched, sub: 'Brought in', tone: 'green' },
            result.unmatched.length ? { text: result.unmatched.length, sub: 'Not matched', tone: 'amber' } : { text: 0, sub: 'Not matched', className: 'ct-figure' },
          ]} />
          {result.unmatched.map((u, i) => <div key={i} className="line-row" style={{ cursor: 'default', marginTop: 6 }}><span className="ct-two"><span className="line-row-name">{u.name}</span><span className="line-row-sub">{u.why}</span></span></div>)}
        </>
      ) : (
        <>
          <div className="text-muted" style={{ fontSize: 13, marginBottom: 10 }}>
            A sheet with the headings <b>Name</b> and <b>Paid</b> (paid so far this year) — and <b>Fee</b> if a child's yearly fee isn't the usual price. Only those columns are read; nothing else about a child is changed.
          </div>
          <textarea rows={6} value={text} onChange={e => setText(e.target.value)} placeholder={'Name\tPaid\tFee\nYusuf Patel\t600\nAhmad Shah\t1200\t2000'} style={{ width: '100%', fontFamily: 'var(--font)', fontSize: 13 }} />
          <label className="btn btn-sm" style={{ marginTop: 8 }}><Upload size={13} />Choose a file<input type="file" accept=".xlsx,.csv,.txt" onChange={file} hidden /></label>
          {sheet.error && text.trim() && <div style={{ color: 'var(--red)', fontSize: 13, marginTop: 8 }}>{sheet.error}</div>}
          {rows.length > 0 && (
            <div className="text-muted" style={{ fontSize: 12.5, marginTop: 8 }}>
              Reading only: <b>{sheet.used.join(', ')}</b>{sheet.ignored > 0 && ` — ${sheet.ignored} other column${sheet.ignored === 1 ? '' : 's'} ignored`}.<br />
              {rows.length} child{rows.length === 1 ? '' : 'ren'} — e.g. {rows[0].name}: paid {money(Number(rows[0].paid) || 0)}{rows[0].fee ? `, fee ${money(Number(rows[0].fee))}` : ''}
            </div>
          )}
          {error && <div style={{ color: 'var(--red)', fontSize: 13, marginTop: 8 }}>{error}</div>}
        </>
      )}
    </Shell>
  );
}
