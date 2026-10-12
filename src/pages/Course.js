// pages/Course.js — a Darul Uloom's course (head only): its year groups in order, each
// year's subjects and kitaabs with who teaches them, and moving everyone up a year at the
// end of the year (which can be undone). A year group is an ordinary class with a place in
// the course, so attendance, fees and reports work for it as for any class.
import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import { LoadingState, ErrorState } from '../components/DataState';
import {
  getCourse, addStarterCourse, saveCourseYear, addCourseSubject, updateCourseSubject, deleteCourseSubject,
  moveCourseUp, undoCourseMove, getTeachers, getStudents, deleteClass, formatDateGB,
} from '../lib/store';
import { Plus, X, Save, Trash2, ChevronsUp, Undo2, Library, Pencil } from 'lucide-react';

export default function Course() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [course, setCourse] = useState(null);
  const [teachers, setTeachers] = useState([]);
  const [students, setStudents] = useState([]);
  const [openId, setOpenId] = useState('');  // the year (or other class) opened below the boxes
  const [modal, setModal] = useState(null);  // { kind: 'subject' | 'year' | 'move' | 'undo', … }
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const [c, t, s] = await Promise.all([getCourse(), getTeachers(), getStudents()]);
      setCourse(c); setTeachers(t); setStudents(s);
      setOpenId(prev => (prev && [...c.years, ...c.others].some(y => y.id === prev) ? prev : c.years[0]?.id || ''));
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

  const title = 'Course';
  const subtitle = 'Years, subjects and kitaabs';
  if (loading) return <Layout title={title} subtitle={subtitle}><LoadingState /></Layout>;
  if (error) return <Layout title={title} subtitle={subtitle}><ErrorState error={error} onRetry={load} /></Layout>;

  const { years, others, subjects, lastMove } = course;
  const open = years.find(y => y.id === openId) || others.find(c => c.id === openId);
  const openPlace = open ? years.indexOf(open) + 1 : 0; // 0 = not a course year
  const subjectsOf = id => subjects.filter(s => s.classId === id);
  const newYear = () => setModal({ kind: 'year', year: { name: '', teacherId: '' }, place: years.length + 1 });

  return (
    <Layout title={title} subtitle={subtitle}>
      <div className="course-page">
        {years.length === 0 && (
          <div className="card">
            <div className="card-title" style={{ marginBottom: 6 }}><Library size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />Set up your course years</div>
            <div className="card-sub" style={{ marginBottom: 14 }}>
              Start from the usual Dars-e-Nizami years (1st year to Dawrah al-Hadith) with their kitaabs, or add your own years one by one.
            </div>
            <div className="box-row-2">
              <button type="button" className="course-box action" disabled={busy} onClick={useStarter}>
                <span className="course-box-name">{busy ? 'Adding…' : 'Use the Dars-e-Nizami years'}</span>
                <span className="course-box-sub">7 years with their kitaabs</span>
              </button>
              <button type="button" className="course-box" onClick={newYear}>
                <span className="course-box-name"><Plus size={13} /> Add a year</span>
                <span className="course-box-sub">Start from nothing</span>
              </button>
            </div>
          </div>
        )}

        {/* The years as boxes, first year first — tap one to open it below. */}
        {years.length > 0 && (
          <div className="card">
            <div className="card-title" style={{ marginBottom: 2 }}>Years</div>
            <div className="card-sub" style={{ marginBottom: 12 }}>First year first · tap a year to see its subjects</div>
            <div className="course-box-grid">
              {years.map((y, i) => {
                const n = childrenIn(y.name).length;
                return (
                  <button key={y.id} type="button" className={`course-box ${openId === y.id ? 'on' : ''}`} onClick={() => setOpenId(y.id)}>
                    <span className="course-box-num">{i + 1}</span>
                    <span className="course-box-name">{y.name}</span>
                    <span className="course-box-sub">{n} {n === 1 ? 'student' : 'students'} · {subjectsOf(y.id).length} kitaabs</span>
                  </button>
                );
              })}
              <button type="button" className="course-box add" onClick={newYear}>
                <span className="course-box-name"><Plus size={13} /> Add a year</span>
                <span className="course-box-sub">More years? Add them</span>
              </button>
            </div>
            <div className="box-row-2" style={{ marginTop: 10 }}>
              <button type="button" className="course-box action" onClick={() => setModal({ kind: 'move' })}>
                <span className="course-box-name"><ChevronsUp size={14} /> Move everyone up</span>
                <span className="course-box-sub">End of the year</span>
              </button>
              {lastMove ? (
                <button type="button" className="course-box" onClick={() => setModal({ kind: 'undo' })}>
                  <span className="course-box-name"><Undo2 size={13} /> Undo moving up</span>
                  <span className="course-box-sub">Done {formatDateGB(lastMove.movedOn)} · {lastMove.count} {lastMove.count === 1 ? 'child' : 'children'}</span>
                </button>
              ) : (
                <div className="course-box quiet">
                  <span className="course-box-name">Not moved up yet</span>
                  <span className="course-box-sub">You can undo it after</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* The open year: its details, then each subject and kitaab as a box. */}
        {open && (
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">{open.name}</div>
                <div className="card-sub">
                  {openPlace ? `Year ${openPlace} of ${years.length}` : 'Not one of the course years'}
                  {' · '}{childrenIn(open.name).length} students
                  {teacherName(open.teacherId) ? ` · ${teacherName(open.teacherId)}` : ''}
                </div>
              </div>
              <button className="btn btn-sm" onClick={() => setModal({ kind: 'year', year: open, place: openPlace })}><Pencil size={13} /> Edit</button>
            </div>
            <div className="course-box-grid wide">
              {subjectsOf(open.id).map(s => (
                <button key={s.id} type="button" className="course-box subject" onClick={() => setModal({ kind: 'subject', subject: s, yearName: open.name })}>
                  <span className="course-box-sub top">{s.subject}</span>
                  <span className="course-box-name">{s.kitaab || 'No kitaab yet'}</span>
                  <span className="course-box-sub">{teacherName(s.teacherId) || 'No teacher yet'}</span>
                </button>
              ))}
              <button type="button" className="course-box add" onClick={() => setModal({ kind: 'subject', subject: { classId: open.id, subject: '', kitaab: '', teacherId: '' }, yearName: open.name })}>
                <span className="course-box-name"><Plus size={13} /> Add a subject</span>
                <span className="course-box-sub">Any kitaab</span>
              </button>
            </div>
          </div>
        )}

        {/* Classes outside the course (e.g. Hifdh) — tap to open, or add to the years. */}
        {others.length > 0 && years.length > 0 && (
          <div className="card">
            <div className="card-title" style={{ marginBottom: 2 }}>Other classes</div>
            <div className="card-sub" style={{ marginBottom: 12 }}>Not part of the years (e.g. Hifdh)</div>
            <div className="course-box-grid">
              {others.map(c => (
                <button key={c.id} type="button" className={`course-box ${openId === c.id ? 'on' : ''}`} onClick={() => setOpenId(c.id)}>
                  <span className="course-box-name">{c.name}</span>
                  <span className="course-box-sub">{childrenIn(c.name).length} students</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {modal?.kind === 'subject' && (
        <SubjectModal initial={modal.subject} yearName={modal.yearName} teachers={teachers} kitaabs={course.kitaabs}
          onClose={() => setModal(null)}
          onSaved={async msg => { setModal(null); await load(); showToast(msg); }} />
      )}
      {modal?.kind === 'year' && (
        <YearModal initial={modal.year} place={modal.place} count={years.length} teachers={teachers}
          students={childrenIn(modal.year.name || '\u0000').length} subjects={modal.year.id ? subjectsOf(modal.year.id).length : 0}
          onClose={() => setModal(null)}
          onSaved={async (msg, id) => { setModal(null); if (id) setOpenId(id); await load(); showToast(msg); }} />
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

// Adds a year, or changes one: its name, teacher and place in the course. A year can be
// taken out of the course (it stays a class), or deleted when it has no students.
function YearModal({ initial, place, count, teachers, students, subjects, onClose, onSaved }) {
  const isNew = !initial.id;
  const [f, setF] = useState({ name: initial.name || '', teacherId: initial.teacherId || '', position: isNew ? count + 1 : place });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sure, setSure] = useState(false);
  const set = (k, v) => { setError(''); setF(prev => ({ ...prev, [k]: v })); };
  const places = isNew || !place ? count + 1 : count; // how many places it could take (0 = not one of the years)

  async function run(fn) {
    setBusy(true); setError('');
    try { await fn(); } catch (err) { setError(err.message || 'Something went wrong'); setBusy(false); }
  }
  const save = () => run(async () => {
    const r = await saveCourseYear({ classId: initial.id, name: f.name, teacherId: f.teacherId, position: Number(f.position) });
    await onSaved(isNew ? `${f.name.trim()} added` : 'Saved', r.id);
  });
  const takeOut = () => run(async () => {
    await saveCourseYear({ classId: initial.id, name: f.name, teacherId: f.teacherId, position: 0 });
    await onSaved(`${initial.name} taken out of the years`);
  });
  const remove = () => run(async () => { await deleteClass(initial.id); await onSaved(`${initial.name} deleted`); });

  return (
    <ModalShell title={isNew ? 'Add a year' : `Edit — ${initial.name}`} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
      <button className="btn btn-teal" disabled={busy || !f.name.trim()} onClick={save}>
        <Save size={13} /> {busy ? 'Saving…' : isNew ? 'Add year' : 'Save'}
      </button>
    </>}>
      <div className="form-grid">
        <div className="form-group">
          <label>Name <span className="required">*</span></label>
          <input value={f.name} onChange={e => set('name', e.target.value)} placeholder="e.g. 3rd year, Takmeel" autoFocus={isNew} />
        </div>
        <div className="form-group">
          <label>Place in the course</label>
          <select value={f.position} onChange={e => set('position', e.target.value)}>
            {Array.from({ length: places }, (_, i) => <option key={i} value={i + 1}>Year {i + 1}{i === 0 ? ' (first)' : i === places - 1 ? ' (last)' : ''}</option>)}
            {!isNew && <option value={0}>Not one of the years (e.g. Hifdh)</option>}
          </select>
        </div>
        <div className="form-group">
          <label>Class teacher</label>
          <select value={f.teacherId} onChange={e => set('teacherId', e.target.value)}>
            <option value="">— Not chosen yet —</option>
            {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      </div>
      {!isNew && (
        <div className="box-row-2" style={{ marginTop: 14 }}>
          {place > 0 && (
            <button type="button" className="course-box" disabled={busy} onClick={takeOut}>
              <span className="course-box-name">Take out of the years</span>
              <span className="course-box-sub">It stays as a class</span>
            </button>
          )}
          {students === 0 ? (
            <button type="button" className={`course-box ${sure ? 'danger' : ''}`} disabled={busy} onClick={() => (sure ? remove() : setSure(true))}>
              <span className="course-box-name"><Trash2 size={13} /> {sure ? 'Tap again to delete' : 'Delete this year'}</span>
              <span className="course-box-sub">{subjects ? `and its ${subjects} kitaabs` : 'It has no students'}</span>
            </button>
          ) : (
            <div className="course-box quiet">
              <span className="course-box-name">Can't delete</span>
              <span className="course-box-sub">{students} students are in it</span>
            </div>
          )}
        </div>
      )}
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
