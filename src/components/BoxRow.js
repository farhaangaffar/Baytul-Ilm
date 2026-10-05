import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

// One line of equal boxes — a day's attendance, a fee, a Qur'an entry. Label boxes
// (grey) name the line; choice boxes stay plain unless they apply, when they fill in
// their tone. A header box (with a chevron) heads a month that opens.
//   cells: [{ text, sub?, label?, header?, open?, action? (a dark button-like box), tone?: 'green'|'blue'|'amber'|'red', wrap?: true | 'words' }]
//   columns: CSS grid columns (default four equal ones; null = set by `className` in CSS);
//   fill: take the parent's height. A cell's own className is put on its box.
const TONES = {
  green: ['var(--green-light)', 'var(--green)', 'var(--green-text)'],
  amber: ['var(--amber-light)', 'var(--amber)', 'var(--amber-text)'],
  red: ['var(--red-light)', 'var(--red)', 'var(--red-text)'],
  blue: ['var(--teal-light)', 'var(--teal-mid)', 'var(--teal-dark)'],
};

export default function BoxRow({ cells, columns = 'repeat(4, minmax(0, 1fr))', fill = false, className }) {
  return (
    <div className={className} style={{ display: 'grid', gridTemplateColumns: columns || undefined, gap: 6, marginBottom: fill ? 0 : 6, height: fill ? '100%' : undefined }}>
      {cells.map((c, i) => {
        const [bg, border, text] = c.tone ? TONES[c.tone] : [];
        const style = c.action
          ? { background: 'var(--ink)', border: '1px solid var(--ink)', color: '#fff', fontWeight: 600 }
          : c.header
          ? { background: '#e9ecf0', border: '1px solid #d5dae0', color: 'var(--ink)', fontWeight: 700 }
          : c.label
          ? { background: '#f3f4f6', border: '1px solid transparent', color: 'var(--ink)', fontWeight: 600 }
          : c.tone
            ? { background: bg, border: `1px solid ${border}`, color: text, fontWeight: 700 }
            : { background: '#fafbfc', border: '1px solid #dfe3e8', color: 'var(--text-muted)', fontWeight: 500 };
        // wrap: true breaks long words if it must; 'words' only between words.
        const line = c.wrap ? { overflowWrap: c.wrap === 'words' ? 'normal' : 'break-word' } : { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
        return (
          <div key={i} className={c.className} style={{ ...style, borderRadius: 8, padding: '5px 4px', minHeight: 40, textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center', fontSize: 11.5, lineHeight: 1.25, overflow: 'hidden', minWidth: 0 }}>
            <div style={{ ...line, display: c.header ? 'flex' : 'block', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
              {c.header && (c.open ? <ChevronUp size={13} style={{ flexShrink: 0 }} /> : <ChevronDown size={13} style={{ flexShrink: 0 }} />)}{c.text}
            </div>
            {c.sub && <div style={{ ...line, fontSize: 10.5, fontWeight: 500, opacity: 0.85 }}>{c.sub}</div>}
          </div>
        );
      })}
    </div>
  );
}
