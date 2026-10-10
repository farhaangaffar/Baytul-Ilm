import React from 'react';
import { Check, Plus, Trash2, Pencil, RotateCcw } from 'lucide-react';
import { money } from '../lib/branding';

// A child's fees as a list of boxes — the same look as a child's attendance month: each
// week/month/term in its own box, tinted and striped green (paid) or red (owed); ones that
// haven't started yet are "Not due yet" and never count as owed. Used by weekly fees (a card
// per school month) and monthly/termly fees (one card for the year).
//
// rows: [{ key, label, now, future, fee, planned, removed, offNote, canAdd }]
//   fee      — the fee record (stored), or null
//   planned  — { amount }: will be charged when it comes (shown, not stored yet) — "show, don't store"
//   removed  — taken off this child on purpose (head can put it back)
//   offNote  — why there's nothing ("Week off", "Not charged")
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
        const notDue = !paid && r.future;
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
      <div className="summary-box-v2" style={{ background: '#f0f2f6' }}><div className="n">{billed ? Math.round(paid / billed * 100) : 0}%</div><div className="l">Collected {label}</div></div>
    </div>
  );
}
