import React, { useState } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import { money } from '../lib/branding';

// A child's fees as a list — the same look as a child's attendance month: a coloured
// stripe (green paid, red owed, grey not charged), the week/month/term, what's happened,
// and one button. Used by weekly fees (a card per school month) and monthly/termly fees.
//
// rows: [{ key, label, now, future, fee, offNote, canAdd }]
//   fee     — the fee record, or null when not charged
//   future  — after this week/month: unpaid isn't owed yet
//   offNote — why there's no fee ("Week off", "Not charged")
// Later rows that aren't charged fold into one line ("9 more months") until opened.
export function FeeRowList({ title, rows, isOwner, editCell, setEditCell, saveEdit, onToggle, onAdd, onRemove, nowLabel = 'Now', laterLabel, cardProps }) {
  const [showLater, setShowLater] = useState(false);
  let lastUsed = rows.length - 1;
  while (lastUsed >= 0 && rows[lastUsed].future && !rows[lastUsed].fee) lastUsed--;
  const later = laterLabel && !showLater ? rows.slice(lastUsed + 1) : [];
  const shown = later.length > 1 ? rows.slice(0, lastUsed + 1) : rows;
  return (
    <div className="card att-week" {...cardProps}>
      {title && <div className="att-week-title">{title}</div>}
      {shown.map(r => {
        const f = r.fee;
        if (!f) {
          return (
            <div key={r.key} className="att-day fee-row none">
              <span className="att-stripe" />
              <div className="att-day-main">
                <div className="att-day-date">{r.label}</div>
                <div className="att-day-status">{r.offNote}{r.now && <span className="att-today">{nowLabel}</span>}</div>
              </div>
              {r.canAdd && <button className="fee-btn add" onClick={() => onAdd(r)}><Plus size={13} />Add</button>}
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
                {r.now && <span className="att-today">{nowLabel}</span>}
              </div>
            </div>
            {editing ? (
              <span className="fee-edit">
                <input type="number" min="0" step="0.50" value={editCell.val} autoFocus aria-label="Amount"
                  onChange={e => setEditCell({ ...editCell, val: e.target.value })}
                  onKeyDown={e => { if (e.key === 'Enter') saveEdit(f.id); if (e.key === 'Escape') setEditCell(null); }} />
                <button className="fee-icon ok" onClick={() => saveEdit(f.id)} aria-label="Save amount"><Check size={14} /></button>
              </span>
            ) : (
              <button className="fee-amt" disabled={!isOwner} title={isOwner ? 'Change the amount' : undefined}
                onClick={() => setEditCell({ feeId: f.id, val: String(f.amount) })}>{money(Number(f.amount))}</button>
            )}
            <button className={`fee-btn ${paid ? 'paid' : notDue ? 'due' : 'owed'}`} onClick={() => onToggle(f)} aria-pressed={paid}>
              {paid ? <><Check size={13} />Paid</> : 'Mark paid'}
            </button>
            {isOwner && onRemove && <button className="fee-icon" onClick={() => onRemove(r)} aria-label={`Remove ${r.label}`}><Trash2 size={13} /></button>}
          </div>
        );
      })}
      {later.length > 1 && (
        <div className="att-day fee-row none fee-later">
          <span className="att-stripe" />
          <div className="att-day-main">
            <div className="att-day-date">{later[0].short || later[0].label} – {later[later.length - 1].short || later[later.length - 1].label}</div>
            <div className="att-day-status">{later.length} more {laterLabel} · not charged yet</div>
          </div>
          <button className="fee-btn add" onClick={() => setShowLater(true)}>Show</button>
        </div>
      )}
    </div>
  );
}

export const shortDate = iso => new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

// The same rows as small tiles (a whole year at a glance) — tap a tile to mark it paid.
export function FeeTiles({ rows, onToggle, onAdd, nowLabel = 'Now' }) {
  return (
    <div className="fee-tiles">
      {rows.map(r => {
        const f = r.fee;
        const state = !f ? 'none' : f.status === 'Paid' ? 'paid' : r.future ? 'due' : 'owed';
        return (
          <button key={r.key} className={`fee-tile ${state} ${r.now ? 'now' : ''}`} disabled={!f && !r.canAdd}
            onClick={() => (f ? onToggle(f) : onAdd(r))}>
            <span className="fee-tile-label">{r.short || r.label}</span>
            <span className="fee-tile-amt">{f ? money(Number(f.amount)) : '—'}</span>
            <span className="fee-tile-status">{state === 'paid' ? <><Check size={11} />Paid</> : state === 'owed' ? 'Owed' : state === 'due' ? 'Not due' : r.canAdd ? '+ Add' : r.offNote}</span>
            {r.now && <span className="fee-tile-now">{nowLabel}</span>}
          </button>
        );
      })}
    </div>
  );
}
