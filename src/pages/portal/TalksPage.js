import React, { useState, useEffect, useCallback } from 'react';
import PortalLayout from './PortalLayout';
import MasjidPicker from './MasjidPicker';
import { LoadingState, ErrorState } from '../../components/DataState';
import { listTalks, createTalk, updateTalk, deleteTalk } from '../../lib/portalApi';
import { formatDateGB } from '../../lib/store';
import { Plus, Trash2, Edit2, X, Save } from 'lucide-react';

const LANGUAGES = ['unspecified', 'english', 'arabic', 'urdu', 'mixed', 'other'];
const EMPTY = { title: '', speaker: '', description: '', language: 'unspecified', date: '', startTime: '', endTime: '' };

export default function TalksPage({ session }) {
  const [masjidId, setMasjidId] = useState(session.role === 'masjid_admin' ? session.masjidId : null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [talks, setTalks] = useState([]);
  const [editing, setEditing] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    if (!masjidId) return;
    setLoading(true); setError(null);
    try { setTalks(await listTalks(masjidId, { all: true })); }
    catch (err) { setError(err); }
    setLoading(false);
  }, [masjidId]);

  useEffect(() => { load(); }, [load]);

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 2500); }

  async function save() {
    setSaving(true);
    try {
      if (editing.id) await updateTalk(masjidId, editing.id, editing);
      else await createTalk(masjidId, editing);
      setEditing(null);
      await load();
      showToast('Talk saved');
    } catch (err) {
      showToast(err.message || 'Could not save talk');
    }
    setSaving(false);
  }

  async function doDelete(id) {
    try {
      await deleteTalk(masjidId, id);
      setConfirmDel(null);
      await load();
      showToast('Talk removed');
    } catch (err) {
      showToast(err.message || 'Could not remove talk');
    }
  }

  return (
    <PortalLayout title="Talks" subtitle="Events and talks taking place at the masjid" session={session}>
      {session.role === 'super_admin' && <MasjidPicker value={masjidId} onChange={setMasjidId} />}

      {!masjidId ? null : (
        <>
          <div style={{ marginBottom: 12 }}>
            <button className="btn btn-primary" onClick={() => setEditing({ ...EMPTY })}><Plus size={14} />Add talk</button>
          </div>

          {loading ? <LoadingState /> : error ? <ErrorState error={error} onRetry={load} /> : talks.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>No talks added yet.</div>
          ) : (
            <div className="card" style={{ padding: 0 }}>
              {talks.map(t => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--page-dark)' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{t.title}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>
                      {formatDateGB(t.date)} · {t.startTime?.slice(0, 5)}{t.endTime ? `–${t.endTime.slice(0, 5)}` : ''}
                      {t.speaker ? ` · ${t.speaker}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="btn btn-icon btn-sm" onClick={() => setEditing(t)} title="Edit"><Edit2 size={13} /></button>
                    <button className="btn btn-icon btn-sm" style={{ color: 'var(--red)' }} onClick={() => setConfirmDel(t)} title="Remove"><Trash2 size={13} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {editing && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setEditing(null)}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <div style={{ fontWeight: 600, fontSize: 15 }}>{editing.id ? 'Edit talk' : 'Add talk'}</div>
              <button className="btn btn-icon btn-sm" onClick={() => setEditing(null)}><X size={14} /></button>
            </div>
            <div className="modal-body">
              <div className="form-grid form-grid-2">
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label>Title</label>
                  <input value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Speaker</label>
                  <input value={editing.speaker} onChange={e => setEditing({ ...editing, speaker: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Language</label>
                  <select value={editing.language} onChange={e => setEditing({ ...editing, language: e.target.value })}>
                    {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Date</label>
                  <input type="date" value={editing.date || ''} onChange={e => setEditing({ ...editing, date: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Start time</label>
                  <input type="time" value={editing.startTime || ''} onChange={e => setEditing({ ...editing, startTime: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>End time (optional)</label>
                  <input type="time" value={editing.endTime || ''} onChange={e => setEditing({ ...editing, endTime: e.target.value })} />
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label>Description</label>
                  <textarea
                    rows={3}
                    style={{ width: '100%', fontFamily: 'var(--font)', fontSize: 13, padding: 10, borderRadius: 'var(--r-md)', border: '1px solid var(--border)' }}
                    value={editing.description}
                    onChange={e => setEditing({ ...editing, description: e.target.value })}
                  />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving || !editing.title || !editing.date || !editing.startTime}>
                <Save size={13} />{saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDel && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setConfirmDel(null)}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-body" style={{ textAlign: 'center', paddingTop: 28 }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--red-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <Trash2 size={24} color="var(--red)" />
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Remove "{confirmDel.title}"?</div>
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
