import React, { useState, useEffect, useCallback } from 'react';
import { getUsers, createUser, updateUser, deleteUser } from '../lib/store';
import { useSettings } from '../lib/SettingsContext';
import { useAuth } from '../lib/AuthContext';
import { KeyRound, Trash2, Save } from 'lucide-react';

// On a student's profile (Students page): the family's parent-portal logins. A login
// covers each of that parent's children, and each parent can have their own login (both
// see the same children). Only children sharing a parent's phone number are listed (and
// ticked) — a shared surname isn't the same family. The owner sets a username and password and passes them on with the madrasah code.

const digits = p => String(p || '').replace(/\D/g, '');

// Brothers and sisters: current children sharing one of this child's parent phone numbers.
function siblingsOf(student, students) {
  const phones = [digits(student.parent1Phone), digits(student.parent2Phone)].filter(p => p.length >= 6);
  return students.filter(s => s.id !== student.id && s.status !== 'Inactive'
    && phones.some(p => p === digits(s.parent1Phone) || p === digits(s.parent2Phone)));
}

const field = { padding: '8px 10px', border: 'none', borderRadius: 'var(--r-md)', background: '#f9fafb', fontFamily: 'var(--font)', fontSize: 13, width: '100%', boxSizing: 'border-box' };

export default function ParentLogin({ student, students }) {
  const settings = useSettings();
  const { user } = useAuth();
  const [logins, setLogins] = useState(null);
  const [editing, setEditing] = useState(null); // null | 'new' | login id
  const [form, setForm] = useState({ login: '', password: '', studentIds: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);

  const load = useCallback(async () => {
    try { setLogins((await getUsers()).filter(u => u.role === 'parent' && u.studentIds.includes(student.id))); }
    catch { setLogins([]); }
  }, [student.id]);
  useEffect(() => { load(); }, [load]);

  const family = siblingsOf(student, students);
  const nameOf = id => { const s = students.find(x => x.id === id); return s ? s.forename : 'a student'; };

  // A first login is suggested for parent 1; a second one (the other parent) for parent 2,
  // seeing the same children as the first.
  function startNew() {
    setEditing('new'); setError(''); setConfirmRemove(false);
    const taken = new Set((logins || []).map(l => l.login));
    const login = [digits(student.parent1Phone), digits(student.parent2Phone)].find(p => p && !taken.has(p))
      || (taken.size ? '' : student.surname.toLowerCase().replace(/[^a-z0-9]/g, ''));
    const studentIds = logins?.length ? [...new Set(logins.flatMap(l => l.studentIds))] : [student.id, ...family.map(s => s.id)];
    setForm({ login, password: '', studentIds });
  }
  function startEdit(l) {
    setEditing(l.id); setError(''); setConfirmRemove(false);
    setForm({ login: l.login, password: '', studentIds: l.studentIds });
  }
  const toggleChild = id => setForm(f => ({ ...f, studentIds: f.studentIds.includes(id) ? f.studentIds.filter(x => x !== id) : [...f.studentIds, id] }));

  async function run(fn) {
    setBusy(true); setError('');
    try { await fn(); setEditing(null); await load(); }
    catch (err) { setError(err.message || 'Something went wrong'); }
    setBusy(false);
  }
  function save() {
    if (editing === 'new') return run(() => createUser({ kind: 'parent', ...form }));
    const changes = { studentIds: form.studentIds };
    const current = logins.find(l => l.id === editing);
    if (form.login.trim().toLowerCase() !== current.login) changes.login = form.login;
    if (form.password) changes.password = form.password;
    return run(() => updateUser(editing, changes));
  }

  // The children shown as tick boxes: this student, their brothers and sisters, and anyone already linked.
  const candidates = [student, ...family];
  form.studentIds.forEach(id => { if (!candidates.some(c => c.id === id)) { const s = students.find(x => x.id === id); if (s) candidates.push(s); } });
  const canSave = form.login.trim() && form.studentIds.length && (editing === 'new' ? form.password.length >= 8 : (form.password === '' || form.password.length >= 8));

  return (
    <div style={{ marginBottom: 16 }}>
      <div className="form-section-title" style={{ marginBottom: 10 }}>Parent portal login</div>
      {!settings.parentPortal && (
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 8 }}>
          The parent portal is switched off — turn it on in Settings before parents can sign in.
        </div>
      )}
      {logins === null && <div className="text-muted text-sm">Loading…</div>}
      {logins && logins.map(l => editing !== l.id && (
        <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f3f4f6', borderRadius: 'var(--r-md)', padding: '8px 12px', marginBottom: 6, fontSize: 13 }}>
          <KeyRound size={13} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong>{l.login}</strong>{!l.active && <span className="badge badge-gray" style={{ marginLeft: 6 }}>Off</span>}
            <div className="text-muted" style={{ fontSize: 12 }}>For {l.studentIds.map(nameOf).join(', ')}</div>
          </div>
          <button className="btn btn-sm" onClick={() => startEdit(l)}>Manage</button>
        </div>
      ))}
      {logins && !editing && (
        <button className="btn btn-sm" onClick={startNew}><KeyRound size={12} />{logins.length ? "Add the other parent's login" : 'Set up parent login'}</button>
      )}
      {editing && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: 12, display: 'grid', gap: 8 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Username (their mobile number works well)</label>
            <input value={form.login} onChange={e => setForm({ ...form, login: e.target.value })} style={field} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>{editing === 'new' ? 'Password (8+ characters)' : 'New password (leave blank to keep it)'}</label>
            <input type="text" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} style={field} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-soft)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Children this login sees</div>
            {candidates.map(c => (
              <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '3px 0', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.studentIds.includes(c.id)} onChange={() => toggleChild(c.id)} />
                {c.forename} {c.surname} <span className="text-muted">· {c.class}</span>
              </label>
            ))}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-soft)' }}>
            Pass the username and password to the parent{user?.madrasah?.code ? <>, with the madrasah code <strong style={{ color: 'var(--ink)' }}>{user.madrasah.code}</strong></> : ''}. They'll see attendance, fees, finished reports and Qur'an progress, and can report an absence.
          </div>
          {error && <div style={{ fontSize: 12.5, color: 'var(--red)' }}>{error}</div>}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className="btn btn-primary btn-sm" onClick={save} disabled={busy || !canSave}><Save size={12} />{busy ? 'Saving…' : editing === 'new' ? 'Create login' : 'Save'}</button>
            <button className="btn btn-sm" onClick={() => setEditing(null)} disabled={busy}>Cancel</button>
            {editing !== 'new' && (() => {
              const l = logins.find(x => x.id === editing);
              return (
                <>
                  <button className="btn btn-sm" disabled={busy} onClick={() => run(() => updateUser(l.id, { active: !l.active }))}>{l.active ? 'Switch off' : 'Switch on'}</button>
                  {confirmRemove
                    ? <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => run(() => deleteUser(l.id))}><Trash2 size={12} />Yes, remove</button>
                    : <button className="btn btn-sm" style={{ color: 'var(--red)' }} disabled={busy} onClick={() => setConfirmRemove(true)}><Trash2 size={12} />Remove</button>}
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
