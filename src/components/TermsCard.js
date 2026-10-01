import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Save, CalendarRange } from 'lucide-react';
import { getTerms, addTerm, updateTerm, deleteTerm, formatDateGB } from '../lib/store';

// Settings → Terms: each madrasah's own term dates, per academic year. Used when fees
// are charged termly (and for termly reports).
export default function TermsCard({ years, defaultYear }) {
  const [year, setYear] = useState(defaultYear || years[years.length - 1] || '');
  const [terms, setTerms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // { id?, name, startDate, endDate }
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!year) return;
    setLoading(true);
    try { setTerms(await getTerms(year)); } catch (err) { setError(err.message || 'Could not load terms'); }
    setLoading(false);
  }, [year]);
  useEffect(() => { load(); }, [load]);

  async function save() {
    setSaving(true); setError('');
    try {
      if (editing.id) await updateTerm(editing.id, { name: editing.name, startDate: editing.startDate, endDate: editing.endDate });
      else await addTerm({ year, name: editing.name, startDate: editing.startDate, endDate: editing.endDate });
      setEditing(null);
      await load();
    } catch (err) { setError(err.message || 'Could not save this term'); }
    setSaving(false);
  }

  async function remove(t) {
    if (!window.confirm(`Remove ${t.name}? Fees already added for this term are kept.`)) return;
    try { await deleteTerm(t.id); await load(); } catch (err) { setError(err.message || 'Could not remove this term'); }
  }

  const inputStyle = { padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', fontFamily: 'var(--font)', fontSize: 13 };

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-header" style={{ marginBottom: 6 }}>
        <div className="card-title"><CalendarRange size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />Terms</div>
        <select value={year} onChange={e => { setYear(e.target.value); setEditing(null); }} style={{ ...inputStyle, padding: '6px 10px' }}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <div className="card-sub" style={{ marginBottom: 14 }}>
        Your term dates for {year}. Used for termly fees and termly reports.
      </div>

      {loading ? <div className="text-muted text-sm">Loading…</div> : (
        <div style={{ marginBottom: 12 }}>
          {terms.length === 0 && !editing && <div className="text-muted text-sm" style={{ marginBottom: 8 }}>No terms added for {year} yet.</div>}
          {terms.map(t => (
            editing?.id === t.id ? null : (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 'var(--r-md)', background: '#f9fafb', marginBottom: 6, border: '1px solid var(--border)', flexWrap: 'wrap' }}>
                <div style={{ fontWeight: 600, fontSize: 14, minWidth: 90 }}>{t.name}</div>
                <div className="text-muted text-sm" style={{ flex: 1 }}>{formatDateGB(t.startDate)} – {formatDateGB(t.endDate)}</div>
                <button className="btn btn-sm" onClick={() => { setEditing({ ...t }); setError(''); }}>Edit</button>
                <button className="btn btn-icon btn-sm" style={{ color: 'var(--red)' }} title="Remove term" onClick={() => remove(t)}><Trash2 size={13} /></button>
              </div>
            )
          ))}
        </div>
      )}

      {editing ? (
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: '1 1 140px', marginBottom: 0 }}>
              <label>Term name</label>
              <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. Autumn" />
            </div>
            <div className="form-group" style={{ flex: '1 1 140px', marginBottom: 0 }}>
              <label>Starts</label>
              <input type="date" value={editing.startDate} onChange={e => setEditing({ ...editing, startDate: e.target.value })} />
            </div>
            <div className="form-group" style={{ flex: '1 1 140px', marginBottom: 0 }}>
              <label>Ends</label>
              <input type="date" value={editing.endDate} onChange={e => setEditing({ ...editing, endDate: e.target.value })} />
            </div>
          </div>
          {error && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 8 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn-primary btn-sm" onClick={save} disabled={saving || !editing.name || !editing.startDate || !editing.endDate}><Save size={13} />{saving ? 'Saving…' : 'Save term'}</button>
            <button className="btn btn-sm" onClick={() => { setEditing(null); setError(''); }} disabled={saving}>Cancel</button>
          </div>
        </div>
      ) : (
        <button className="btn btn-teal btn-sm" onClick={() => { setEditing({ name: '', startDate: '', endDate: '' }); setError(''); }} disabled={!year}><Plus size={13} />Add a term</button>
      )}
      {!editing && error && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 8 }}>{error}</div>}
    </div>
  );
}
