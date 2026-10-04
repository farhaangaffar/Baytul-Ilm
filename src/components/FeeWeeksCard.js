import React, { useState, useEffect, useCallback } from 'react';
import { CalendarCheck } from 'lucide-react';
import { getFeeWeeks, setFeeWeeks, getWeekStartsForMonth, getMondayOf } from '../lib/store';

// Settings → Fee weeks (weekly fees, added automatically): the school year month by
// month, one box per week. Weeks switched on are charged to every child when they
// arrive; weeks switched off (half-terms, holidays) are never charged.
function yearMonths(label) {
  const start = /^\d{4}-/.test(label) ? Number(label.slice(0, 4)) : 2000 + Number(label.slice(0, 2));
  return Array.from({ length: 12 }, (_, i) => {
    const y = i < 4 ? start : start + 1, m = ((8 + i) % 12) + 1;
    return `${y}-${String(m).padStart(2, '0')}`;
  });
}
const monthName = ym => new Date(ym + '-15T12:00:00').toLocaleDateString('en-GB', { month: 'short' });
const dayNum = iso => Number(iso.slice(8, 10));

export default function FeeWeeksCard({ years, defaultYear }) {
  const [year, setYear] = useState(defaultYear || years[years.length - 1] || '');
  const [off, setOff] = useState(new Set());
  const [charged, setCharged] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  // quiet: refresh after a change without blanking the card ("Loading…").
  const load = useCallback(async (quiet = false) => {
    if (!year) return;
    if (!quiet) setLoading(true);
    setError('');
    try { const r = await getFeeWeeks(year); setOff(new Set(r.off)); setCharged(r.charged || {}); }
    catch (err) { setError(err.message || 'Could not load the fee weeks'); }
    if (!quiet) setLoading(false);
  }, [year]);
  useEffect(() => { load(); }, [load]);

  const months = yearMonths(year).map(ym => ({ ym, weeks: getWeekStartsForMonth(ym) }));
  const allWeeks = months.flatMap(m => m.weeks);
  const thisWeek = getMondayOf(new Date().toISOString().slice(0, 10));
  const onCount = allWeeks.filter(w => !off.has(w)).length;

  async function apply(weeks, on) {
    if (!weeks.length) return;
    if (!on) {
      const paidOrOwed = weeks.filter(w => charged[w]).length;
      if (paidOrOwed && !window.confirm(
        `${paidOrOwed === 1 ? 'This week has' : `${paidOrOwed} of these weeks have`} already been charged.\n\n`
        + 'Switch off and remove fees not yet paid, for everyone? Payments already made stay recorded.')) return;
    }
    // Show the change straight away; save in the background, then refresh quietly.
    const before = off;
    setOff(prev => { const next = new Set(prev); weeks.forEach(w => (on ? next.delete(w) : next.add(w))); return next; });
    setBusy(true); setError(''); setNote('');
    try {
      const r = await setFeeWeeks(weeks, on);
      await load(true);
      if (r.removed) setNote(`${r.removed} unpaid fee${r.removed === 1 ? '' : 's'} removed`);
      else if (r.added) setNote(`${r.added} fee${r.added === 1 ? '' : 's'} charged`);
    } catch (err) { setOff(before); setError(err.message || 'Could not change the fee weeks'); }
    setBusy(false);
  }

  const inputStyle = { padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', fontFamily: 'var(--font)', fontSize: 13 };

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-header" style={{ marginBottom: 6 }}>
        <div className="card-title"><CalendarCheck size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />Fee weeks</div>
        <select value={year} onChange={e => setYear(e.target.value)} style={inputStyle}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <div className="card-sub" style={{ marginBottom: 12 }}>
        Weeks switched on are charged to every child when they arrive. Switch off half-terms and holidays — they're never charged.
        {' '}{onCount} of {allWeeks.length} weeks on for {year}.
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <button className="btn btn-sm" disabled={busy || loading} onClick={() => apply(allWeeks.filter(w => off.has(w)), true)}>Select all</button>
        <button className="btn btn-sm" disabled={busy || loading} onClick={() => apply(allWeeks.filter(w => !off.has(w)), false)}>Clear all</button>
        {busy && <span className="text-muted text-sm" style={{ alignSelf: 'center' }}>Saving…</span>}
        {note && !busy && <span className="text-muted text-sm" style={{ alignSelf: 'center' }}>{note}</span>}
      </div>
      {loading ? <div className="text-muted text-sm">Loading…</div> : (
        <div style={{ display: 'grid', gap: 6 }}>
          {months.map(({ ym, weeks }) => (
            <div key={ym} style={{ display: 'grid', gridTemplateColumns: '44px 1fr', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>{monthName(ym)}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 6 }}>
                {weeks.map(w => {
                  const on = !off.has(w);
                  return (
                    <button key={w} type="button" onClick={() => apply([w], !on)} aria-pressed={on}
                      title={`Week of ${w.split('-').reverse().join('/')} — ${on ? 'charged' : 'not charged'}${charged[w] ? ` (${charged[w]} fees)` : ''}`}
                      style={{ height: 34, borderRadius: 8, fontFamily: 'var(--font)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', position: 'relative',
                        border: `1px solid ${on ? 'var(--green)' : '#dfe3e8'}`, background: on ? 'var(--green-light)' : '#fafbfc', color: on ? 'var(--green-text)' : 'var(--text-soft)',
                        boxShadow: w === thisWeek ? '0 0 0 2px var(--blue)' : 'none' }}>
                      {dayNum(w)}
                      {charged[w] ? <span style={{ position: 'absolute', top: 3, right: 4, width: 5, height: 5, borderRadius: '50%', background: on ? 'var(--green-text)' : 'var(--text-soft)' }} /> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 10 }}>
        Each box is the Monday a week starts. A small dot means that week has already been charged. Saved as soon as you tap.
      </div>
      {error && <div style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 8 }}>{error}</div>}
    </div>
  );
}
