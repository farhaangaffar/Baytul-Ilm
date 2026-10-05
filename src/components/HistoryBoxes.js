import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

// The box history used across the app (Daily records → Records, Previous summaries, a
// left child's Previous reports): academic years as boxes, oldest to newest left to
// right — tap one for its months (or terms) as smaller boxes; tap one of those to show it.
//   years: [{ key, label, sub }]; open: the open year's key; onToggle(key)
//   items: the open year's boxes [{ key, label, sub }]; active: the chosen item's key; onPick(key)

export const historyBox = on => ({
  position: 'relative', border: `1px solid ${on ? 'var(--ink)' : '#dfe3e8'}`, background: on ? 'var(--ink)' : '#f3f4f6',
  color: on ? '#fff' : 'var(--ink)', borderRadius: 8, padding: '7px 4px', minHeight: 46, cursor: 'pointer',
  fontFamily: 'var(--font)', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center',
  alignItems: 'center', minWidth: 0,
});
const sub = { fontSize: 10.5, fontWeight: 500, opacity: 0.8, marginTop: 1 };

// A year box: the arrow sits on the left, level with the year; the year and its count centred.
export function YearBox({ label, sub: subText, open, onClick }) {
  const Arrow = open ? ChevronUp : ChevronDown;
  return (
    <button type="button" aria-expanded={open} onClick={onClick} style={historyBox(open)}>
      <span style={{ position: 'relative', alignSelf: 'stretch', fontWeight: 700, fontSize: 13 }}>
        <Arrow size={14} style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)' }} />
        {label}
      </span>
      {subText && <span style={sub}>{subText}</span>}
    </button>
  );
}

export default function HistoryBoxes({ years, open, onToggle, items = [], active, onPick }) {
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 6 }}>
        {years.map(y => <YearBox key={y.key} label={y.label} sub={y.sub} open={open === y.key} onClick={() => onToggle(y.key)} />)}
      </div>
      {open && items.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 6, marginTop: 8, paddingTop: 8, borderTop: '1px dashed #d5dae0' }}>
          {items.map(it => (
            <button key={it.key} type="button" onClick={() => onPick(it.key)}
              style={{ ...historyBox(active === it.key), ...(active === it.key ? null : { background: '#fafbfc' }), minHeight: 42 }}>
              <span style={{ fontWeight: 600, fontSize: 12.5 }}>{it.label}</span>
              {it.sub && <span style={sub}>{it.sub}</span>}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

// Short box label for a report period: "Sept" for a month, the term's own name for a term.
export function shortPeriodLabel(p) {
  if (p.kind === 'term') return p.label.replace(/\s*\d{2,4}-\d{2}$/, '');
  return new Date(p.start + 'T12:00:00').toLocaleDateString('en-GB', { month: 'short' });
}
