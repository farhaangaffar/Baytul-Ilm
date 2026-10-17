import React from 'react';
import { HeartPulse } from 'lucide-react';
import { DETAIL_SECTIONS, RELATIONS, detailFields, hasHealthNote } from '../lib/studentDetails';

// Small boxes for a quick choice (Boy / Girl, Yes / No…). Tap the chosen one again to clear it.
export function ChoiceBoxes({ options, value, onChange }) {
  return (
    <div className="choice-boxes" style={{ gridTemplateColumns: `repeat(${options.length > 3 ? 3 : options.length}, minmax(0, 1fr))` }}>
      {options.map(o => (
        <button key={o} type="button" className={value === o ? 'on' : ''} onClick={() => onChange(value === o ? '' : o)}>{o}</button>
      ))}
    </div>
  );
}

// Each parent: who they are (Mother / Father…), name, phone and email. Used by the edit pop-up on
// Students and the new-student form (which passes `errors` for the required boxes).
export function ParentInputs({ form, set, errors = {}, required = false }) {
  const err = k => errors[k] && <span style={{ fontSize: 11, color: 'var(--red)' }}>{errors[k]}</span>;
  const star = n => required && n === 1 && <span className="required">*</span>;
  return [1, 2].map(n => (
    <div key={n}>
      <div className="form-section-title" style={{ marginBottom: 12 }}>Parent {n}{n === 2 ? ' (if there is one)' : ''}</div>
      <div className="form-grid form-grid-2 mb-5">
        <div className="form-group" style={{ gridColumn: '1 / -1' }}><label>They are the child's</label>
          <ChoiceBoxes options={RELATIONS} value={form[`parent${n}Relation`] || ''} onChange={v => set(`parent${n}Relation`, v)} /></div>
        <div className="form-group"><label>Name{star(n)}</label><input value={form[`parent${n}Name`] || ''} onChange={e => set(`parent${n}Name`, e.target.value)} />{err(`parent${n}Name`)}</div>
        <div className="form-group"><label>Phone{star(n)}</label><input type="tel" value={form[`parent${n}Phone`] || ''} onChange={e => set(`parent${n}Phone`, e.target.value)} />{err(`parent${n}Phone`)}</div>
        <div className="form-group" style={{ gridColumn: '1 / -1' }}><label>Email</label><input type="email" value={form[`parent${n}Email`] || ''} onChange={e => set(`parent${n}Email`, e.target.value)} /></div>
      </div>
    </div>
  ));
}

// The extra details as form boxes, a section at a time. `only` limits it to some sections;
// `before` adds boxes at the top of a section (e.g. the parents' names and phones in Family).
export function DetailInputs({ form, set, isDarulUloom, only, before = {} }) {
  const fields = detailFields(isDarulUloom);
  return DETAIL_SECTIONS.filter(([id]) => (!only || only.includes(id)) && (fields.some(f => f[2].section === id) || before[id])).map(([id, title]) => (
    <div key={id}>
      <div className="form-section-title" style={{ marginBottom: 12 }}>{title}</div>
      <div className="form-grid form-grid-2 mb-5">
        {before[id]}
        {fields.filter(f => f[2].section === id).map(([key, label, o]) => (
          <div className="form-group" key={key} style={o.wide ? { gridColumn: '1 / -1' } : undefined}>
            <label>{label}</label>
            {o.options
              ? <ChoiceBoxes options={o.options} value={form[key] || ''} onChange={v => set(key, v)} />
              : o.wide && id === 'health'
                ? <textarea rows={2} value={form[key] || ''} onChange={e => set(key, e.target.value)} style={{ resize: 'vertical' }} placeholder="None" />
                : <input type={o.type || 'text'} value={form[key] || ''} onChange={e => set(key, e.target.value)} />}
          </div>
        ))}
      </div>
    </div>
  ));
}

// The filled-in details as label · value lines, a section at a time (empty ones left out).
export function DetailLines({ student, isDarulUloom, skip = [] }) {
  const fields = detailFields(isDarulUloom).filter(([key, , o]) => student[key] && o.section !== 'health' && !skip.includes(key));
  return DETAIL_SECTIONS.map(([id, title]) => {
    const here = fields.filter(f => f[2].section === id);
    if (!here.length) return null;
    return (
      <div key={id} className="mb-4">
        <div className="form-section-title" style={{ marginBottom: 10 }}>{title}</div>
        {here.map(([key, label]) => (
          <div key={key} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
            <span className="text-muted">{label}</span><span style={{ fontWeight: 500, textAlign: 'right', overflowWrap: 'anywhere' }}>{student[key]}</span>
          </div>
        ))}
      </div>
    );
  });
}

// Allergies, conditions and medication in red — on the child's profile, their attendance
// and their daily records, so whoever has them that day sees it.
export function HealthNote({ student, style }) {
  if (!hasHealthNote(student)) return null;
  return (
    <div className="health-note" style={style}>
      <HeartPulse size={16} style={{ flexShrink: 0, marginTop: 1 }} />
      <div>
        {[['Allergies', student.allergies], ['Medical', student.medical], ['Medication', student.medication]].filter(([, v]) => v).map(([l, v]) => (
          <div key={l}><strong>{l}:</strong> {v}</div>
        ))}
      </div>
    </div>
  );
}

// A small red heart next to a child's name on a list, when they have a health note.
export function HealthDot({ student }) {
  if (!hasHealthNote(student)) return null;
  const words = [student.allergies && `Allergies: ${student.allergies}`, student.medical && `Medical: ${student.medical}`, student.medication && `Medication: ${student.medication}`].filter(Boolean).join(' · ');
  return <HeartPulse size={14} className="health-dot" aria-label={words}><title>{words}</title></HeartPulse>;
}
