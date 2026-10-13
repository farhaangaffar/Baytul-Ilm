import React from 'react';

// A plain box to type in, with a few suggestions underneath to tap — the app's own look instead of
// the browser's suggestion list (which showed an arrow and often nothing else). Suggestions narrow
// as you type and go once the box matches one, so a filled-in field is just a box.
//   value / onChange · options: strings · placeholder · max: how many suggestions at most
export default function PickField({ value, onChange, options = [], placeholder = '', max = 6, autoFocus = false }) {
  const v = (value || '').trim().toLowerCase();
  const exact = options.some(o => o.toLowerCase() === v);
  const shown = exact ? [] : options.filter(o => !v || o.toLowerCase().includes(v)).slice(0, max);

  return (
    <div className="pick-field">
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} />
      {shown.length > 0 && (
        <div className="pick-field-list">
          {shown.map(o => (
            <button key={o} type="button" className="pick-chip" onClick={() => onChange(o)}>{o}</button>
          ))}
        </div>
      )}
    </div>
  );
}
