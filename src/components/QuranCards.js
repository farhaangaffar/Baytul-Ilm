import React, { useState, useEffect } from 'react';
import { saveQuranEntry, deleteQuranEntry, savePriorJuz, saveStudentQuranType } from '../lib/store';
import {
  SURAHS, ayahCount, surahName, rangeLabel, nextStart, hifzProgress, juzOf,
  QURAN_TYPES, KIND_LABELS, GRADES, ayahsMemorisedBetween,
  quarterStart, quarterEnd, quarterOf, QUARTER_NAMES, upToLabel,
} from '../lib/quran';
import { Check, Trash2, BookOpen, Pencil } from 'lucide-react';

// Qur'an progress on a student's Daily records page: an entry card for one day
// (sabaq / sabqi / manzil for hifz, reading for nazira, lesson for qaida) and a
// progress card (30-juz bar for hifz). Data comes from /api/quran via the parent.

function isoToday() { return new Date().toISOString().split('T')[0]; }
function fmtDate(iso) { return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }); }

const inputStyle = { padding: '8px 10px', border: 'none', borderRadius: 'var(--r-md)', fontFamily: 'var(--font)', fontSize: 13, background: '#f9fafb', minWidth: 0 };

// Surah dropdown + ayah number — "Al-Mulk" "15".
function Position({ surah, ayah, onChange, label }) {
  const max = ayahCount(surah);
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', minWidth: 0 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-soft)', width: 30, flexShrink: 0 }}>{label}</span>
      <select value={surah} onChange={e => onChange(Number(e.target.value), Math.min(ayah, ayahCount(Number(e.target.value))) || 1)}
        style={{ ...inputStyle, flex: 1 }} aria-label={`${label} surah`}>
        {SURAHS.map(([name], i) => <option key={i} value={i + 1}>{i + 1}. {name}</option>)}
      </select>
      <input type="number" min={1} max={max} value={ayah} inputMode="numeric"
        onChange={e => onChange(surah, Math.max(1, Math.min(max, Number(e.target.value) || 1)))}
        style={{ ...inputStyle, width: 64 }} aria-label={`${label} ayah`} title={`Ayah (1–${max})`} />
    </div>
  );
}

// Juz + quarter — "Juz 29" "2nd quarter". `edge` says whether this end of the range
// means the quarter's first ayah (from) or its last (to).
function QuarterPosition({ label, surah, ayah, edge, onChange }) {
  const { juz, q } = quarterOf(surah, ayah);
  const pick = (j, k) => { const p = edge === 'from' ? quarterStart(j, k) : quarterEnd(j, k); onChange(p.surah, p.ayah); };
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', minWidth: 0 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-soft)', width: 30, flexShrink: 0 }}>{label}</span>
      <select value={juz} onChange={e => pick(Number(e.target.value), q)} style={{ ...inputStyle, flex: 1 }} aria-label={`${label} juz`}>
        {Array.from({ length: 30 }, (_, i) => <option key={i} value={i + 1}>Juz {i + 1}</option>)}
      </select>
      <select value={q} onChange={e => pick(juz, Number(e.target.value))} style={{ ...inputStyle, flex: 1 }} aria-label={`${label} quarter`}>
        {QUARTER_NAMES.map((n, i) => <option key={i} value={i + 1}>{n}</option>)}
      </select>
    </div>
  );
}

// Snap a range to whole quarters: from the start of its first quarter to the end of its last.
function toQuarters(f) {
  const a = quarterOf(f.fromSurah, f.fromAyah), b = quarterOf(f.toSurah, f.toAyah);
  const s = quarterStart(a.juz, a.q), t = quarterEnd(b.juz, b.q);
  return { fromSurah: s.surah, fromAyah: s.ayah, toSurah: t.surah, toAyah: t.ayah };
}

function GradeButtons({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {GRADES.map(g => {
        const on = value === g.key;
        return (
          <button key={g.key} type="button" className="btn btn-sm" onClick={() => onChange(on ? null : g.key)}
            style={{ flex: 1, justifyContent: 'center', background: on ? g.bg : undefined, color: on ? g.text : undefined, boxShadow: on ? `inset 0 0 0 1.5px ${g.color}` : undefined }}>
            {g.label}
          </button>
        );
      })}
    </div>
  );
}

// What to prefill for a kind that hasn't been entered on this date yet.
function defaultsFor(kind, date, entries) {
  const before = entries.filter(e => e.kind === kind && e.date < date).sort((a, b) => b.date.localeCompare(a.date));
  const last = before[0];
  if (kind === 'lesson') return { lesson: last?.lesson || '', grade: null, note: '' };
  // Same way of recording as last time for this kind (surah/ayah or juz quarters).
  const unit = last?.unit === 'quarter' ? 'quarter' : 'ayah';
  const fit = r => (unit === 'quarter' ? { ...r, ...toQuarters(r) } : r);
  if (kind === 'sabaq' || kind === 'reading') {
    const n = nextStart(last) || { surah: 1, ayah: 1 };
    return fit({ fromSurah: n.surah, fromAyah: n.ayah, toSurah: n.surah, toAyah: n.ayah, grade: null, note: '', unit });
  }
  // Revision: start from where the last revision of this kind was, else where sabaq is.
  const ref = last || entries.filter(e => e.kind === 'sabaq').sort((a, b) => b.date.localeCompare(a.date))[0];
  if (ref) return fit({ fromSurah: ref.fromSurah, fromAyah: ref.fromAyah, toSurah: ref.toSurah, toAyah: ref.toAyah, grade: null, note: '', unit });
  return fit({ fromSurah: 1, fromAyah: 1, toSurah: 1, toAyah: 7, grade: null, note: '', unit });
}

function EntryRow({ studentId, kind, date, existing, entries, onSaved, onError }) {
  const initial = () => existing ? { ...existing } : defaultsFor(kind, date, entries);
  const [f, setF] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  // Reload when the day or the saved entry changes.
  useEffect(() => { setF(initial()); setDirty(false); }, [date, existing?.date, existing?.grade, existing?.toAyah, existing?.toSurah, existing?.lesson, existing?.note, existing?.unit]);
  const set = patch => { setF(prev => ({ ...prev, ...patch })); setDirty(true); };
  const label = KIND_LABELS[kind];

  async function save() {
    setSaving(true);
    try { await saveQuranEntry({ studentId, date, kind, ...f }); setDirty(false); await onSaved(); }
    catch (err) { onError(err.message || 'Could not save'); }
    setSaving(false);
  }
  async function remove() {
    setSaving(true);
    try { await deleteQuranEntry(studentId, date, kind); await onSaved(); }
    catch (err) { onError(err.message || 'Could not remove'); }
    setSaving(false);
  }

  return (
    <div style={{ padding: '12px 0', borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, fontSize: 13.5 }}>{label.name}</span>
        <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{label.hint}</span>
        {existing && !dirty && <span className="badge badge-green"><Check size={11} />Saved</span>}
        {kind !== 'lesson' && (
          // Record by surah and ayah, or in juz quarters.
          <div style={{ marginLeft: 'auto', display: 'flex', background: '#eef1f5', borderRadius: 999, padding: 2 }}>
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
        )}
      </div>
      {kind === 'lesson' ? (
        <input value={f.lesson || ''} onChange={e => set({ lesson: e.target.value })} placeholder="e.g. Lesson 12, page 18"
          style={{ ...inputStyle, width: '100%', marginBottom: 8 }} />
      ) : f.unit === 'quarter' ? (
        <div style={{ display: 'grid', gap: 6, marginBottom: 8 }}>
          <QuarterPosition label="From" edge="from" surah={f.fromSurah} ayah={f.fromAyah} onChange={(s, a) => set({ fromSurah: s, fromAyah: a })} />
          <QuarterPosition label="To" edge="to" surah={f.toSurah} ayah={f.toAyah} onChange={(s, a) => set({ toSurah: s, toAyah: a })} />
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{rangeLabel({ ...f, unit: 'ayah' })}</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 6, marginBottom: 8 }}>
          <Position label="From" surah={f.fromSurah} ayah={f.fromAyah}
            onChange={(s, a) => set({ fromSurah: s, fromAyah: a })} />
          <Position label="To" surah={f.toSurah} ayah={f.toAyah} onChange={(s, a) => set({ toSurah: s, toAyah: a })} />
        </div>
      )}
      <GradeButtons value={f.grade} onChange={g => set({ grade: g })} />
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <input value={f.note || ''} onChange={e => set({ note: e.target.value })} placeholder="Note (optional)"
          style={{ ...inputStyle, flex: 1 }} />
        {existing && (
          <button className="btn btn-icon btn-sm" style={{ color: 'var(--red)' }} title={`Remove ${label.name.toLowerCase()} for this day`} onClick={remove} disabled={saving}>
            <Trash2 size={13} />
          </button>
        )}
        <button className="btn btn-primary btn-sm" onClick={save} disabled={saving || (existing && !dirty)}>
          {saving ? 'Saving…' : 'Save'}
        </button>
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

// The day's Qur'an entries for one student. `type` is the student's level (their own, or
// their class's); `classType` is the class setting (possibly 'mixed').
export function QuranEntryCard({ student, type, classType, data, onChanged }) {
  const [date, setDate] = useState(isoToday());
  const [error, setError] = useState('');
  const kinds = QURAN_TYPES[type]?.kinds || [];
  const entries = data?.entries || [];
  const header = (
    <div className="flex items-center gap-2" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
      <BookOpen size={15} style={{ color: 'var(--teal-dark)' }} />
      <div className="card-title" style={{ marginBottom: 0, flex: 1 }}>Qur'an</div>
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
        style={{ ...inputStyle, width: '100%', marginBottom: 4, border: '1px solid var(--border)', background: '#fff' }} />
      {/* Rows wait for the history to load, so their prefilled positions carry on from it. */}
      {!data && <div style={{ fontSize: 12.5, color: 'var(--text-muted)', padding: '10px 0' }}>Loading…</div>}
      {data && kinds.map(kind => (
        <EntryRow key={kind} studentId={student.id} kind={kind} date={date} entries={entries}
          existing={entries.find(e => e.date === date && e.kind === kind)}
          onSaved={async () => { setError(''); await onChanged(); }} onError={setError} />
      ))}
      {error && <div style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 6 }}>{error}</div>}
    </div>
  );
}

function gradeDot(grade) {
  const g = GRADES.find(x => x.key === grade);
  return g ? <span title={g.label} style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: g.color, flexShrink: 0 }} /> : null;
}

// Where a student is up to, with the 30-juz bar for hifz.
export function QuranProgressCard({ student, type, data, onChanged, canEditPrior }) {
  const [editingPrior, setEditingPrior] = useState(false);
  const [error, setError] = useState('');
  const entries = data?.entries || [];
  const priorJuz = data?.priorJuz || [];
  const recent = [...entries].sort((a, b) => b.date.localeCompare(a.date) || a.kind.localeCompare(b.kind)).slice(0, 8);

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
      <div className="card-title" style={{ marginBottom: 12 }}>Qur'an progress</div>
      {headline}
      {error && <div style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 6 }}>{error}</div>}
      {recent.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-soft)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Recent</div>
          {recent.map(e => (
            <div key={`${e.date}-${e.kind}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 12.5 }}>
              {gradeDot(e.grade)}
              <span style={{ width: 70, flexShrink: 0, color: 'var(--text-muted)' }}>{fmtDate(e.date)}</span>
              <span style={{ width: 56, flexShrink: 0, fontWeight: 600 }}>{KIND_LABELS[e.kind]?.name}</span>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.note || undefined}>
                {e.kind === 'lesson' ? e.lesson : rangeLabel(e)}{e.note ? <span className="text-muted"> — {e.note}</span> : null}
              </span>
            </div>
          ))}
        </div>
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
