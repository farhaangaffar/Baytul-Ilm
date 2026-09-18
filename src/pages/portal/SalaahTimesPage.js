import React, { useState, useEffect, useCallback } from 'react';
import PortalLayout from './PortalLayout';
import MasjidPicker from './MasjidPicker';
import { LoadingState, ErrorState } from '../../components/DataState';
import { getSalaahTimes, updateSalaahTimes } from '../../lib/portalApi';
import { Save } from 'lucide-react';

const PRAYERS = [
  { key: 'fajr', label: 'Fajr' },
  { key: 'zuhr', label: 'Zuhr' },
  { key: 'asr', label: 'Asr' },
  { key: 'maghrib', label: 'Maghrib' },
  { key: 'isha', label: 'Isha' },
];

export default function SalaahTimesPage({ session }) {
  const [masjidId, setMasjidId] = useState(session.role === 'masjid_admin' ? session.masjidId : null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    if (!masjidId) return;
    setLoading(true); setError(null);
    try { setForm(await getSalaahTimes(masjidId)); }
    catch (err) { setError(err); }
    setLoading(false);
  }, [masjidId]);

  useEffect(() => { load(); }, [load]);

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 2500); }
  function setField(key, value) { setForm({ ...form, [key]: value }); }

  async function save() {
    setSaving(true);
    try {
      await updateSalaahTimes(masjidId, form);
      showToast('Salaah times saved');
    } catch (err) {
      showToast(err.message || 'Could not save');
    }
    setSaving(false);
  }

  return (
    <PortalLayout title="Salaah times" subtitle="Iqamah (and azaan) times shown to worshippers" session={session}>
      {session.role === 'super_admin' && <MasjidPicker value={masjidId} onChange={setMasjidId} />}

      {!masjidId ? null : loading ? <LoadingState /> : error ? <ErrorState error={error} onRetry={load} /> : (
        <>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 18 }}>Daily prayers</div>
            <div className="form-grid form-grid-2">
              {PRAYERS.map(p => (
                <React.Fragment key={p.key}>
                  <div className="form-group">
                    <label>{p.label} — Azaan</label>
                    <input type="time" value={form[`${p.key}Azaan`] || ''} onChange={e => setField(`${p.key}Azaan`, e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>{p.label} — Iqamah</label>
                    <input type="time" value={form[`${p.key}Iqamah`] || ''} onChange={e => setField(`${p.key}Iqamah`, e.target.value)} />
                  </div>
                </React.Fragment>
              ))}
            </div>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-title" style={{ marginBottom: 18 }}>Jumu'ah</div>
            <div className="form-grid form-grid-2">
              <div className="form-group">
                <label>Khutbah start</label>
                <input type="time" value={form.jumuahKhutbah || ''} onChange={e => setField('jumuahKhutbah', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Iqamah</label>
                <input type="time" value={form.jumuahIqamah || ''} onChange={e => setField('jumuahIqamah', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-title" style={{ marginBottom: 10 }}>Notes</div>
            <textarea
              rows={3}
              style={{ width: '100%', fontFamily: 'var(--font)', fontSize: 13, padding: 10, borderRadius: 'var(--r-md)', border: '1px solid var(--border)' }}
              placeholder="e.g. Maghrib iqamah is 5 minutes after azaan"
              value={form.notes || ''}
              onChange={e => setField('notes', e.target.value)}
            />
          </div>

          <div style={{ marginTop: 16 }}>
            <button className="btn btn-primary" onClick={save} disabled={saving}><Save size={14} />{saving ? 'Saving…' : 'Save changes'}</button>
          </div>
        </>
      )}
      {toast && <div className="toast">✓ {toast}</div>}
    </PortalLayout>
  );
}
