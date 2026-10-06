import React, { useState, useEffect } from 'react';
import { CalendarX, X, Plus } from 'lucide-react';
import { getDaysOff, addDayOff, removeDayOff } from '../lib/store';

// Settings → Days off: dates the madrasah is closed (Eid, a snow day, a training day…).
// Attendance shows them as closed instead of asking for a register. Saves straight away.
const nice = iso => new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const field = { padding: '8px 10px', border: '1px solid #dfe3e8', borderRadius: 'var(--r-md)', background: '#fafbfc', fontFamily: 'var(--font)', fontSize: 13, minWidth: 0 };

export default function DaysOffCard() {
  const [days, setDays] = useState(null);
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { getDaysOff().then(setDays).catch(() => setDays({})); }, []);

  async function add(e) {
    e.preventDefault();
    if (!date) return;
    setBusy(true); setError('');
    try {
      const r = await addDayOff(date, name);
      setDays(d => ({ ...d, [r.date]: r.name }));
      setDate(''); setName('');
    } catch (err) { setError(err.message || 'Could not add the day'); }
    setBusy(false);
  }
  async function remove(d) {
    const before = days;
    setDays(prev => { const next = { ...prev }; delete next[d]; return next; });
    try { await removeDayOff(d); } catch (err) { setDays(before); setError(err.message || 'Could not remove the day'); }
  }

  // Recent and upcoming only (from a month ago), soonest first.
  const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const list = Object.entries(days || {}).filter(([d]) => d >= since).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-title" style={{ marginBottom: 4 }}><CalendarX size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />Days off</div>
      <div className="card-sub" style={{ marginBottom: 12 }}>Days you're closed, like Eid — attendance shows them as closed.</div>
      <form onSubmit={add} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.3fr) auto', gap: 6, marginBottom: 10 }}>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={field} aria-label="Date" />
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Eid ul-Adha" maxLength={60} style={field} aria-label="Name" />
        <button className="btn btn-primary btn-sm" type="submit" disabled={!date || busy}><Plus size={13} />Add</button>
      </form>
      {days === null ? <div className="text-muted text-sm">Loading…</div> : list.length === 0 ? (
        <div className="text-muted text-sm">No days off coming up.</div>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          {list.map(([d, n]) => (
            <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f3f4f6', borderRadius: 'var(--r-md)', padding: '7px 8px 7px 12px', fontSize: 13 }}>
              <span style={{ fontWeight: 600, minWidth: 0 }}>{nice(d)}</span>
              <span className="text-muted" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n}</span>
              <button type="button" onClick={() => remove(d)} aria-label={`Remove ${nice(d)}`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, display: 'flex' }}><X size={15} /></button>
            </div>
          ))}
        </div>
      )}
      {error && <div style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 8 }}>{error}</div>}
    </div>
  );
}
