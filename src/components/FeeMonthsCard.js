import React, { useState, useEffect, useCallback } from 'react';
import { CalendarCheck } from 'lucide-react';
import { getFeeMonths, setFeeMonths } from '../lib/store';

// Settings → Fee months (monthly fees, added automatically): the school year's twelve
// months as boxes. Months switched on are charged to every child when they start; months
// switched off (e.g. an August with no classes) are never charged.
function yearMonths(label) {
  const start = /^\d{4}-/.test(label) ? Number(label.slice(0, 4)) : 2000 + Number(label.slice(0, 2));
  return Array.from({ length: 12 }, (_, i) => {
    const y = i < 4 ? start : start + 1, m = ((8 + i) % 12) + 1;
    return `${y}-${String(m).padStart(2, '0')}-01`;
  });
}
const monthName = d => new Date(d.slice(0, 7) + '-15T12:00:00').toLocaleDateString('en-GB', { month: 'short' });

export default function FeeMonthsCard({ years, defaultYear }) {
  const [year, setYear] = useState(defaultYear || years[years.length - 1] || '');
  const [off, setOff] = useState(new Set());
  const [charged, setCharged] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async (quiet = false) => {
    if (!year) return;
    if (!quiet) setLoading(true);
    setError('');
    try { const r = await getFeeMonths(year); setOff(new Set(r.off)); setCharged(r.charged || {}); }
    catch (err) { setError(err.message || 'Could not load the fee months'); }
    if (!quiet) setLoading(false);
  }, [year]);
  useEffect(() => { load(); }, [load]);

  const months = yearMonths(year);
  const thisMonth = new Date().toISOString().slice(0, 7) + '-01';
  const onCount = months.filter(m => !off.has(m)).length;

  async function toggle(m) {
    const on = off.has(m);
    if (!on && charged[m] && !window.confirm(
      `${monthName(m)} has already been charged.\n\nSwitch it off and remove fees not yet paid, for everyone? Payments already made stay recorded.`)) return;
    const before = off;
    setOff(prev => { const next = new Set(prev); on ? next.delete(m) : next.add(m); return next; });
    setBusy(true); setError(''); setNote('');
    try {
      const r = await setFeeMonths([m], on);
      await load(true);
      if (r.removed) setNote(`${r.removed} unpaid fee${r.removed === 1 ? '' : 's'} removed`);
    } catch (err) { setOff(before); setError(err.message || 'Could not change the fee months'); }
    setBusy(false);
  }

  const inputStyle = { padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', fontFamily: 'var(--font)', fontSize: 13 };

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-header" style={{ marginBottom: 6 }}>
        <div className="card-title"><CalendarCheck size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />Fee months</div>
        <select value={year} onChange={e => setYear(e.target.value)} style={inputStyle}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <div className="card-sub" style={{ marginBottom: 12 }}>
        Green months are charged when they start. Tap a month with no classes to switch it off. {onCount} of 12 on.
        {busy && ' Saving…'}{note && !busy && ` ${note}.`}
      </div>
      {loading ? <div className="text-muted text-sm">Loading…</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 6, maxWidth: 560 }}>
          {months.map(m => {
            const on = !off.has(m);
            return (
              <button key={m} type="button" onClick={() => toggle(m)} aria-pressed={on}
                title={`${monthName(m)} — ${on ? 'charged' : 'not charged'}${charged[m] ? ` (${charged[m]} fees)` : ''}`}
                style={{ height: 40, borderRadius: 8, fontFamily: 'var(--font)', fontSize: 13, fontWeight: 600, cursor: 'pointer', position: 'relative',
                  border: `1px solid ${on ? 'var(--green)' : '#dfe3e8'}`, background: on ? 'var(--green-light)' : '#fafbfc', color: on ? 'var(--green-text)' : 'var(--text-soft)',
                  boxShadow: m === thisMonth ? '0 0 0 2px var(--blue)' : 'none' }}>
                {monthName(m)}
                {charged[m] ? <span style={{ position: 'absolute', top: 4, right: 5, width: 5, height: 5, borderRadius: '50%', background: on ? 'var(--green-text)' : 'var(--text-soft)' }} /> : null}
              </button>
            );
          })}
        </div>
      )}
      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 10 }}>A dot means that month has already been charged.</div>
      {error && <div style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 8 }}>{error}</div>}
    </div>
  );
}
