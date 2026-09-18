import React, { useState, useEffect, useCallback } from 'react';
import PortalLayout from './PortalLayout';
import { LoadingState, ErrorState } from '../../components/DataState';
import {
  listMasaajid, createMasjid, updateMasjid, deleteMasjid,
  listPortalUsers, createPortalUser, deletePortalUser,
} from '../../lib/portalApi';
import { Plus, Trash2, Edit2, X, Save, ShieldCheck, UserPlus } from 'lucide-react';

const SECTS = ['unspecified', 'deobandi', 'barelwi', 'ahle_hadith', 'shia', 'other'];
const LANGUAGES = ['unspecified', 'english', 'arabic', 'urdu', 'mixed', 'other'];
const EMPTY_MASJID = {
  name: '', address: '', city: '', postcode: '', country: 'UK',
  sect: 'unspecified', khutbahLanguage: 'unspecified', phone: '', email: '', website: '', verified: false,
};

export default function MasaajidAdmin({ session }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [masaajid, setMasaajid] = useState([]);
  const [users, setUsers] = useState([]);
  const [editing, setEditing] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [newUser, setNewUser] = useState({ masjidId: '', role: 'masjid_admin', email: '', password: '' });
  const [creatingUser, setCreatingUser] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [m, u] = await Promise.all([listMasaajid(), listPortalUsers()]);
      setMasaajid(m); setUsers(u);
    } catch (err) {
      setError(err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 2500); }
  function nameFor(masjidId) { return masaajid.find(m => m.id === masjidId)?.name || masjidId; }

  async function save() {
    setSaving(true);
    try {
      if (editing.id) {
        const { id, ...patch } = editing;
        await updateMasjid(id, patch);
      } else {
        await createMasjid(editing);
      }
      setEditing(null);
      await load();
      showToast('Masjid saved');
    } catch (err) {
      showToast(err.message || 'Could not save masjid');
    }
    setSaving(false);
  }

  async function doDelete(id) {
    try {
      await deleteMasjid(id);
      setConfirmDel(null);
      await load();
      showToast('Masjid removed');
    } catch (err) {
      showToast(err.message || 'Could not remove masjid');
    }
  }

  async function addUser(e) {
    e.preventDefault();
    setCreatingUser(true);
    try {
      await createPortalUser(newUser);
      setNewUser({ masjidId: '', role: 'masjid_admin', email: '', password: '' });
      await load();
      showToast('Portal account created');
    } catch (err) {
      showToast(err.message || 'Could not create account');
    }
    setCreatingUser(false);
  }

  async function removeUser(id) {
    try {
      await deletePortalUser(id);
      await load();
      showToast('Account removed');
    } catch (err) {
      showToast(err.message || 'Could not remove account');
    }
  }

  if (loading) return <PortalLayout title="Masaajid" session={session}><LoadingState /></PortalLayout>;
  if (error) return <PortalLayout title="Masaajid" session={session}><ErrorState error={error} onRetry={load} /></PortalLayout>;

  return (
    <PortalLayout title="Masaajid" subtitle="Manage masaajid, verification, sect and khutbah language" session={session}>
      <div style={{ marginBottom: 12 }}>
        <button className="btn btn-primary" onClick={() => setEditing({ ...EMPTY_MASJID })}><Plus size={14} />Add masjid</button>
      </div>

      {masaajid.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>No masaajid added yet.</div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          {masaajid.map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--page-dark)' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {m.name}
                  {m.verified && <span className="badge badge-green"><ShieldCheck size={11} />Verified</span>}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>
                  {m.city || m.address || 'No address set'} · {m.sect} · khutbah: {m.khutbahLanguage}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button className="btn btn-icon btn-sm" onClick={() => setEditing(m)} title="Edit"><Edit2 size={13} /></button>
                <button className="btn btn-icon btn-sm" style={{ color: 'var(--red)' }} onClick={() => setConfirmDel(m)} title="Remove"><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Portal accounts */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title" style={{ marginBottom: 6 }}>Portal accounts</div>
        <div className="card-sub" style={{ marginBottom: 16 }}>
          Give a masjid its own login so they can update their salaah times and talks.
        </div>

        <div style={{ marginBottom: 16 }}>
          {users.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No portal accounts yet.</div>}
          {users.map(u => (
            <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 'var(--r-md)', background: '#f9fafb', marginBottom: 6 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{u.email}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {u.role === 'super_admin' ? 'Super admin' : `Masjid admin · ${nameFor(u.masjidId)}`}
                </div>
              </div>
              <button className="btn btn-icon btn-sm" style={{ color: 'var(--red)' }} onClick={() => removeUser(u.id)} title="Revoke access"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>

        <div className="form-section-title" style={{ marginBottom: 12 }}><UserPlus size={13} />Add portal account</div>
        <form onSubmit={addUser} className="form-grid form-grid-2">
          <div className="form-group">
            <label>Role</label>
            <select value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value })}>
              <option value="masjid_admin">Masjid admin</option>
              <option value="super_admin">Super admin</option>
            </select>
          </div>
          {newUser.role === 'masjid_admin' && (
            <div className="form-group">
              <label>Masjid</label>
              <select value={newUser.masjidId} onChange={e => setNewUser({ ...newUser, masjidId: e.target.value })}>
                <option value="">Select a masjid…</option>
                {masaajid.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          )}
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input type="password" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <button
              type="submit"
              className="btn btn-teal"
              disabled={creatingUser || !newUser.email || !newUser.password || (newUser.role === 'masjid_admin' && !newUser.masjidId)}
            >
              <Plus size={13} />{creatingUser ? 'Creating…' : 'Create account'}
            </button>
          </div>
        </form>
      </div>

      {/* Add/edit masjid modal */}
      {editing && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setEditing(null)}>
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <div style={{ fontWeight: 600, fontSize: 15 }}>{editing.id ? 'Edit masjid' : 'Add masjid'}</div>
              <button className="btn btn-icon btn-sm" onClick={() => setEditing(null)}><X size={14} /></button>
            </div>
            <div className="modal-body">
              <div className="form-grid form-grid-2">
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label>Name</label>
                  <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} />
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label>Address</label>
                  <input value={editing.address} onChange={e => setEditing({ ...editing, address: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>City</label>
                  <input value={editing.city} onChange={e => setEditing({ ...editing, city: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Postcode</label>
                  <input value={editing.postcode} onChange={e => setEditing({ ...editing, postcode: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Sect / maslak</label>
                  <select value={editing.sect} onChange={e => setEditing({ ...editing, sect: e.target.value })}>
                    {SECTS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Khutbah language</label>
                  <select value={editing.khutbahLanguage} onChange={e => setEditing({ ...editing, khutbahLanguage: e.target.value })}>
                    {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Phone</label>
                  <input value={editing.phone} onChange={e => setEditing({ ...editing, phone: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input value={editing.email} onChange={e => setEditing({ ...editing, email: e.target.value })} />
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label>Website</label>
                  <input value={editing.website} onChange={e => setEditing({ ...editing, website: e.target.value })} />
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" id="verified" checked={!!editing.verified} onChange={e => setEditing({ ...editing, verified: e.target.checked })} style={{ width: 'auto' }} />
                  <label htmlFor="verified" style={{ margin: 0 }}>Verified</label>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving || !editing.name}>
                <Save size={13} />{saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDel && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setConfirmDel(null)}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-body" style={{ textAlign: 'center', paddingTop: 28 }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--red-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <Trash2 size={24} color="var(--red)" />
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Remove {confirmDel.name}?</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Its salaah times, talks and any portal accounts for it will also be removed. This cannot be undone.</div>
            </div>
            <div className="modal-footer" style={{ justifyContent: 'center' }}>
              <button className="btn" onClick={() => setConfirmDel(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => doDelete(confirmDel.id)}><Trash2 size={13} />Remove</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">✓ {toast}</div>}
    </PortalLayout>
  );
}
