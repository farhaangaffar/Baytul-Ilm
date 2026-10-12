// pages/Course.js — a Darul Uloom's course (head only): its year groups in order, each
// year's subjects and kitaabs with who teaches them, and moving everyone up a year at the
// end of the year (which can be undone). A year group is an ordinary class with a place in
// the course, so attendance, fees and reports work for it as for any class.
import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import { LoadingState, ErrorState } from '../components/DataState';
import {
  getCourse, addStarterCourse, setCourseYears, addCourseSubject, updateCourseSubject, deleteCourseSubject,
  moveCourseUp, undoCourseMove, getTeachers, getStudents, formatDateGB,
} from '../lib/store';
import { Plus, X, Save, Trash2, ArrowUp, ArrowDown, ChevronsUp, Undo2, ListOrdered, Library, Users } from 'lucide-react';

export default function Course() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [course, setCourse] = useState(null);
  const [teachers, setTeachers] = useState([]);
  const [students, setStudents] = useState([]);
  const [modal, setModal] = useState(null); // { kind: 'subject' | 'years' | 'move' | 'undo', … }
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const [c, t, s] = await Promise.all([getCourse(), getTeachers(), getStudents()]);
      setCourse(c); setTeachers(t); setStudents(s);
    } catch (err) { setError(err); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000); }
  const teacherName = id => teachers.find(t => t.id === id)?.name || '';
  const active = students.filter(s => s.status === 'Active');
  const childrenIn = name => active.filter(s => s.class === name);

  async function useStarter() {
    setBusy(true);
    try { await addStarterCourse(); await load(); showToast('Dars-e-Nizami years added — change anything you like'); }
    catch (err) { showToast(err.message || 'Could not add them'); }
    setBusy(false);
  }

  if (loading) return <Layout title="Course" subtitle="Year groups, subjects and kitaabs"><LoadingState /></Layout>;
  if (error) return <Layout title="Course" subtitle="Year groups, subjects and kitaabs"><ErrorState error={error} onRetry={load} /></Layout>;

  const { years, others, subjects, lastMove } = course;

  return (
    <Layout title="Course" subtitle="Year groups, subjects and kitaabs">
      <div className="student-page course-page">
        {years.length === 0 ? (
          <div className="card">
            <div className="card-title" style={{ marginBottom: 6 }}><Library size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />Set up your course years</div>
            <div className="card-sub" style={{ marginBottom: 14 }}>
              Start from the usual Dars-e-Nizami years (1st year to Dawrah al-Hadith) with their subjects and kitaabs, then change anything to suit you.
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" disabled={busy} onClick={useStarter}><Plus size={14} />{busy ? 'Adding…' : 'Use the Dars-e-Nizami years'}</button>
              {others.length > 0 && <button className="btn" onClick={() => setModal({ kind: 'years' })}><ListOrdered size={14} /> Choose from my classes</button>}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            <button className="btn" onClick={() => setModal({ kind: 'years' })}><ListOrdered size={14} /> Years</button>
            <button className="btn btn-primary" onClick={() => setModal({ kind: 'move' })}><ChevronsUp size={14} /> Move everyone up</button>
          </div>
        )}

        {lastMove && (
          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: '12px 16px' }}>
            <span className="text-muted" style={{ fontSize: 13 }}>Everyone moved up on {formatDateGB(lastMove.movedOn)} ({lastMove.count} {lastMove.count === 1 ? 'child' : 'children'}).</span>
            <button className="btn btn-sm" onClick={() => setModal({ kind: 'undo' })}><Undo2 size={13} /> Undo</button>
          </div>
        )}

        {years.map((y, i) => {
          const list = subjects.filter(s => s.classId === y.id);
          const n = childrenIn(y.name).length;
          return (
            <div key={y.id} className="card course-year">
              <div className="card-header">
                <div>
                  <div className="card-title">{y.name}</div>
                  <div className="card-sub">
                    Year {i + 1} · <Users size={11} style={{ verticalAlign: '-1px' }} /> {n} {n === 1 ? 'student' : 'students'}
                    {y.teacherId && teacherName(y.teacherId) ? ` · ${teacherName(y.teacherId)}` : ''}
                  </div>
                </div>
                <button className="btn btn-sm" onClick={() => setModal({ kind: 'subject', subject: { classId: y.id, subject: '', kitaab: '', teacherId: '' }, yearName: y.name })}>
                  <Plus size={13} /> Subject
                </button>
              </div>
              {list.length === 0 ? (
                <div className="text-muted" style={{ fontSize: 13, padding: '4px 2px 6px' }}>No subjects yet — tap "+ Subject".</div>
              ) : (
                <div className="course-subjects">
                  {list.map(s => (
                    <button key={s.id} type="button" className="course-subject" onClick={() => setModal({ kind: 'subject', subject: s, yearName: y.name })}>
                      <span className="course-subject-name">{s.subject}</span>
                      <span className="course-subject-kitaab">{s.kitaab || <span className="text-muted">No kitaab yet</span>}</span>
                      <span className="course-subject-teacher">{teacherName(s.teacherId) || 'No teacher yet'}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {years.length > 0 && others.length > 0 && (
          <div className="card">
            <div className="card-title" style={{ marginBottom: 4 }}>Other classes</div>
            <div className="card-sub" style={{ marginBottom: 10 }}>Not part of the course years (e.g. Hifdh). Add them with "Years".</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {others.map(c => <span key={c.id} className="badge badge-blue">{c.name} · {childrenIn(c.name).length}</span>)}
            </div>
          </div>
        )}
      </div>

      {modal?.kind === 'subject' && (
        <SubjectModal initial={modal.subject} yearName={modal.yearName} teachers={teachers} kitaabs={course.kitaabs}
          onClose={() => setModal(null)}
          onSaved={async msg => { setModal(null); await load(); showToast(msg); }} />
      )}
      {modal?.kind === 'years' && (
        <YearsModal years={years} others={others} onClose={() => setModal(null)}
          onSaved={async () => { setModal(null); await load(); showToast('Years saved'); }} />
      )}
      {modal?.kind === 'move' && (
        <MoveUpModal years={years} childrenIn={childrenIn} onClose={() => setModal(null)}
          onMoved={async r => {
            setModal(null); await load();
            showToast(`${r.moved} moved up${r.finished ? ` · ${r.finished} finished the course` : ''}`);
          }} />
      )}
      {modal?.kind === 'undo' && (
        <ConfirmModal title="Undo moving up?" confirm="Undo"
          text="Everyone goes back to the year they were in before (and anyone marked as finished comes back). Anyone changed since is left as they are."
          onClose={() => setModal(null)}
          onConfirm={async () => {
            const r = await undoCourseMove();
            setModal(null); await load();
            showToast(r.skipped ? `Put back ${r.restored} · ${r.skipped} changed since, left as they are` : `Put back ${r.restored}`);
          }} />
      )}
      {toast && <div className="toast">✓ {toast}</div>}
    </Layout>
  );
}

function ModalShell({ title, onClose, children, footer, width = 460 }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: width }}>
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button className="btn btn-icon" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-footer">{footer}</div>
      </div>
    </div>
  );
}

// Adds or changes one subject. Any kitaab can be typed; the usual ones for that subject (and any
// this madrasah has typed before) are suggested.
function SubjectModal({ initial, yearName, teachers, kitaabs, onClose, onSaved }) {
  const [f, setF] = useState({ subject: initial.subject || '', kitaab: initial.kitaab || '', teacherId: initial.teacherId || '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isNew = !initial.id;
  const set = (k, v) => { setError(''); setF(prev => ({ ...prev, [k]: v })); };
  const subjectNames = Object.keys(kitaabs).sort();
  const suggestions = kitaabs[f.subject.trim()] || [];

  async function run(fn, msg) {
    setBusy(true); setError('');
    try { await fn(); await onSaved(msg); } catch (err) { setError(err.message || 'Something went wrong'); setBusy(false); }
  }
  const save = () => run(
    () => (isNew ? addCourseSubject({ classId: initial.classId, ...f }) : updateCourseSubject(initial.id, f)),
    isNew ? `${f.subject.trim()} added to ${yearName}` : 'Saved');

  return (
    <ModalShell title={isNew ? `Add a subject — ${yearName}` : `${initial.subject} — ${yearName}`} onClose={onClose} footer={<>
      {!isNew && (
        <button className="btn" style={{ marginRight: 'auto', color: 'var(--red)' }} disabled={busy}
          onClick={() => run(() => deleteCourseSubject(initial.id), `${initial.subject} removed`)}>
          <Trash2 size={13} /> Remove
        </button>
      )}
      <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
      <button className="btn btn-teal" disabled={busy || !f.subject.trim()} onClick={save}>
        <Save size={13} /> {busy ? 'Saving…' : isNew ? 'Add' : 'Save'}
      </button>
    </>}>
      <div className="form-grid">
        <div className="form-group">
          <label>Subject <span className="required">*</span></label>
          <input value={f.subject} onChange={e => set('subject', e.target.value)} list="course-subject-names" placeholder="e.g. Nahw, Fiqh, Hadith" autoFocus={isNew} />
          <datalist id="course-subject-names">{subjectNames.map(s => <option key={s} value={s} />)}</datalist>
        </div>
        <div className="form-group">
          <label>Kitaab</label>
          <input value={f.kitaab} onChange={e => set('kitaab', e.target.value)} list="course-kitaabs" placeholder="Pick one, or type any book" />
          <datalist id="course-kitaabs">{suggestions.map(k => <option key={k} value={k} />)}</datalist>
        </div>
        <div className="form-group">
          <label>Taught by</label>
          <select value={f.teacherId} onChange={e => set('teacherId', e.target.value)}>
            <option value="">— Not chosen yet —</option>
            {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      </div>
      {error && <div style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 10 }}>{error}</div>}
    </ModalShell>
  );
}

// Which classes are course years, in order (first year at the top).
function YearsModal({ years, others, onClose, onSaved }) {
  const [inCourse, setInCourse] = useState(years.map(y => ({ id: y.id, name: y.name })));
  const [out, setOut] = useState(others.map(c => ({ id: c.id, name: c.name })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const move = (i, d) => setInCourse(list => {
    const next = [...list]; const j = i + d;
    if (j < 0 || j >= next.length) return list;
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  const remove = c => { setInCourse(l => l.filter(x => x.id !== c.id)); setOut(l => [...l, c]); };
  const add = c => { setOut(l => l.filter(x => x.id !== c.id)); setInCourse(l => [...l, c]); };

  async function save() {
    setBusy(true); setError('');
    try { await setCourseYears(inCourse.map(c => c.id)); await onSaved(); } catch (err) { setError(err.message || 'Could not save'); setBusy(false); }
  }

  return (
    <ModalShell title="Course years" onClose={onClose} footer={<>
      <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
      <button className="btn btn-teal" disabled={busy} onClick={save}><Save size={13} /> {busy ? 'Saving…' : 'Save'}</button>
    </>}>
      <div className="text-muted" style={{ fontSize: 12.5, marginBottom: 10 }}>First year at the top. Children move down this list when they move up.</div>
      {inCourse.length === 0 && <div className="text-muted" style={{ fontSize: 13, marginBottom: 10 }}>No course years yet — add classes below.</div>}
      <div style={{ display: 'grid', gap: 6, marginBottom: 14 }}>
        {inCourse.map((c, i) => (
          <div key={c.id} className="course-year-row">
            <span className="course-year-num">{i + 1}</span>
            <span style={{ flex: 1, minWidth: 0, fontWeight: 600 }}>{c.name}</span>
            <button className="btn btn-icon" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={14} /></button>
            <button className="btn btn-icon" aria-label="Move down" disabled={i === inCourse.length - 1} onClick={() => move(i, 1)}><ArrowDown size={14} /></button>
            <button className="btn btn-icon" aria-label="Take out of the course" onClick={() => remove(c)}><X size={14} /></button>
          </div>
        ))}
      </div>
      {out.length > 0 && <>
        <div className="form-section-title" style={{ marginBottom: 6 }}>Other classes</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {out.map(c => <button key={c.id} className="btn btn-sm" onClick={() => add(c)}><Plus size={12} /> {c.name}</button>)}
        </div>
      </>}
      {error && <div style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 10 }}>{error}</div>}
    </ModalShell>
  );
}

// End of the year: every child moves up one year; tap a child to keep them back. The last
// year finish the course (marked as left today).
function MoveUpModal({ years, childrenIn, onClose, onMoved }) {
  const [held, setHeld] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toggle = id => setHeld(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const total = years.reduce((t, y) => t + childrenIn(y.name).length, 0);

  async function go() {
    setBusy(true); setError('');
    try { await onMoved(await moveCourseUp([...held])); } catch (err) { setError(err.message || 'Could not move them'); setBusy(false); }
  }

  return (
    <ModalShell title="Move everyone up a year" width={560} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
      <button className="btn btn-primary" disabled={busy || total - held.size <= 0} onClick={go}>
        <ChevronsUp size={14} /> {busy ? 'Moving…' : `Move ${total - held.size} up`}
      </button>
    </>}>
      <div className="text-muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
        Do this at the end of the year. Tap a child to keep them in the same year. You can undo it afterwards.
      </div>
      {years.map((y, i) => {
        const kids = childrenIn(y.name);
        const to = i < years.length - 1 ? years[i + 1].name : null;
        return (
          <div key={y.id} className="course-move-year">
            <div className="course-move-title">
              {y.name} → {to || <span style={{ color: 'var(--teal)' }}>finish the course</span>}
            </div>
            {kids.length === 0 ? <div className="text-muted" style={{ fontSize: 12.5 }}>No students</div> : (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {kids.map(s => (
                  <button key={s.id} type="button" className={`course-kid ${held.has(s.id) ? 'held' : ''}`} onClick={() => toggle(s.id)}>
                    {s.forename} {s.surname}{held.has(s.id) ? ' · stays' : ''}
                  </button>
                ))}
              </div>
            )}
            {!to && kids.length > 0 && <div className="text-muted" style={{ fontSize: 11.5, marginTop: 6 }}>They're marked as left today (kept in Students, with all their records).</div>}
          </div>
        );
      })}
      {error && <div style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 10 }}>{error}</div>}
    </ModalShell>
  );
}

function ConfirmModal({ title, text, confirm, onClose, onConfirm }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <ModalShell title={title} width={420} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
      <button className="btn btn-primary" disabled={busy} onClick={async () => {
        setBusy(true); setError('');
        try { await onConfirm(); } catch (err) { setError(err.message || 'Something went wrong'); setBusy(false); }
      }}>{busy ? 'Working…' : confirm}</button>
    </>}>
      <div style={{ fontSize: 13.5 }}>{text}</div>
      {error && <div style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 10 }}>{error}</div>}
    </ModalShell>
  );
}
