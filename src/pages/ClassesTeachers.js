// pages/ClassesTeachers.js
import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import { LoadingState, ErrorState } from '../components/DataState';
import {
  getClasses, addClass, updateClass, deleteClass,
  getTeachers, addTeacher, updateTeacher, deleteTeacher,
  getStudents, getUsers, createUser, updateUser, deleteUser,
} from '../lib/store';
import { Plus, Pencil, Trash2, X, Save, BookOpen, Users, AlertCircle, KeyRound } from 'lucide-react';

export default function ClassesTeachers() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('classes');
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [students, setStudents] = useState([]);
  const [logins, setLogins] = useState([]);
  const [loginModal, setLoginModal] = useState(null); // the teacher whose login is being set up / managed

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
    const subjects = (form.subjectsText || '').split(',').map(s => s.trim()).filter(Boolean);
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
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Subjects</th>
                    <th>Phone</th>
                    <th>Email</th>
                    <th>Login</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {teachers.map(t => (
                    <tr key={t.id}>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="avatar" style={{ width: 28, height: 28, fontSize: 10 }}>
                            {t.name.split(' ').map(w => w[0]).slice(0, 2).join('')}
                          </div>
                          <span style={{ fontWeight: 500 }}>{t.name}</span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {(t.subjects || []).map(s => <span key={s} className="badge badge-gray">{s}</span>)}
                          {(!t.subjects || t.subjects.length === 0) && <span className="text-muted text-sm">—</span>}
                        </div>
                      </td>
                      <td className="text-muted text-sm">{t.phone || '—'}</td>
                      <td className="text-muted text-sm">{t.email || '—'}</td>
                      <td>
                        {(() => {
                          const login = logins.find(l => l.teacherId === t.id);
                          return (
                            <button className="btn btn-sm" onClick={() => setLoginModal(t)} title={login ? 'Manage this login' : 'Give this teacher a login'}>
                              <KeyRound size={12} />
                              {login ? <>{login.username}{!login.active && <span className="badge badge-gray" style={{ marginLeft: 4 }}>Off</span>}</> : 'Set up login'}
                            </button>
                          );
                        })()}
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <button className="btn btn-icon btn-sm" onClick={() => setTeacherModal({ ...t, subjectsText: (t.subjects || []).join(', ') })}>
                            <Pencil size={13} />
                          </button>
                          <button className="btn btn-icon btn-sm" style={{ color: 'var(--red)' }} onClick={() => setConfirmDelete({ type: 'teacher', item: t })}>
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

      {/* Teacher login modal */}
      {loginModal && (
        <LoginModal
          teacher={loginModal}
          login={logins.find(l => l.teacherId === loginModal.id) || null}
          classNames={classes.filter(c => c.teacherId === loginModal.id).map(c => c.name)}
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
                placeholder="e.g. Quran, Arabic, Fiqh (comma separated)"
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

// A teacher's login: the owner chooses the username and password and passes them
// on. The teacher then sees only the classes assigned to them on this page.
function LoginModal({ teacher, login, classNames, onClose, onChanged }) {
  const [username, setUsername] = useState(login?.username || '');
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
    if (!login) return run(() => createUser(teacher.id, username, password), `Login created for ${teacher.name}`);
    const changes = {};
    if (username.trim().toLowerCase() !== login.username) changes.username = username;
    if (password) changes.password = password;
    if (!Object.keys(changes).length) { onClose(); return; }
    return run(() => updateUser(login.id, changes), 'Login updated');
  }

  const canSave = login ? (username && (password === '' || password.length >= 8)) : (username && password.length >= 8);

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="modal" style={{ maxWidth: 400 }}>
        <div className="modal-header">
          <div className="modal-title">{login ? 'Login' : 'Set up login'} — {teacher.name}</div>
          <button className="btn btn-icon" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 14 }}>
            {classNames.length
              ? <>They'll see Attendance, Daily records and Fees for <strong>{classNames.join(', ')}</strong> only, and can mark fees as paid but not change amounts.</>
              : <>They don't have a class yet — assign one on the Classes tab, or they'll see no students.</>}
          </div>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label>Username</label>
            <input value={username} onChange={e => { setUsername(e.target.value); setError(''); }} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="e.g. ahmed" />
          </div>
          <div className="form-group" style={{ marginBottom: 6 }}>
            <label>{login ? 'New password (leave blank to keep the current one)' : 'Password (8+ characters)'}</label>
            <input type="text" value={password} onChange={e => { setPassword(e.target.value); setError(''); }} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-soft)' }}>
            {login ? 'Setting a new password signs them out on every device.' : "Pass these on to the teacher — they can change the password themselves once signed in."}
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
