import React, { useState } from 'react';
import { ChevronDown, Check, X } from 'lucide-react';

// The class (and academic year) chooser at the top of Attendance, Fees and Daily records.
// A few classes stay as the row of pills; with more (a Darul Uloom's seven years and a
// Hifdh class), the row becomes two boxes — Class ▾ and Year ▾ — each opening a pop-up with
// one line per choice, so the top of the page doesn't fill up with buttons.
//   classes: names · active / onPick · notes: { name: 'e.g. 4 / 6 present' } shown on each line
//   years / year / onYear: optional · pills: the row's and each pill's class names when there are few
export const MANY_CLASSES = 5;

export default function ClassBar({ classes, active, onPick, notes = {}, years, year, onYear, pills = ['pill-tabs', 'pill-tab'] }) {
  const [open, setOpen] = useState(''); // '' | 'class' | 'year'
  if (classes.length <= MANY_CLASSES) {
    return (
      <div className={pills[0]}>
        {classes.map(c => (
          <button key={c} className={`${pills[1]} ${active === c ? 'active' : ''}`} onClick={() => onPick(c)}>{c}</button>
        ))}
        {years && <>
          <div className="pill-divider" />
          {years.map(y => (
            <button key={y} className={`pill-tab ${year === y ? 'year-active' : ''}`} onClick={() => onYear(y)}>{y}</button>
          ))}
        </>}
      </div>
    );
  }

  const choose = (fn, v) => { setOpen(''); fn(v); };
  return (
    <>
      <div className={years ? 'class-bar two' : 'class-bar'}>
        <button type="button" className="class-bar-box" onClick={() => setOpen('class')}>
          <span className="class-bar-label">Class</span>
          <span className="class-bar-value">{active || 'Choose'}<ChevronDown size={15} /></span>
        </button>
        {years && (
          <button type="button" className="class-bar-box" onClick={() => setOpen('year')}>
            <span className="class-bar-label">Year</span>
            <span className="class-bar-value">{year}<ChevronDown size={15} /></span>
          </button>
        )}
      </div>
      {open && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setOpen('')}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <div className="modal-title">{open === 'class' ? 'Choose a class' : 'Choose a year'}</div>
              <button className="btn btn-icon" onClick={() => setOpen('')}><X size={16} /></button>
            </div>
            <div className="modal-body" style={{ display: 'grid', gap: 6 }}>
              {(open === 'class' ? classes : years).map(v => {
                const on = open === 'class' ? v === active : v === year;
                return (
                  <button key={v} type="button" className={`line-row ${on ? 'on' : ''}`}
                    onClick={() => choose(open === 'class' ? onPick : onYear, v)}>
                    <span className="line-row-name">{v}</span>
                    {open === 'class' && notes[v] && <span className="line-row-sub">{notes[v]}</span>}
                    {on && <Check size={15} />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
