import React, { useState, useEffect, useRef } from 'react';
import { addQuranEntry, updateQuranEntry, deleteQuranEntry, savePriorJuz, saveStudentQuranType } from '../lib/store';
import {
  SURAHS, ayahCount, surahName, rangeLabel, nextStart, hifzProgress, juzOf,
  QURAN_TYPES, KIND_LABELS, GRADES, ayahsMemorisedBetween,
  quarterStart, quarterEnd, quarterOf, QUARTER_NAMES, upToLabel,
} from '../lib/quran';
import { Check, Trash2, BookOpen, Pencil, X } from 'lucide-react';
import BoxRow from './BoxRow';

// Qur'an progress on a student's Daily records page: an entry card for one day
// (sabaq / sabqi / manzil for hifz, reading for nazira, lesson for qaida) and a
// progress card (30-juz bar for hifz). Data comes from /api/quran via the parent.

function isoToday() { return new Date().toISOString().split('T')[0]; }
function fmtDate(iso) { return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }); }

// Box-style inputs, matching the BoxRow boxes used on Progress, Attendance and Fees.
const BOX = { height: 40, borderRadius: 8, minWidth: 0, fontFamily: 'var(--font)', fontSize: 12.5 };
const boxInput = { ...BOX, width: '100%', border: '1px solid #dfe3e8', background: '#fafbfc', color: 'var(--ink)', padding: '0 8px' };
const boxLabel = { ...BOX, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, fontWeight: 600, color: 'var(--ink)' };
const grid4 = { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 };
const blank = v => v === '' || v == null;

// "From" box, surah dropdown (two boxes wide), ayah box. Starts empty.
function Position({ surah, ayah, onChange, label }) {
  const max = surah ? ayahCount(surah) : 286;
  return (
    <div style={grid4}>
      <div style={boxLabel}>{label}</div>
      <select value={surah || ''} onChange={e => { const s = Number(e.target.value); onChange(s, blank(ayah) ? '' : Math.min(ayah, ayahCount(s))); }}
        style={{ ...boxInput, gridColumn: 'span 2' }} aria-label={`${label} surah`}>
        <option value="" disabled>Surah…</option>
        {SURAHS.map(([name], i) => <option key={i} value={i + 1}>{i + 1}. {name}</option>)}
      </select>
      <input type="number" min={1} max={max} value={blank(ayah) ? '' : ayah} inputMode="numeric" placeholder="Ayah"
        onChange={e => onChange(surah, e.target.value === '' ? '' : Math.max(1, Math.min(max, Number(e.target.value) || 1)))}
        style={{ ...boxInput, textAlign: 'center' }} aria-label={`${label} ayah`} title={`Ayah (1–${max})`} />
    </div>
  );
}

// "From" box, juz, quarter (two boxes wide). `edge` says whether this end of the range
// means the quarter's first ayah (from) or its last (to). Starts empty; the position is
// set once both juz and quarter are chosen.
function QuarterPosition({ label, surah, ayah, edge, onChange }) {
  const known = !blank(surah) && !blank(ayah) ? quarterOf(surah, ayah) : null;
  const [pending, setPending] = useState({ juz: '', q: '' });
  useEffect(() => { if (blank(surah)) setPending({ juz: '', q: '' }); }, [surah]);
  const juz = known ? known.juz : pending.juz, q = known ? known.q : pending.q;
  const pick = (j, k) => {
    if (blank(j) || blank(k)) { setPending({ juz: j, q: k }); return; }
    const p = edge === 'from' ? quarterStart(j, k) : quarterEnd(j, k); onChange(p.surah, p.ayah);
  };
  return (
    <div style={grid4}>
      <div style={boxLabel}>{label}</div>
      <select value={juz} onChange={e => pick(Number(e.target.value), q)} style={boxInput} aria-label={`${label} juz`}>
        <option value="" disabled>Juz…</option>
        {Array.from({ length: 30 }, (_, i) => <option key={i} value={i + 1}>Juz {i + 1}</option>)}
      </select>
      <select value={q} onChange={e => pick(juz, Number(e.target.value))} style={{ ...boxInput, gridColumn: 'span 2' }} aria-label={`${label} quarter`}>
        <option value="" disabled>Quarter…</option>
        {QUARTER_NAMES.map((n, i) => <option key={i} value={i + 1}>{n}</option>)}
      </select>
    </div>
  );
}

const filled = f => !blank(f.fromSurah) && !blank(f.fromAyah) && !blank(f.toSurah) && !blank(f.toAyah);

// Snap a range to whole quarters: from the start of its first quarter to the end of its last.
function toQuarters(f) {
  if (!filled(f)) return {};
  const a = quarterOf(f.fromSurah, f.fromAyah), b = quarterOf(f.toSurah, f.toAyah);
  const s = quarterStart(a.juz, a.q), t = quarterEnd(b.juz, b.q);
  return { fromSurah: s.surah, fromAyah: s.ayah, toSurah: t.surah, toAyah: t.ayah };
}

// Good / Weak / Repeat as boxes — plain until chosen, then filled in their colour.
function GradeButtons({ value, onChange }) {
  return GRADES.map(g => {
    const on = value === g.key;
    return (
      <button key={g.key} type="button" onClick={() => onChange(on ? null : g.key)} aria-pressed={on}
        style={{ ...BOX, cursor: 'pointer', fontWeight: on ? 700 : 500,
          background: on ? g.bg : '#fafbfc', color: on ? g.text : 'var(--text-muted)', border: `1px solid ${on ? g.color : '#dfe3e8'}` }}>
        {g.label}
      </button>
    );
  });
}

// An empty entry. Keeps the way of recording (surah/ayah or juz quarters) used last time.
function blankFor(kind, entries) {
  if (kind === 'lesson') return { lesson: '', grade: null, note: '' };
  const last = entries.filter(e => e.kind === kind).sort(newestFirst)[0];
  return { fromSurah: '', fromAyah: '', toSurah: '', toAyah: '', grade: null, note: '', unit: last?.unit === 'quarter' ? 'quarter' : 'ayah' };
}

// Where a new sabaq / reading would carry on from (the ayah after the last one), offered
// as a one-tap shortcut; nothing for revision or lessons.
function carryOnFrom(kind, date, entries) {
  if (kind !== 'sabaq' && kind !== 'reading') return null;
  const last = entries.filter(e => e.kind === kind && e.date <= date).sort(newestFirst)[0];
  return last ? nextStart(last) : null;
}

// Surah & ayah / Juz quarters switch.
function UnitToggle({ f, set }) {
  return (
    <div style={{ display: 'flex', background: '#eef1f5', borderRadius: 999, padding: 2 }}>
      {[['ayah', 'Surah & ayah'], ['quarter', 'Juz quarters']].map(([u, text]) => {
        const on = (f.unit || 'ayah') === u;
        return (
          <button key={u} type="button" onClick={() => !on && set(u === 'quarter' ? { unit: u, ...toQuarters(f) } : { unit: u })}
            style={{ border: 'none', borderRadius: 999, padding: '3px 10px', fontSize: 11.5, fontWeight: 600, fontFamily: 'var(--font)', cursor: 'pointer',
              background: on ? '#fff' : 'transparent', color: on ? 'var(--ink)' : 'var(--text-muted)', boxShadow: on ? 'var(--shadow-sm)' : 'none' }}>
            {text}
          </button>
        );
      })}
    </div>
  );
}

// The inputs for one entry, as rows of boxes: From, To (or a qaida lesson), a note, then
// Good / Weak / Repeat with `children` (the Save box) as the fourth. Shared by Input
// progress and the edit pop-up.
function EntryFields({ kind, f, set, children }) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {kind === 'lesson' ? (
        <input value={f.lesson || ''} onChange={e => set({ lesson: e.target.value })} placeholder="Lesson, e.g. Lesson 12, page 18" style={boxInput} />
      ) : f.unit === 'quarter' ? (
        <>
          <QuarterPosition label="From" edge="from" surah={f.fromSurah} ayah={f.fromAyah} onChange={(s, a) => set({ fromSurah: s, fromAyah: a })} />
          <QuarterPosition label="To" edge="to" surah={f.toSurah} ayah={f.toAyah} onChange={(s, a) => set({ toSurah: s, toAyah: a })} />
          {filled(f) && <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{rangeLabel({ ...f, unit: 'ayah' })}</div>}
        </>
      ) : (
        <>
          <Position label="From" surah={f.fromSurah} ayah={f.fromAyah} onChange={(s, a) => set({ fromSurah: s, fromAyah: a })} />
          <Position label="To" surah={f.toSurah} ayah={f.toAyah} onChange={(s, a) => set({ toSurah: s, toAyah: a })} />
        </>
      )}
      <input value={f.note || ''} onChange={e => set({ note: e.target.value })} placeholder="Note (optional)" style={boxInput} />
      <div style={children ? grid4 : { ...grid4, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <GradeButtons value={f.grade} onChange={g => set({ grade: g })} />
        {children}
      </div>
    </div>
  );
}

// What's missing before an entry can be saved, if anything.
function missing(kind, f) {
  if (kind === 'lesson') return f.lesson?.trim() ? '' : 'Write the lesson first.';
  return filled(f) ? '' : (f.unit === 'quarter' ? 'Choose the juz and quarter for From and To.' : 'Choose the surah and ayah for From and To.');
}

// One kind (sabaq / sabqi / …) on Input progress. Always a new, empty entry; saving adds
// it (a day can have several of a kind) and the row clears for the next one. Recorded
// entries are changed from Progress → Recent.
function EntryRow({ studentId, kind, date, entries, onSaved, onError }) {
  const [f, setF] = useState(() => blankFor(kind, entries));
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  // A new day starts empty.
  const shownDate = useRef(date);
  useEffect(() => {
    if (shownDate.current !== date) { shownDate.current = date; setF(blankFor(kind, entries)); setJustSaved(false); }
  }, [kind, date, entries]);
  const set = patch => { setF(prev => ({ ...prev, ...patch })); setJustSaved(false); };
  const label = KIND_LABELS[kind];
  const next = blank(f.fromSurah) ? carryOnFrom(kind, date, entries) : null;

  function carryOn() {
    if (f.unit === 'quarter') {
      const { juz, q } = quarterOf(next.surah, next.ayah), s = quarterStart(juz, q), t = quarterEnd(juz, q);
      set({ fromSurah: s.surah, fromAyah: s.ayah, toSurah: t.surah, toAyah: t.ayah });
    } else set({ fromSurah: next.surah, fromAyah: next.ayah, toSurah: next.surah, toAyah: '' });
  }

  async function save() {
    const why = missing(kind, f);
    if (why) { onError(why); return; }
    setSaving(true);
    try {
      await addQuranEntry({ studentId, date, kind, ...f });
      setF(prev => ({ ...blankFor(kind, entries), unit: prev.unit })); // clear for the next entry
      setJustSaved(true); await onSaved();
    } catch (err) { onError(err.message || 'Could not save'); }
    setSaving(false);
  }

  return (
    <div style={{ padding: '12px 0', borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, fontSize: 13.5 }}>{label.name}</span>
        <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{label.hint}</span>
        {justSaved && <span className="badge badge-green"><Check size={11} />Recorded</span>}
        <span style={{ flex: 1 }} />
        {kind !== 'lesson' && <UnitToggle f={f} set={set} />}
      </div>
      {next && (
        <button type="button" className="btn btn-sm" onClick={carryOn} style={{ marginBottom: 6 }}>
          Carry on from {surahName(next.surah)} {next.ayah}
        </button>
      )}
      <EntryFields kind={kind} f={f} set={set}>
        <button className="btn btn-primary" onClick={save} disabled={saving} style={{ ...BOX, justifyContent: 'center', padding: 0 }}>{saving ? 'Saving…' : 'Save'}</button>
      </EntryFields>
    </div>
  );
}

// Pop-up for changing (or removing) one recorded entry — opened from Progress → Recent.
function EditEntryModal({ entry, studentId, onClose, onSaved }) {
  const [f, setF] = useState({ ...entry });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = patch => setF(prev => ({ ...prev, ...patch }));
  const label = KIND_LABELS[entry.kind];

  async function run(fn) {
    setBusy(true); setError('');
    try { await fn(); await onSaved(); onClose(); }
    catch (err) { setError(err.message || 'Something went wrong'); setBusy(false); }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal" style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <div className="modal-title">Change {label.name.toLowerCase()}</div>
          <button className="btn btn-icon" onClick={onClose} disabled={busy}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <div className="form-group" style={{ marginBottom: 10 }}>
            <label>Date</label>
            <input type="date" value={f.date} max={isoToday()} onChange={e => e.target.value && set({ date: e.target.value })} style={boxInput} />
          </div>
          {entry.kind !== 'lesson' && <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}><UnitToggle f={f} set={set} /></div>}
          <EntryFields kind={entry.kind} f={f} set={set} />
          {error && <div style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 10 }}>{error}</div>}
        </div>
        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
          {confirmDelete
            ? <button className="btn btn-danger" disabled={busy} onClick={() => run(() => deleteQuranEntry(studentId, entry.id))}><Trash2 size={13} />Yes, delete</button>
            : <button className="btn" style={{ color: 'var(--red)' }} disabled={busy} onClick={() => setConfirmDelete(true)}><Trash2 size={13} />Delete</button>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="btn btn-primary" disabled={busy} onClick={() => { const why = missing(entry.kind, f); if (why) setError(why); else run(() => updateQuranEntry(entry.id, { ...f, studentId })); }}>
              <Check size={13} />{busy ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// The student's Qur'an level — Hifz / Nazira / Qaida. Teachers change it as a child moves
// up; in a mixed class it's chosen here the first time.
function LevelPicker({ student, type, classType, data, onChanged, onError }) {
  const [busy, setBusy] = useState(false);
  const own = data?.quranType || null;
  async function pick(next) {
    // Choosing the class's own level clears the student's override.
    const value = next === classType ? null : next;
    if (value === own) return;
    setBusy(true);
    try { await saveStudentQuranType(student.id, value); await onChanged(); }
    catch (err) { onError(err.message || 'Could not change the level'); }
    setBusy(false);
  }
  return (
    <div style={{ display: 'flex', gap: 4, background: '#eef1f5', borderRadius: 999, padding: 2 }} aria-label="Qur'an level">
      {Object.entries(QURAN_TYPES).map(([k, t]) => {
        const on = type === k;
        return (
          <button key={k} type="button" disabled={busy} onClick={() => pick(k)}
            style={{ border: 'none', borderRadius: 999, padding: '4px 11px', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font)', cursor: 'pointer',
              background: on ? '#fff' : 'transparent', color: on ? 'var(--ink)' : 'var(--text-muted)', boxShadow: on ? 'var(--shadow-sm)' : 'none' }}>
            {t.label.split(' ')[0]}
          </button>
        );
      })}
    </div>
  );
}

// "Input progress": new entries for one student (today, or a past day picked with the
// date box). `type` is the student's level (their own, or their class's); `classType` is
// the class setting (possibly 'mixed'). Recorded entries are changed from Progress.
export function QuranEntryCard({ student, type, classType, data, onChanged }) {
  const [date, setDate] = useState(isoToday());
  const [error, setError] = useState('');
  const kinds = QURAN_TYPES[type]?.kinds || [];
  const entries = data?.entries || [];
  const header = (
    <div className="flex items-center gap-2" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
      <BookOpen size={15} style={{ color: 'var(--teal-dark)' }} />
      <div className="card-title" style={{ marginBottom: 0, flex: 1 }}>Input progress</div>
      {data && <LevelPicker student={student} type={type} classType={classType} data={data} onChanged={onChanged} onError={setError} />}
    </div>
  );
  // Mixed class and no level chosen for this student yet.
  if (data && !type) {
    return (
      <div className="card mb-4">
        {header}
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Choose whether {student.forename} is doing Hifz, Nazira or Qaida — you can change it later as they move up.</div>
        {error && <div style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 6 }}>{error}</div>}
      </div>
    );
  }
  return (
    <div className="card mb-4">
      {header}
      {date === isoToday() && <div style={{ marginBottom: 6 }}><span className="badge badge-teal">Today</span></div>}
      <input type="date" value={date} max={isoToday()} onChange={e => e.target.value && setDate(e.target.value)}
        style={{ ...boxInput, background: '#fff', marginBottom: 4 }} />
      {/* Rows wait for the history to load (for "Carry on from" and the last way of recording). */}
      {!data && <div style={{ fontSize: 12.5, color: 'var(--text-muted)', padding: '10px 0' }}>Loading…</div>}
      {data && kinds.map(kind => (
        <EntryRow key={kind} studentId={student.id} kind={kind} date={date} entries={entries}
          onSaved={async () => { setError(''); await onChanged(); }} onError={setError} />
      ))}
      {error && <div style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 6 }}>{error}</div>}
    </div>
  );
}

const GRADE_TONES = { good: 'green', weak: 'amber', repeat: 'red' };

// Newest first: by day, then by when it was recorded.
const newestFirst = (a, b) => b.date.localeCompare(a.date) || Number(b.id || 0) - Number(a.id || 0);

// Where a student is up to, with the 30-juz bar for hifz. With `canEdit`, each Recent entry
// can be tapped to change or delete it in a pop-up.
export function QuranProgressCard({ student, type, data, onChanged, canEditPrior, canEdit }) {
  const [editingEntry, setEditingEntry] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [editingPrior, setEditingPrior] = useState(false);
  const [error, setError] = useState('');
  const entries = data?.entries || [];
  const priorJuz = data?.priorJuz || [];
  const sorted = [...entries].sort(newestFirst);
  const recent = showAll ? sorted : sorted.slice(0, 8);

  async function togglePrior(j) {
    const next = priorJuz.includes(j) ? priorJuz.filter(x => x !== j) : [...priorJuz, j];
    try { await savePriorJuz(student.id, next); await onChanged(); setError(''); }
    catch (err) { setError(err.message || 'Could not save'); }
  }

  let headline = null;
  if (type === 'hifz') {
    const p = hifzProgress(entries, priorJuz);
    const today = isoToday();
    const fourWeeksAgo = new Date(Date.now() - 28 * 864e5).toISOString().slice(0, 10);
    const lastFourWeeks = ayahsMemorisedBetween(entries, priorJuz, fourWeeksAgo, new Date(Date.now() + 864e5).toISOString().slice(0, 10));
    headline = (
      <>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {[[`${p.completeJuz}`, 'Juz complete'], [`${p.percent}%`, "Of the Qur'an"], [lastFourWeeks, 'Ayahs, last 4 weeks']].map(([v, l]) => (
            <div key={l} style={{ flex: '1 1 80px', background: '#f3f4f6', borderRadius: 'var(--r-md)', padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--ink)' }}>{v}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{l}</div>
            </div>
          ))}
        </div>
        {p.latest && (
          <div style={{ fontSize: 12.5, marginBottom: 10 }}>
            Latest sabaq: <strong>{rangeLabel(p.latest)}</strong> <span className="text-muted">(Juz {juzOf(p.latest.toSurah, p.latest.toAyah)}, {p.latest.date === today ? 'today' : fmtDate(p.latest.date)})</span>
          </div>
        )}
        {/* 30 juz, 1 → 30, each filled by how much of it is memorised. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 4 }}>
          {p.juz.map((f, i) => {
            const j = i + 1;
            const prior = priorJuz.includes(j);
            return (
              <button key={j} type="button" disabled={!editingPrior}
                onClick={() => togglePrior(j)}
                title={`Juz ${j}: ${Math.round(f * 100)}% memorised${prior ? ' (before records began)' : ''}`}
                style={{
                  position: 'relative', height: 30, borderRadius: 6, border: 'none', padding: 0, overflow: 'hidden',
                  background: '#eef1f5', cursor: editingPrior ? 'pointer' : 'default', fontFamily: 'var(--font)',
                  boxShadow: editingPrior && prior ? 'inset 0 0 0 2px var(--teal-dark)' : undefined,
                }}>
                <span style={{ position: 'absolute', left: 0, bottom: 0, top: 0, width: `${f * 100}%`, background: f >= 0.999 ? 'var(--green)' : 'var(--teal)', opacity: f >= 0.999 ? 0.85 : 0.55 }} />
                <span style={{ position: 'relative', fontSize: 10.5, fontWeight: 700, color: f >= 0.5 ? '#fff' : 'var(--text-muted)' }}>{j}</span>
              </button>
            );
          })}
        </div>
        {canEditPrior && (
          <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {editingPrior
              ? <>Tap each juz they had already memorised before starting here. <button className="btn btn-sm" onClick={() => setEditingPrior(false)}><Check size={12} />Done</button></>
              : <button className="btn btn-sm" onClick={() => setEditingPrior(true)}><Pencil size={12} />Juz memorised before starting here</button>}
          </div>
        )}
      </>
    );
  } else if (type === 'nazira' || type === 'qaida') {
    const kind = type === 'nazira' ? 'reading' : 'lesson';
    const last = entries.filter(e => e.kind === kind).sort((a, b) => b.date.localeCompare(a.date))[0];
    headline = (
      <div style={{ fontSize: 13, marginBottom: 6 }}>
        {last
          ? <>Up to: <strong>{kind === 'lesson' ? last.lesson : upToLabel(last)}</strong>{kind === 'reading' && last.unit !== 'quarter' && <span className="text-muted"> (Juz {juzOf(last.toSurah, last.toAyah)})</span>} <span className="text-muted">· {fmtDate(last.date)}</span></>
          : <span className="text-muted">Nothing recorded yet.</span>}
      </div>
    );
  }

  return (
    <div className="card mb-4">
      <div className="card-title" style={{ marginBottom: 12 }}>Progress</div>
      {headline}
      {error && <div style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 6 }}>{error}</div>}
      {recent.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-soft)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
            Recent{canEdit && <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}> · tap one to change it</span>}
          </div>
          {recent.map(e => {
            const d = new Date(e.date + 'T12:00:00');
            const g = GRADES.find(x => x.key === e.grade);
            return (
              <div key={e.id || `${e.date}-${e.kind}`} onClick={canEdit ? () => setEditingEntry(e) : undefined} role={canEdit ? 'button' : undefined}
                title={canEdit ? 'Change or delete this entry' : (e.note || undefined)} style={{ cursor: canEdit ? 'pointer' : 'default' }}>
                <BoxRow columns="minmax(0, 1.15fr) minmax(0, 1fr) minmax(0, 1.65fr) minmax(0, 1fr)" cells={[
                  { label: true, text: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), sub: d.toLocaleDateString('en-GB', { weekday: 'short' }) },
                  { label: true, text: KIND_LABELS[e.kind]?.name },
                  { label: true, wrap: true, text: e.kind === 'lesson' ? e.lesson : rangeLabel(e).replace(/-/g, '\u2011').replace(/(\d)–(\d)/g, '$1\u2060–\u2060$2'), sub: e.note || undefined }, // keep "An-Naba" and "1–20" whole
                  { text: g ? g.label : '—', tone: g && GRADE_TONES[g.key] },
                ]} />
              </div>
            );
          })}
          {sorted.length > 8 && (
            <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => setShowAll(v => !v)}>
              {showAll ? 'Show fewer' : `Show all ${sorted.length}`}
            </button>
          )}
        </div>
      )}
      {editingEntry && (
        <EditEntryModal entry={editingEntry} studentId={student.id} onClose={() => setEditingEntry(null)} onSaved={onChanged} />
      )}
    </div>
  );
}

// One paragraph of facts about a student's Qur'an progress in a report period, for
// the AI summary prompt — exact figures, so the report can quote them.
export function quranFactsForReport(type, data, period) {
  if (!type || !data || !period) return '';
  const entries = data.entries || [];
  const inPeriod = entries.filter(e => e.date >= period.start && e.date < period.endExclusive);
  const graded = k => {
    const list = inPeriod.filter(e => e.kind === k);
    const count = g => list.filter(e => e.grade === g).length;
    return list.length ? `${list.length} ${KIND_LABELS[k].name.toLowerCase()} sessions (${count('good')} good, ${count('weak')} weak, ${count('repeat')} to repeat)` : '';
  };
  if (type === 'hifz') {
    const p = hifzProgress(entries, data.priorJuz || []);
    const learned = ayahsMemorisedBetween(entries, data.priorJuz || [], period.start, period.endExclusive);
    const parts = [
      `New ayahs memorised in ${period.label}: ${learned}.`,
      `Total memorised: ${p.completeJuz} complete juz (${p.percent}% of the Qur'an).`,
      p.latest ? `Latest sabaq: ${rangeLabel(p.latest)} (Juz ${juzOf(p.latest.toSurah, p.latest.toAyah)}).` : '',
      ['sabaq', 'sabqi', 'manzil'].map(graded).filter(Boolean).join('; '),
    ].filter(Boolean);
    return `Hifz (Qur'an memorisation): ${parts.join(' ')}`;
  }
  const kind = type === 'nazira' ? 'reading' : 'lesson';
  const last = entries.filter(e => e.kind === kind && e.date < period.endExclusive).sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!last) return '';
  const where = kind === 'lesson' ? `Qaida: up to ${last.lesson}.` : `Qur'an reading (nazira): up to ${upToLabel(last)} (Juz ${juzOf(last.toSurah, last.toAyah)}).`;
  return `${where} ${graded(kind)}`.trim();
}
