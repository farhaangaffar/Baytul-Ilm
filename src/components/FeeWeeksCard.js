import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CalendarCheck } from 'lucide-react';
import { getFeeWeeks, setFeeWeeks, getWeekStartsForMonth, getMondayOf } from '../lib/store';

// Settings → Fee weeks (weekly fees, added automatically): the school year month by
// month, one box per week. Weeks switched on are charged to every child when their
// (school) month starts; weeks switched off (half-terms, holidays) are never charged.
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
  const [confirmOff, setConfirmOff] = useState(null); // weeks waiting for "remove unpaid fees?"
  // Saves run one after another in the background; the card only refreshes from the server
  // once they've all finished, so quick taps never flick back (like the Attendance buttons).
  const queue = useRef(Promise.resolve());
  const pending = useRef(0);

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

  function apply(weeks, on, confirmed = false) {
    if (!weeks.length) return;
    if (!on && !confirmed && weeks.some(w => charged[w])) { setConfirmOff(weeks); return; }
    // Show the change straight away; save in the background.
    const flip = (set, toOn) => { const next = new Set(set); weeks.forEach(w => (toOn ? next.delete(w) : next.add(w))); return next; };
    setOff(prev => flip(prev, on));
    setError(''); setNote(''); setBusy(true);
    pending.current += 1;
    queue.current = queue.current.then(async () => {
      try {
        const r = await setFeeWeeks(weeks, on);
        if (r.removed) setNote(`${r.removed} unpaid fee${r.removed === 1 ? '' : 's'} removed`);
        else if (r.added) setNote(`${r.added} fee${r.added === 1 ? '' : 's'} charged`);
      } catch (err) {
        setOff(prev => flip(prev, !on)); // put just these weeks back
        setError(err.message || 'Could not change the fee weeks');
      }
      pending.current -= 1;
      if (pending.current === 0) { await load(true); setBusy(false); }
    });
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
        Green weeks are charged when their month starts. Tap a holiday to switch it off. {onCount} of {allWeeks.length} weeks on.
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <button className="btn btn-sm" disabled={busy || loading} onClick={() => apply(allWeeks.filter(w => off.has(w)), true)}>Select all</button>
        <button className="btn btn-sm" disabled={busy || loading} onClick={() => apply(allWeeks.filter(w => !off.has(w)), false)}>Clear all</button>
        {busy && <span className="text-muted text-sm" style={{ alignSelf: 'center' }}>Saving…</span>}
        {note && !busy && <span className="text-muted text-sm" style={{ alignSelf: 'center' }}>{note}</span>}
      </div>
      {loading ? <div className="text-muted text-sm">Loading…</div> : (
        <div style={{ display: 'grid', gap: 6, maxWidth: 560 }}>
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
        Each box is the Monday a week starts; a dot means it's already been charged.
      </div>
      {error && <div style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 8 }}>{error}</div>}
      {confirmOff && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setConfirmOff(null)}>
          <div className="modal" style={{ maxWidth: 380 }}>
            <div className="modal-body" style={{ textAlign: 'center', paddingTop: 28 }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
                {confirmOff.length === 1 ? 'This week has already been charged' : 'Some of these weeks have already been charged'}
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12.5 }}>Switching off removes fees not yet paid, for everyone. Payments already made stay recorded.</div>
            </div>
            <div className="modal-footer" style={{ justifyContent: 'center' }}>
              <button className="btn" onClick={() => setConfirmOff(null)}>Keep it on</button>
              <button className="btn btn-danger" onClick={() => { const w = confirmOff; setConfirmOff(null); apply(w, false, true); }}>Switch off</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
