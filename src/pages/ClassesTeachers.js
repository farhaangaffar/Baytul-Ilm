// pages/ClassesTeachers.js
import React, { useState } from 'react';
import Layout from '../components/Layout';
import {
  getClasses, addClass, updateClass, deleteClass,
  getTeachers, addTeacher, updateTeacher, deleteTeacher,
  classTeacherName, getStudents,
} from '../lib/store';
import { Plus, Pencil, Trash2, X, Save, BookOpen, Users } from 'lucide-react';

export default function ClassesTeachers() {
  const [tab, setTab] = useState('classes');
  const [classes, setClasses] = useState(() => getClasses());
  const [teachers, setTeachers] = useState(() => getTeachers());
  const [students] = useState(() => getStudents());

  const [classModal, setClassModal] = useState(null);
  const [teacherModal, setTeacherModal] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [toast, setToast] = useState('');

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 2500); }

  function studentCountForClass(name) {
    return students.filter(s => s.class === name).length;
  }

  function saveClass(form) {
    if (form.id) { updateClass(form.id, form); showToast('Class updated'); }
    else { addClass(form); showToast('Class added'); }
    setClasses(getClasses());
    setClassModal(null);
  }

  function saveTeacher(form) {
    const subjects = (form.subjectsText || '').split(',').map(s => s.trim()).filter(Boolean);
    const data = { ...form, subjects };
    delete data.subjectsText;
    if (form.id) { updateTeacher(form.id, data); showToast('Teacher updated'); }
    else { addTeacher(data); showToast('Teacher added'); }
    setTeachers(getTeachers());
    setTeacherModal(null);
  }

  function doDelete() {
    if (confirmDelete.type === 'class') {
      deleteClass(confirmDelete.item.id);
      setClasses(getClasses());
      showToast(`${confirmDelete.item.name} deleted`);
    } else {
      deleteTeacher(confirmDelete.item.id);
      setTeachers(getTeachers());
      showToast(`${confirmDelete.item.name} removed`);
    }
    setConfirmDelete(null);
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
                      <td className="text-muted text-sm">{classTeacherName(c.teacherId)}</td>
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
          <button className="btn btn-rose" disabled={!isValid} onClick={() => onSave(form)}>
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
          <button className="btn btn-rose" disabled={!isValid} onClick={() => onSave(form)}>
            <Save size={13} /> {isNew ? 'Add teacher' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
