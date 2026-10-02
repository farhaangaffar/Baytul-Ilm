// pages/ClassesTeachers.js
import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import { LoadingState, ErrorState } from '../components/DataState';
import {
  getClasses, addClass, updateClass, deleteClass,
  getTeachers, addTeacher, updateTeacher, deleteTeacher, reorderTeachers,
  getStudents, getUsers, createUser, updateUser, deleteUser,
} from '../lib/store';
import { Plus, Pencil, Trash2, X, Save, BookOpen, Users, AlertCircle, KeyRound, GripVertical } from 'lucide-react';
import ReorderableGrid from '../components/ReorderableGrid';
import { useAuth } from '../lib/AuthContext';

export default function ClassesTeachers() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('classes');
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

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [classesData, teachersData, studentsData, loginsData] = await Promise.all([getClasses(), getTeachers(), getStudents(), getUsers()]);
      setClasses(classesData); setTeachers(teachersData); setStudents(studentsData); setLogins(loginsData);
    } catch (err) {
      setError(err);
    }
    setLoading(false);
  }, []);

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

  if (loading) return <Layout title="Classes & Teachers"><LoadingState /></Layout>;
  if (error) return <Layout title="Classes & Teachers"><ErrorState error={error} onRetry={load} /></Layout>;

  const activeStudents = students.filter(s => s.status === 'Active').length;
  const unassigned = classes.filter(c => !c.teacherId).length;

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
      if (form.id) { await updateTeacher(form.id, data); showToast('Teacher updated'); }
      else { await addTeacher(data); showToast('Teacher added'); }
      await load();
      setTeacherModal(null);
    } catch (err) {
      showToast(err.message || 'Could not save teacher');
    }
  }

  async function doDelete() {
    try {
      if (confirmDelete.type === 'class') {
        await deleteClass(confirmDelete.item.id);
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
    <Layout title="Classes & Teachers" subtitle="Manage classes and teaching staff">
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        <button className={`btn ${tab === 'classes' ? 'btn-primary' : ''}`} onClick={() => setTab('classes')}>
          <BookOpen size={14} /> Classes ({classes.length})
        </button>
        <button className={`btn ${tab === 'teachers' ? 'btn-primary' : ''}`} onClick={() => setTab('teachers')}>
          <Users size={14} /> Teachers ({teachers.length})
        </button>
      </div>

      <div className="metrics-grid mb-6">
        <div className="metric-card"><div className="metric-icon dark"><BookOpen size={18}/></div><div className="metric-value">{classes.length}</div><div className="metric-label">Classes</div></div>
        <div className="metric-card"><div className="metric-icon teal"><Users size={18}/></div><div className="metric-value">{teachers.length}</div><div className="metric-label">Teachers</div></div>
        <div className="metric-card"><div className="metric-icon green"><Users size={18}/></div><div className="metric-value">{activeStudents}</div><div className="metric-label">Active students</div></div>
        <div className="metric-card"><div className="metric-icon amber"><AlertCircle size={18}/></div><div className="metric-value">{unassigned}</div><div className="metric-label">Unassigned classes</div></div>
      </div>

      {/* Classes tab */}
      {tab === 'classes' && (
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Classes</div>
              <div className="card-sub">{classes.length} classes</div>
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
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Class name</th>
                    <th>Teacher</th>
                    <th>Students</th>
                    <th>Class login</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {classes.map(c => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 500 }}>{c.name}</td>
                      <td className="text-muted text-sm">{teacherName(c.teacherId)}</td>
                      <td className="text-muted text-sm">{studentCountForClass(c.name)} enrolled</td>
                      <td>
                        <LoginButton login={logins.find(l => l.classId === c.id)} onClick={() => setLoginModal({ kind: 'class', item: c })}
                          title="One shared login for this class — whoever teaches it that day can sign in" />
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <button className="btn btn-icon btn-sm" onClick={() => setClassModal({ ...c })}>
                            <Pencil size={13} />
                          </button>
                          <button className="btn btn-icon btn-sm" style={{ color: 'var(--red)' }} onClick={() => setConfirmDelete({ type: 'class', item: c })}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Teachers tab */}
      {tab === 'teachers' && (
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Teachers</div>
              <div className="card-sub">{teachers.length} staff members</div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => setTeacherModal({ name: '', phone: '', email: '', subjectsText: '' })}>
              <Plus size={13} /> Add teacher
            </button>
          </div>
          {teachers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
              No teachers yet — click "Add teacher" to get started.
            </div>
          ) : (
            // One card per teacher — everything visible at once on any screen width,
            // instead of a wide table that scrolls sideways. Drag the grip to reorder.
            <ReorderableGrid
              items={teachers}
              getId={t => t.id}
              className="entity-grid"
              onReordered={async ids => {
                setTeachers(prev => ids.map(id => prev.find(t => t.id === id)).filter(Boolean));
                try { await reorderTeachers(ids); }
                catch (err) { showToast(err.message || 'Could not save the new order'); setTeachers(await getTeachers()); }
              }}
              renderItem={(t, { isDragging, handleProps, cardAttrs }) => {
                const login = logins.find(l => l.teacherId === t.id);
                const theirClasses = classes.filter(c => c.teacherId === t.id).map(c => c.name);
                const subjects = (t.subjects || []).flatMap(s => s.split('/')).map(s => s.trim()).filter(Boolean);
                const row = (label, content) => (
                  <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr', gap: 8, alignItems: 'baseline', padding: '7px 0', borderTop: '1px solid var(--border)', fontSize: 13 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-soft)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
                    <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{content}</div>
                  </div>
                );
                return (
                  <div key={t.id} className={`entity-card ${isDragging ? 'is-dragging' : ''}`} style={{ cursor: 'default' }} {...cardAttrs}>
                    <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
                      {teachers.length > 1 && (
                        <div className="drag-handle" {...handleProps} title="Drag to reorder" style={{ ...handleProps.style, margin: '0 0 0 -8px' }}><GripVertical size={15} /></div>
                      )}
                      <div className="avatar" style={{ width: 32, height: 32, fontSize: 11, flexShrink: 0 }}>
                        {t.name.split(' ').map(w => w[0]).slice(0, 2).join('')}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="entity-card-name">{t.name}</div>
                        <div className="entity-card-sub">{theirClasses.length ? theirClasses.join(', ') : 'No class assigned'}</div>
                      </div>
                      <button className="btn btn-icon btn-sm" title="Edit teacher" onClick={() => setTeacherModal({ ...t, subjectsText: (t.subjects || []).join(', ') })}>
                        <Pencil size={13} />
                      </button>
                      <button className="btn btn-icon btn-sm" title="Delete teacher" style={{ color: 'var(--red)' }} onClick={() => setConfirmDelete({ type: 'teacher', item: t })}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                    {row('Subjects', subjects.length
                      ? <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{subjects.map(s => <span key={s} className="badge badge-gray" style={{ whiteSpace: 'nowrap' }}>{s}</span>)}</div>
                      : <span className="text-muted">—</span>)}
                    {row('Contact', (t.phone || t.email)
                      ? <>{t.phone && <div>{t.phone}</div>}{t.email && <div className="text-muted">{t.email}</div>}</>
                      : <span className="text-muted">—</span>)}
                    {row('Login', (
                      <LoginButton login={login} onClick={() => setLoginModal({ kind: 'teacher', item: t })} title={login ? 'Manage this login' : 'Give this teacher a login'} />
                    ))}
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
                  ? 'Students in this class will keep their existing class label.'
                  : 'This teacher will be unassigned from any classes they teach.'}
              </div>
            </div>
            <div className="modal-footer" style={{ justifyContent: 'center' }}>
              <button className="btn" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={doDelete}><Trash2 size={13} /> Delete</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">✓ {toast}</div>}
    </Layout>
  );
}

function ClassModal({ initial, teachers, onClose, onSave }) {
  const [form, setForm] = useState({ ...initial });
  const isNew = !form.id;
  const isValid = form.name && form.name.trim().length > 0;

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
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Class 1, Class 3, Beginners…"
                autoFocus
              />
            </div>
            <div className="form-group">
              <label>Assigned teacher (optional)</label>
              <select value={form.teacherId || ''} onChange={e => setForm({ ...form, teacherId: e.target.value })}>
                <option value="">— Unassigned —</option>
                {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-teal" disabled={!isValid} onClick={() => onSave(form)}>
            <Save size={13} /> {isNew ? 'Add class' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function TeacherModal({ initial, onClose, onSave }) {
  const [form, setForm] = useState({ ...initial });
  const isNew = !form.id;
  const isValid = form.name && form.name.trim().length > 0;

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <div className="modal-title">{isNew ? 'Add teacher' : `Edit — ${initial.name}`}</div>
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
              <label>Subjects taught</label>
              <input
                value={form.subjectsText || ''}
                onChange={e => setForm({ ...form, subjectsText: e.target.value })}
                placeholder="e.g. Quran, Arabic, Fiqh (separate with commas or /)"
              />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-teal" disabled={!isValid} onClick={() => onSave(form)}>
            <Save size={13} /> {isNew ? 'Add teacher' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// The button on a teacher card or class row that opens its login.
function LoginButton({ login, onClick, title }) {
  return (
    <button className="btn btn-sm" onClick={onClick} title={title} style={{ maxWidth: '100%' }}>
      <KeyRound size={12} style={{ flexShrink: 0 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{login ? login.login : 'Set up login'}</span>
      {login && !login.active && <span className="badge badge-gray" style={{ marginLeft: 4 }}>Off</span>}
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
  const { user } = useAuth();
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
            {kind === 'class'
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
