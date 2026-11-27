import React, { useState } from 'react';
import { Check, Plus, Trash2, Pencil, RotateCcw, CheckCheck } from 'lucide-react';
import { money } from '../lib/branding';
import { askConfirm, showAlert } from '../lib/dialog';

// A child's fees as a list of boxes — the same look as a child's attendance month: each
// week/month/term in its own box, tinted and striped green (paid) or red (owed); ones that
// haven't started yet are "Not due yet" and never count as owed. Used by weekly fees (a card
// per school month) and monthly/termly fees (one card for the year).
//
// rows: [{ key, label, now, future, fee, planned, removed, offNote, canAdd, notDueYet }]
//   fee        — the fee record (stored), or null
//   planned    — { amount }: will be charged when it comes (shown, not stored yet) — "show, don't store"
//   removed    — taken off this child on purpose (head can put it back)
//   offNote    — why there's nothing ("Week off", "Not charged")
//   notDueYet  — a stored record whose own period hasn't started yet (added ahead of time)
export function FeeRowList({ title, rows, isOwner, editCell, setEditCell, saveEdit, onToggle, onPayAhead, onAdd, onRemove, onPutBack, nowLabel = 'Now', cardProps }) {
  const tag = r => r.now && <span className="att-today">{nowLabel}</span>;
  return (
    <div className="card att-week fee-boxed" {...cardProps}>
      {title && <div className="att-week-title">{title}</div>}
      {rows.map(r => {
        const f = r.fee;
        if (!f && r.planned && !r.removed) {
          return (
            <div key={r.key} className="att-day fee-row due">
              <span className="att-stripe" />
              <div className="att-day-main">
                <div className="att-day-date">{r.label}</div>
                <div className="att-day-status">Not due yet{tag(r)}</div>
              </div>
              <span className="fee-amt plain">{money(Number(r.planned.amount))}</span>
              {onPayAhead ? <button className="fee-btn due" onClick={() => onPayAhead(r)}>Mark paid</button> : <span className="fee-btn-space" />}
              {isOwner && onRemove && <button className="fee-icon" onClick={() => onRemove(r)} aria-label={`Remove ${r.label}`}><Trash2 size={13} /></button>}
            </div>
          );
        }
        if (!f) {
          return (
            <div key={r.key} className="att-day fee-row none">
              <span className="att-stripe" />
              <div className="att-day-main">
                <div className="att-day-date">{r.label}</div>
                <div className="att-day-status">{r.removed ? 'Removed' : r.offNote}{tag(r)}</div>
              </div>
              {isOwner && r.removed && onPutBack
                ? <button className="fee-btn add" onClick={() => onPutBack(r)}><RotateCcw size={12} />Put back</button>
                : r.canAdd && <button className="fee-btn add" onClick={() => onAdd(r)}><Plus size={13} />Add</button>}
            </div>
          );
        }
        const paid = f.status === 'Paid';
        const notDue = !paid && r.notDueYet;
        const editing = editCell?.feeId === f.id;
        return (
          <div key={r.key} className={`att-day fee-row ${paid ? 'paid' : notDue ? 'due' : 'owed'}`}>
            <span className="att-stripe" />
            <div className="att-day-main">
              <div className="att-day-date">{r.label}</div>
              <div className="att-day-status">
                {paid ? `Paid${f.paidDate ? ` ${shortDate(f.paidDate)}` : ''}` : notDue ? 'Not due yet' : 'Owed'}
                {tag(r)}
              </div>
            </div>
            {editing ? (
              <span className="fee-edit">
                <input type="number" min="0" step="0.50" value={editCell.val} autoFocus aria-label="Amount"
                  onChange={e => setEditCell({ ...editCell, val: e.target.value })}
                  onKeyDown={e => { if (e.key === 'Enter') saveEdit(f.id); if (e.key === 'Escape') setEditCell(null); }} />
                <button className="fee-icon ok" onClick={() => saveEdit(f.id)} aria-label="Save amount"><Check size={14} /></button>
              </span>
            ) : isOwner ? (
              <button className="fee-amt" title="Change the amount" onClick={() => setEditCell({ feeId: f.id, val: String(f.amount) })}>
                {money(Number(f.amount))}<Pencil size={11} />
              </button>
            ) : <span className="fee-amt plain">{money(Number(f.amount))}</span>}
            <button className={`fee-btn ${paid ? 'paid' : notDue ? 'due' : 'owed'}`} onClick={() => onToggle(f)} aria-pressed={paid}>
              {paid ? <><Check size={13} />Paid</> : 'Mark paid'}
            </button>
            {isOwner && onRemove && <button className="fee-icon" onClick={() => onRemove(r)} aria-label={`Remove ${r.label}`}><Trash2 size={13} /></button>}
          </div>
        );
      })}
    </div>
  );
}

export const shortDate = iso => new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

// Paid / Owed / Collected for a child — owed counts only periods that have started.
export function FeeTotals({ paid, owed, label }) {
  const billed = paid + owed;
  return (
    <div className="summary-row-v2" style={{ marginBottom: 14 }}>
      <div className="summary-box-v2" style={{ background: 'var(--green-light)' }}><div className="n">{money(paid)}</div><div className="l">Paid</div></div>
      <div className="summary-box-v2" style={{ background: 'var(--red-light)' }}><div className="n">{money(owed)}</div><div className="l">Owed</div></div>
      <div className="summary-box-v2" style={{ background: 'var(--surface)', boxShadow: 'inset 0 0 0 1px #dfe3e8' }}><div className="n">{billed ? Math.round(paid / billed * 100) : 0}%</div><div className="l">Collected {label}</div></div>
    </div>
  );
}

// "Mark the whole year as paid" (a maktab's ask): one button at the end of a child's fees — every week/month/term of the
// year shown not paid yet (owed, not due yet, or still to come) is marked paid, one at a time through the same calls as
// tapping each (so the same rules apply: a teacher can only pay what they could pay one by one). Asks first.
//   rows: the year's rows (as FeeRowList's); onPayFee(fee) / onPayPlanned(row) record one; onDone() reloads.
export function PayYearButton({ rows, who, unit, onPayFee, onPayPlanned, onDone }) {
  const [busy, setBusy] = useState('');
  const todo = rows.filter(r => (r.fee && r.fee.status !== 'Paid') || (!r.fee && r.planned && !r.removed));
  if (!todo.length) return null;
  const total = todo.reduce((t, r) => t + Number(r.fee ? r.fee.amount : r.planned.amount), 0);
  const n = todo.length;
  const units = `${n} ${unit}${n === 1 ? '' : 's'}`;
  async function run() {
    if (!(await askConfirm(`Mark ${units} as paid for ${who}? That's ${money(total)} — everything for this year that isn't paid yet.`, { title: 'Mark the whole year as paid?', ok: 'Mark all paid' }))) return;
    let done = 0;
    try {
      for (const r of todo) {
        setBusy(`Saving ${done + 1} of ${n}…`);
        if (r.fee) await onPayFee(r.fee); else await onPayPlanned(r);
        done += 1;
      }
    } catch (err) {
      await showAlert(`${done} of ${n} were marked paid, then this stopped: ${err.message || 'something went wrong'}.`);
    }
    setBusy('');
    await onDone();
  }
  return (
    <div className="fee-more">
      <button className="btn btn-green" disabled={!!busy} onClick={run} style={{ width: '100%', maxWidth: 420, justifyContent: 'center' }}>
        <CheckCheck size={15} /> {busy || `Mark the whole year as paid · ${money(total)}`}
      </button>
      {!busy && <div className="text-muted" style={{ fontSize: 12, marginTop: 6, textAlign: 'center' }}>{units} not paid yet</div>}
    </div>
  );
}
