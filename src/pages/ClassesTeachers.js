// pages/ClassesTeachers.js
import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import { LoadingState, ErrorState } from '../components/DataState';
import {
  getClasses, addClass, updateClass, deleteClass,
  getTeachers, addTeacher, updateTeacher, deleteTeacher, reorderTeachers,
  getStudents, getUsers, createUser, updateUser, deleteUser, getCourse,
} from '../lib/store';
import { Plus, Pencil, Trash2, X, Save, BookOpen, Users, KeyRound, GripVertical, ChevronDown, ChevronUp } from 'lucide-react';
import BoxRow from '../components/BoxRow';
import ReorderableGrid from '../components/ReorderableGrid';
import { useAuth } from '../lib/AuthContext';
import { CLASS_QURAN_OPTIONS } from '../lib/quran';
import { guessPlace } from '../lib/courseYears';
import { ChoiceBoxes } from '../components/StudentDetails';

export default function ClassesTeachers() {
  const { isDarulUloom } = useAuth();
  const pageTitle = isDarulUloom ? 'Classes & Staff' : 'Classes & Teachers';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // ?tab=teachers opens the Teachers tab (e.g. from the Getting started checklist).
  const [tab, setTab] = useState(() => (new URLSearchParams(window.location.search).get('tab') === 'teachers' ? 'teachers' : 'classes'));
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [students, setStudents] = useState([]);
  const [logins, setLogins] = useState([]);
  // The login being set up / managed: { kind: 'teacher' | 'class', item } — a teacher's
  // own login, or one shared login for a whole class.
  const [loginModal, setLoginModal] = useState(null);

  const [classModal, setClassModal] = useState(null);
  const [teacherModal, setTeacherModal] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [toast, setToast] = useState('');
  const [openId, setOpenId] = useState(''); // the open line: 'c:<class id>' or 't:<teacher id>'
  const [onlyNoTeacher, setOnlyNoTeacher] = useState(false); // the "No teacher" box shows just those classes
  const [courseSubjects, setCourseSubjects] = useState([]); // a Darul Uloom's books, who teaches each

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [classesData, teachersData, studentsData, loginsData, course] = await Promise.all([getClasses(), getTeachers(), getStudents(), getUsers(),
        isDarulUloom ? getCourse().catch(() => null) : null]);
      setClasses(classesData); setTeachers(teachersData); setStudents(studentsData); setLogins(loginsData); setCourseSubjects(course?.subjects || []);
    } catch (err) {
      setError(err);
    }
    setLoading(false);
  }, [isDarulUloom]);

  useEffect(() => { load(); }, [load]);

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 2500); }

  // Students who have left keep their last class, so they're excluded here the
  // same way the Students roster excludes them.
  function studentCountForClass(name) {
    return students.filter(s => s.class === name && s.status !== 'Inactive').length;
  }
  function teacherName(id) {
    if (!id) return 'Unassigned';
    return teachers.find(t => t.id === id)?.name || 'Unassigned';
  }

  if (loading) return <Layout title={pageTitle}><LoadingState /></Layout>;
  if (error) return <Layout title={pageTitle}><ErrorState error={error} onRetry={load} /></Layout>;

  const activeStudents = students.filter(s => s.status === 'Active').length;
  // Classes with no teacher. A Darul Uloom's Aalim years don't count: with no report writer,
  // the head writes their reports.
  const needsTeacher = c => !c.teacherId && !(isDarulUloom && c.courseOrder);
  const unassigned = classes.filter(needsTeacher).length;
  const shownClasses = onlyNoTeacher ? classes.filter(needsTeacher) : classes;

  async function saveClass(form) {
    try {
      if (form.id) { await updateClass(form.id, form); showToast('Class updated'); }
      else { await addClass(form); showToast('Class added'); }
      await load();
      setClassModal(null);
    } catch (err) {
      showToast(err.message || 'Could not save class');
    }
  }

  async function saveTeacher(form) {
    // Commas or slashes both separate subjects ("Qaa'idah / Qur'aan, Fiqh").
    const subjects = (form.subjectsText || '').split(/[,/]/).map(s => s.trim()).filter(Boolean);
    const data = { ...form, subjects };
    delete data.subjectsText;
    try {
      if (form.id) { await updateTeacher(form.id, data); showToast(isDarulUloom ? 'Saved' : 'Teacher updated'); }
      else { await addTeacher(data); showToast(isDarulUloom ? 'Staff member added' : 'Teacher added'); }
      await load();
      setTeacherModal(null);
    } catch (err) {
      showToast(err.message || 'Could not save');
    }
  }

  async function doDelete() {
    try {
      if (confirmDelete.type === 'class') {
        await deleteClass(confirmDelete.item.id, confirmDelete.moveTo);
        showToast(`${confirmDelete.item.name} deleted`);
      } else {
        await deleteTeacher(confirmDelete.item.id);
        showToast(`${confirmDelete.item.name} removed`);
      }
      await load();
      setConfirmDelete(null);
    } catch (err) {
      showToast(err.message || 'Could not delete');
    }
  }

  return (
    <Layout title={pageTitle} subtitle={isDarulUloom ? 'Manage classes and staff' : 'Manage classes and teaching staff'}>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        <button className={`btn ${tab === 'classes' ? 'btn-primary' : ''}`} onClick={() => setTab('classes')}>
          <BookOpen size={14} /> Classes ({classes.length})
        </button>
        <button className={`btn ${tab === 'teachers' ? 'btn-primary' : ''}`} onClick={() => setTab('teachers')}>
          <Users size={14} /> {isDarulUloom ? 'Staff' : 'Teachers'} ({teachers.length})
        </button>
      </div>

      {/* The figures in one row of small grey boxes */}
      <BoxRow columns="repeat(4, minmax(0, 1fr))" cells={[
        { text: String(classes.length), sub: 'Classes', className: 'ct-figure' },
        { text: String(teachers.length), sub: isDarulUloom ? 'Staff' : 'Teachers', className: 'ct-figure' },
        { text: String(activeStudents), sub: 'Students', className: 'ct-figure' },
        unassigned
          ? { text: String(unassigned), sub: 'No teacher', tone: 'amber', onClick: () => { setTab('classes'); setOnlyNoTeacher(true); setOpenId(''); } }
          : { text: '0', sub: 'No teacher', className: 'ct-figure' },
      ]} />
      <div style={{ height: 12 }} />

      {/* Classes tab: one line per class (name, course or Qur'aan level, students); tap to open
          its teacher, students and login underneath, with Edit and Delete. */}
      {tab === 'classes' && (
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Classes</div>
              <div className="card-sub">{classes.length} {classes.length === 1 ? 'class' : 'classes'}</div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => setClassModal({ name: '', teacherId: '' })}>
              <Plus size={13} /> Add class
            </button>
          </div>
          {classes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
              No classes yet — click "Add class" to create one.
            </div>
          ) : (
            <div className="course-lines">
              {onlyNoTeacher && (
                <button type="button" className="line-row on" style={{ justifyContent: 'space-between' }} onClick={() => setOnlyNoTeacher(false)}>
                  <span>{shownClasses.length} with no teacher</span><span style={{ fontWeight: 600 }}>Show all</span>
                </button>
              )}
              {shownClasses.map(c => {
                const on = openId === `c:${c.id}`;
                const n = studentCountForClass(c.name);
                const kind = c.courseOrder ? `Aalim · year ${c.courseOrder}`
                  : CLASS_QURAN_OPTIONS[c.quranType] ? (c.quranType === 'mixed' ? "Qur'aan (mixed)" : CLASS_QURAN_OPTIONS[c.quranType]) : '';
                return (
                  <React.Fragment key={c.id}>
                    <button type="button" className={`line-row ${on ? 'on' : ''}`} onClick={() => setOpenId(on ? '' : `c:${c.id}`)}>
                      <span className="ct-two">
                        <span className="line-row-name">{c.name}</span>
                        <span className="line-row-sub">{[kind, `${n} ${n === 1 ? 'student' : 'students'}`].filter(Boolean).join(' · ')}</span>
                      </span>
                      {needsTeacher(c) && <span className="applied-tag check" style={{ marginLeft: 0 }}>No teacher</span>}
                      {on ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    {on && (
                      <div className="course-open">
                        <div className="box-row-3">
                          <InfoBox value={c.teacherId ? teacherName(c.teacherId) : 'None yet'} label={isDarulUloom && c.courseOrder ? 'Report writer' : 'Teacher'} />
                          <InfoBox value={n} label={n === 1 ? 'Student' : 'Students'} />
                          <LoginBox login={logins.find(l => l.classId === c.id)} onClick={() => setLoginModal({ kind: 'class', item: c })}
                            title="One shared login for this class — whoever teaches it that day can sign in" />
                        </div>
                        <div className="course-open-actions">
                          <button type="button" className="line-row add" onClick={() => setClassModal({ ...c })}><Pencil size={13} /> Edit {c.name}</button>
                          <button type="button" className="line-row add ct-delete" onClick={() => setConfirmDelete({ type: 'class', item: c })}><Trash2 size={13} /> Delete</button>
                        </div>
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Teachers tab: one line per teacher (name, then what they teach in a few words); tap to
          open their contact details, classes, subjects (in a Darul Uloom, each year's books they
          teach) and login underneath, with Edit and Delete. Drag the grip to reorder. */}
      {tab === 'teachers' && (
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">{isDarulUloom ? 'Staff' : 'Teachers'}</div>
              <div className="card-sub">{teachers.length} {isDarulUloom ? (teachers.length === 1 ? 'member of staff' : 'staff') : (teachers.length === 1 ? 'teacher' : 'teachers')}</div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => setTeacherModal({ name: '', phone: '', email: '', subjectsText: '' })}>
              <Plus size={13} /> {isDarulUloom ? 'Add staff' : 'Add teacher'}
            </button>
          </div>
          {teachers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
              {isDarulUloom ? 'No staff yet — click "Add staff" to get started.' : 'No teachers yet — click "Add teacher" to get started.'}
            </div>
          ) : (
            <ReorderableGrid
              items={teachers}
              getId={t => t.id}
              className="course-lines"
              onReordered={async ids => {
                setTeachers(prev => ids.map(id => prev.find(t => t.id === id)).filter(Boolean));
                try { await reorderTeachers(ids); }
                catch (err) { showToast(err.message || 'Could not save the new order'); setTeachers(await getTeachers()); }
              }}
              renderItem={(t, { isDragging, handleProps, cardAttrs }) => {
                const on = openId === `t:${t.id}`;
                const login = logins.find(l => l.teacherId === t.id);
                const theirClasses = classes.filter(c => c.teacherId === t.id).map(c => c.name);
                const subjects = (t.subjects || []).flatMap(s => s.split('/')).map(s => s.trim()).filter(Boolean);
                // A Darul Uloom: the books they teach, year by year (Aalim course page).
                const books = courseSubjects.filter(x => x.teacherId === t.id)
                  .map(x => ({ ...x, year: classes.find(c => c.id === x.classId) }))
                  .filter(x => x.year).sort((a, b) => (a.year.courseOrder || 99) - (b.year.courseOrder || 99));
                // Under the name: in a Darul Uloom the subjects of the books they teach (from the
                // Aalim course page); in a madrasah their class. With neither, what's there.
                const taught = isDarulUloom ? [...new Set(books.map(x => x.subject))] : theirClasses;
                const summary = (taught.length ? taught : isDarulUloom ? theirClasses : subjects).join(', ') || 'No class yet';
                return (
                  <div key={t.id} className={isDragging ? 'is-dragging' : ''} {...cardAttrs}>
                    <div className={`line-row ${on ? 'on' : ''}`} role="button" tabIndex={0} onClick={() => setOpenId(on ? '' : `t:${t.id}`)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenId(on ? '' : `t:${t.id}`); } }}>
                      {teachers.length > 1 && (
                        <span className="drag-handle" {...handleProps} title="Drag to reorder" onClick={e => e.stopPropagation()}
                          style={{ ...handleProps.style, margin: '0 -4px 0 -6px' }}><GripVertical size={15} /></span>
                      )}
                      <span className="ct-two">
                        <span className="line-row-name">{t.name}</span>
                        <span className="line-row-sub">{summary}</span>
                      </span>
                      {on ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                    {on && (
                      <div className="course-open" style={{ marginTop: 6 }}>
                        {/* Phone and email in boxes — tap one to ring or write. */}
                        <div className="ct-contact">
                          <a className="info-box" href={t.phone ? `tel:${t.phone.replace(/\s/g, '')}` : undefined} onClick={t.phone ? undefined : () => setTeacherModal({ ...t, subjectsText: (t.subjects || []).join(', ') })}>
                            <div className="ct-contact-value">{t.phone || 'Add'}</div><div className="info-box-label">Phone</div>
                          </a>
                          <a className="info-box" href={t.email ? `mailto:${t.email}` : undefined} onClick={t.email ? undefined : () => setTeacherModal({ ...t, subjectsText: (t.subjects || []).join(', ') })}>
                            <div className="ct-contact-value">{t.email || 'Add'}</div><div className="info-box-label">Email</div>
                          </a>
                        </div>
                        <div className="box-row-3" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                          <InfoBox value={theirClasses.length || '—'} label={isDarulUloom ? 'Report writer' : theirClasses.length === 1 ? 'Class' : 'Classes'} />
                          <LoginBox login={login} onClick={() => setLoginModal({ kind: 'teacher', item: t })} title={login ? 'Manage this login' : 'Give them a login'} />
                        </div>
                        {isDarulUloom && t.boardingDuty && <div className="line-row ct-detail"><span className="course-kitaab-subject">Boarding</span><span className="line-row-name">On boarding duty</span></div>}
                        {isDarulUloom && t.maintenanceDuty && <div className="line-row ct-detail"><span className="course-kitaab-subject">Maintenance</span><span className="line-row-name">Sees the maintenance list</span></div>}
                        {theirClasses.map(name => (
                          <div key={name} className="line-row ct-detail"><span className="course-kitaab-subject">{isDarulUloom ? 'Report writer' : 'Class teacher'}</span><span className="line-row-name">{name}</span></div>
                        ))}
                        {isDarulUloom ? books.map(x => (
                          <div key={x.id} className="line-row ct-detail">
                            <span className="course-kitaab-subject">{x.year.name}</span>
                            <span className="line-row-name">{x.subject}{x.kitaab ? <span className="ct-book"> · {x.kitaab}</span> : null}</span>
                          </div>
                        )) : subjects.length > 0 && (
                          <div className="ct-chips">{subjects.map(x => <span key={x}>{x}</span>)}</div>
                        )}
                        <div className="course-open-actions">
                          <button type="button" className="line-row add" onClick={() => setTeacherModal({ ...t, subjectsText: (t.subjects || []).join(', ') })}><Pencil size={13} /> Edit {t.name.split(' ').slice(-2).join(' ')}</button>
                          <button type="button" className="line-row add ct-delete" onClick={() => setConfirmDelete({ type: 'teacher', item: t })}><Trash2 size={13} /> Delete</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              }}
            />
          )}
        </div>
      )}

      {/* Teacher or class login modal */}
      {loginModal && (
        <LoginModal
          kind={loginModal.kind}
          item={loginModal.item}
          login={logins.find(l => loginModal.kind === 'class' ? l.classId === loginModal.item.id : l.teacherId === loginModal.item.id) || null}
          classNames={loginModal.kind === 'class' ? [loginModal.item.name] : classes.filter(c => c.teacherId === loginModal.item.id).map(c => c.name)}
          onClose={() => setLoginModal(null)}
          onChanged={async msg => { setLogins(await getUsers()); showToast(msg); }}
        />
      )}

      {/* Class modal */}
      {classModal !== null && (
        <ClassModal
          initial={classModal}
          teachers={teachers}
          yearCount={classes.filter(c => c.courseOrder).length}
          onClose={() => setClassModal(null)}
          onSave={saveClass}
        />
      )}

      {/* Teacher modal */}
      {teacherModal !== null && (
        <TeacherModal
          initial={teacherModal}
          onClose={() => setTeacherModal(null)}
          onSave={saveTeacher}
        />
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setConfirmDelete(null)}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-body" style={{ textAlign: 'center', paddingTop: 28 }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--red-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <Trash2 size={24} color="var(--red)" />
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Delete {confirmDelete.item.name}?</div>
              <div className="text-muted text-sm">
                {confirmDelete.type === 'class'
                  ? (studentCountForClass(confirmDelete.item.name) ? `Its ${studentCountForClass(confirmDelete.item.name)} ${studentCountForClass(confirmDelete.item.name) === 1 ? 'child moves' : 'children move'} to:` : 'It has no children.')
                  : 'They will be taken off any classes they teach.'}
              </div>
              {/* A class's children always go somewhere — never left in a class that no longer exists. */}
              {confirmDelete.type === 'class' && studentCountForClass(confirmDelete.item.name) > 0 && (
                <div className="waiting-move" style={{ margin: '12px auto 0', maxWidth: 280 }}>
                  <select value={confirmDelete.moveTo || ''} onChange={e => setConfirmDelete(d => ({ ...d, moveTo: e.target.value }))}>
                    <option value="">Select class…</option>
                    {classes.filter(c => c.id !== confirmDelete.item.id).map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    <option value="Waiting list">Waiting list</option>
                  </select>
                </div>
              )}
            </div>
            <div className="modal-footer" style={{ justifyContent: 'center' }}>
              <button className="btn" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={doDelete}
                disabled={confirmDelete.type === 'class' && studentCountForClass(confirmDelete.item.name) > 0 && !confirmDelete.moveTo}><Trash2 size={13} /> Delete</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">✓ {toast}</div>}
    </Layout>
  );
}

// A Darul Uloom picks each class's course — one of the Aalim years (placed in order), Hifdh,
// Naazhirah, Qaa'idah, mixed Qur'aan levels, or none. A maktab picks its Qur'aan level as before.
const DU_COURSES = [['aalim', 'Aalim'], ['hifz', 'Hifdh'], ['nazira', 'Naazhirah'], ['qaida', "Qaa'idah"], ['mixed', "Mixed Qur'aan levels — set each student"]];

function ClassModal({ initial, teachers, yearCount = 0, onClose, onSave }) {
  const { isDarulUloom } = useAuth();
  const [form, setForm] = useState({ ...initial });
  const wasYear = !!initial.courseOrder;
  const [course, setCourse] = useState(wasYear ? 'aalim' : initial.quranType || (initial.id ? '' : 'aalim')); // a new class starts as an Aalim year
  const [place, setPlace] = useState(initial.courseOrder || guessPlace(initial.name, yearCount));
  const [placePicked, setPlacePicked] = useState(wasYear);
  const isNew = !form.id;
  const isValid = form.name && form.name.trim().length > 0;
  const aalim = isDarulUloom && course === 'aalim';
  const places = wasYear ? yearCount : yearCount + 1; // the places it could take in the Aalim years
  const setName = name => { setForm({ ...form, name }); if (!placePicked) setPlace(guessPlace(name, yearCount)); };
  const save = () => onSave(isDarulUloom
    ? { ...form, quranType: aalim ? '' : course, coursePlace: aalim ? Number(place) : wasYear ? 0 : undefined }
    : form);

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-header">
          <div className="modal-title">{isNew ? 'Add class' : `Edit — ${initial.name}`}</div>
          <button className="btn btn-icon" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="form-group">
              <label>Class name <span className="required">*</span></label>
              <input
                value={form.name}
                onChange={e => setName(e.target.value)}
                placeholder={isDarulUloom ? 'e.g. 1st year, Hifdh, Qaa\'idah' : 'e.g. Class 1, Class 3, Beginners…'}
                autoFocus
              />
            </div>
            {isDarulUloom ? <>
              <div className="form-group">
                <label>Course</label>
                <select value={course} onChange={e => setCourse(e.target.value)}>
                  {DU_COURSES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                  <option value="">Something else</option>
                </select>
              </div>
              {aalim && (
                <div className="form-group">
                  <label>Place in the Aalim years</label>
                  <select value={place} onChange={e => { setPlacePicked(true); setPlace(e.target.value); }}>
                    {Array.from({ length: Math.max(1, places) }, (_, i) => (
                      <option key={i} value={i + 1}>Year {i + 1}{i === 0 ? ' (first)' : i === places - 1 ? ' (last)' : ''}</option>
                    ))}
                  </select>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Its books are on the Aalim course page.</span>
                </div>
              )}
            </> : null}
            <div className="form-group">
              <label>{aalim ? 'Report writer' : 'Assigned teacher (optional)'}</label>
              <select value={form.teacherId || ''} onChange={e => setForm({ ...form, teacherId: e.target.value })}>
                <option value="">{aalim ? 'The head' : '— Unassigned —'}</option>
                {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            {!isDarulUloom && (
            <div className="form-group">
              <label>Qur'aan</label>
              <select value={form.quranType || ''} onChange={e => setForm({ ...form, quranType: e.target.value })}>
                <option value="">— Not tracked —</option>
                {Object.entries(CLASS_QURAN_OPTIONS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                Hifdh tracks Hifdh Jadeed (new lesson), Muraaja'ah Qareebah (recent revision) and Muraaja'ah (older revision); Naazhirah where they read to; Qaa'idah the lesson. Choose Mixed if the class has all three — each student's level is then set on Daily records (and can be changed for any student as they move up).
              </span>
            </div>
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-teal" disabled={!isValid} onClick={save}>
            <Save size={13} /> {isNew ? 'Add class' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function TeacherModal({ initial, onClose, onSave }) {
  const { isDarulUloom } = useAuth();
  const [form, setForm] = useState({ ...initial });
  const isNew = !form.id;
  const isValid = form.name && form.name.trim().length > 0;

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <div className="modal-title">{isNew ? (isDarulUloom ? 'Add a member of staff' : 'Add teacher') : `Edit — ${initial.name}`}</div>
          <button className="btn btn-icon" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="form-group">
              <label>Full name <span className="required">*</span></label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Ustadh Ibrahim" autoFocus />
            </div>
            <div className="form-grid form-grid-2">
              <div className="form-group">
                <label>Phone</label>
                <input value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
            </div>
            <div className="form-group">
              <label>Subjects taught{isDarulUloom ? ' (if they teach)' : ''}</label>
              <input
                value={form.subjectsText || ''}
                onChange={e => setForm({ ...form, subjectsText: e.target.value })}
                placeholder="e.g. Quran, Arabic, Fiqh (separate with commas or /)"
              />
            </div>
            {/* A Darul Uloom: teachers on boarding duty also get the Boarding page. */}
            {isDarulUloom && (
              <div className="form-group">
                <label>Boarding duty</label>
                <ChoiceBoxes options={['Yes', 'No']} value={form.boardingDuty ? 'Yes' : 'No'} onChange={v => setForm({ ...form, boardingDuty: v === 'Yes' })} />
              </div>
            )}
            {/* …and those ticked Maintenance get the Maintenance page (things to fix around the school). */}
            {isDarulUloom && (
              <div className="form-group">
                <label>Maintenance</label>
                <ChoiceBoxes options={['Yes', 'No']} value={form.maintenanceDuty ? 'Yes' : 'No'} onChange={v => setForm({ ...form, maintenanceDuty: v === 'Yes' })} />
              </div>
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-teal" disabled={!isValid} onClick={() => onSave(form)}>
            <Save size={13} /> {isNew ? (isDarulUloom ? 'Add' : 'Add teacher') : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// One grey box on a class or teacher card: a value with its label underneath.
function InfoBox({ value, label }) {
  return (
    <div className="info-box">
      <div style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{value}</div>
      <div className="info-box-label">{label}</div>
    </div>
  );
}

// The box on a teacher or class card that opens its login.
function LoginBox({ login, onClick, title }) {
  return (
    <button type="button" className="info-box info-box-button" onClick={onClick} title={title}>
      <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, minWidth: 0, maxWidth: '100%' }}>
        <KeyRound size={12} style={{ flexShrink: 0 }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{login ? login.login : 'Set up'}</span>
      </div>
      <div className="info-box-label">{login && !login.active ? 'Login off' : 'Login'}</div>
    </button>
  );
}

// "Class 3B" → "class3b": a suggested username for a shared class login.
function suggestUsername(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

// A login, set up by the owner: either a teacher's own (covering the classes assigned
// to them) or one shared login for a whole class, so whoever is teaching it that day
// can sign in. The owner sets a username (or email address) and a password and passes
// them on, with the madrasah's code for the first sign-in on each device.
function LoginModal({ kind, item, login, classNames, onClose, onChanged }) {
  const { user, isDarulUloom } = useAuth();
  const madrasahCode = user?.madrasah?.code;
  const [loginName, setLoginName] = useState(login?.login || (kind === 'class' ? suggestUsername(item.name) : (item.email || '')));
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  async function run(fn, msg) {
    setSaving(true); setError('');
    try { await fn(); await onChanged(msg); onClose(); }
    catch (err) { setError(err.message || 'Something went wrong'); setSaving(false); }
  }

  function save() {
    if (!login) {
      const owner = kind === 'class' ? { classId: item.id } : { teacherId: item.id };
      return run(() => createUser({ ...owner, login: loginName, password }), `Login created for ${item.name}`);
    }
    const changes = {};
    if (loginName.trim().toLowerCase() !== login.login) changes.login = loginName;
    if (password) changes.password = password;
    if (!Object.keys(changes).length) { onClose(); return; }
    return run(() => updateUser(login.id, changes), 'Login updated');
  }

  const canSave = login ? (loginName && (password === '' || password.length >= 8)) : (loginName && password.length >= 8);

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="modal" style={{ maxWidth: 400 }}>
        <div className="modal-header">
          <div className="modal-title">{login ? 'Login' : 'Set up login'} — {item.name}</div>
          <button className="btn btn-icon" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 14 }}>
            {kind !== 'class' && isDarulUloom
              ? <>They'll see their timetable and exam papers, and take attendance and behaviour for the Aalim years they teach{classNames.length ? <> and <strong>{classNames.join(', ')}</strong></> : ''}.</>
              : kind === 'class'
              ? <>One login for <strong>{item.name}</strong>, shared by whoever is teaching it — handy when a teacher is off. It sees Attendance, Daily records and Fees for this class only, and can mark fees as paid but not change amounts.</>
              : classNames.length
                ? <>They'll see Attendance, Daily records and Fees for <strong>{classNames.join(', ')}</strong> only, and can mark fees as paid but not change amounts.</>
                : <>They don't have a class yet — assign one on the Classes tab, or they'll see no students.</>}
          </div>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label>Username or email address</label>
            <input value={loginName} onChange={e => { setLoginName(e.target.value); setError(''); }} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder={kind === 'class' ? 'e.g. class1' : 'e.g. ahmed or ahmed@gmail.com'} />
          </div>
          <div className="form-group" style={{ marginBottom: 6 }}>
            <label>{login ? 'New password (leave blank to keep the current one)' : 'Password (8+ characters)'}</label>
            <input type="text" value={password} onChange={e => { setPassword(e.target.value); setError(''); }} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-soft)' }}>
            {login ? 'Setting a new password signs them out on every device.' : (kind === 'class'
              ? 'Pass these on to the teachers who cover this class.'
              : 'Pass these on to the teacher — they can change the password themselves once signed in.')}
            {madrasahCode && <> On a new device they'll also need the madrasah code <strong style={{ color: 'var(--ink)' }}>{madrasahCode}</strong>.</>}
          </div>
          {error && <div style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 10 }}>{error}</div>}

          {login && (
            <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-sm" disabled={saving}
                onClick={() => run(() => updateUser(login.id, { active: !login.active }), login.active ? 'Login switched off' : 'Login switched back on')}>
                {login.active ? 'Switch off access' : 'Switch access back on'}
              </button>
              {confirmRemove ? (
                <button className="btn btn-sm btn-danger" disabled={saving} onClick={() => run(() => deleteUser(login.id), 'Login removed')}>
                  <Trash2 size={12} /> Yes, remove login
                </button>
              ) : (
                <button className="btn btn-sm" style={{ color: 'var(--red)' }} disabled={saving} onClick={() => setConfirmRemove(true)}>
                  <Trash2 size={12} /> Remove login
                </button>
              )}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || !canSave}>
            <Save size={13} />{saving ? 'Saving…' : (login ? 'Save' : 'Create login')}
          </button>
        </div>
      </div>
    </div>
  );
}
