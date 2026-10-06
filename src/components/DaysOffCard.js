import React, { useState, useEffect } from 'react';
import { CalendarX, X, Plus } from 'lucide-react';
import { getSpecialDays, addSpecialDay, removeDayOff, schoolDays } from '../lib/store';

// Settings → Days off & extra days: dates the madrasah is closed (Eid, a snow day…) and
// extra dates it opens outside its school days (a Saturday in Ramadhaan). Attendance shows
// closed days as closed and asks for a register on extra days. Saves straight away.
const nice = iso => new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', ...(iso.slice(0, 4) !== String(new Date().getFullYear()) && { year: 'numeric' }) });
const field = { padding: '8px 10px', border: '1px solid #dfe3e8', borderRadius: 'var(--r-md)', background: '#fafbfc', fontFamily: 'var(--font)', fontSize: 13, minWidth: 0 };
const KINDS = [['off', 'Closed'], ['extra', 'Open']];
const nextDay = iso => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };

// Days between a and b (exclusive) are all usual school days — so open days either side of
// them (Ramadhaan weekends) belong to one range.
function onlySchoolDaysBetween(a, b) {
  const usual = schoolDays();
  for (let d = nextDay(a); d < b; d = nextDay(d)) if (!usual.includes(new Date(d + 'T12:00:00Z').getUTCDay())) return false;
  return true;
}

// [[date, { name, kind }]] sorted → rows, joining back-to-back days with the same name (a
// closed week, or the open weekends of a month, shows as one line): [{ from, to, name, kind }].
function groupDays(list) {
  const out = [];
  list.forEach(([d, v]) => {
    const last = out[out.length - 1];
    if (last && last.kind === v.kind && last.name === v.name &&
        (nextDay(last.to) === d || (v.kind === 'extra' && onlySchoolDaysBetween(last.to, d)))) last.to = d;
    else out.push({ from: d, to: d, ...v });
  });
  return out;
}

export default function DaysOffCard() {
  const [days, setDays] = useState(null); // date → { name, kind }
  const [date, setDate] = useState('');
  const [to, setTo] = useState('');
  const [name, setName] = useState('');
  const [kind, setKind] = useState('off');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getSpecialDays().then(({ off, extra }) => {
      const all = {};
      Object.entries(off).forEach(([d, n]) => { all[d] = { name: n, kind: 'off' }; });
      Object.entries(extra).forEach(([d, n]) => { all[d] = { name: n, kind: 'extra' }; });
      setDays(all);
    }).catch(() => setDays({}));
  }, []);

  async function add(e) {
    e.preventDefault();
    if (!date) return;
    setBusy(true); setError('');
    try {
      const r = await addSpecialDay(date, name, kind, to > date ? to : undefined);
      setDays(d => { const next = { ...d }; (r.dates || [r.date]).forEach(x => { next[x] = { name: r.name, kind: r.kind }; }); return next; });
      await getSpecialDays(); // keep the app's own list of extra days up to date
      setDate(''); setTo(''); setName('');
    } catch (err) { setError(err.message || 'Could not add the day'); }
    setBusy(false);
  }
  async function remove({ from, to: end, kind: k }) {
    const before = days;
    setDays(prev => { const next = { ...prev }; Object.keys(next).forEach(x => { if (x >= from && x <= end && next[x].kind === k) delete next[x]; }); return next; });
    try { await removeDayOff(from, end > from ? end : undefined, k); await getSpecialDays(); }
    catch (err) { setDays(before); setError(err.message || 'Could not remove the day'); }
  }

  // Recent and upcoming only (from a month ago), soonest first.
  const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const list = groupDays(Object.entries(days || {}).sort(([a], [b]) => a.localeCompare(b))).filter(g => g.to >= since);

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-title" style={{ marginBottom: 4 }}><CalendarX size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />Days off &amp; extra days</div>
      <div className="card-sub" style={{ marginBottom: 12 }}>Closed (like Eid or half term) or open on days you usually aren't (like Ramadhaan weekends).</div>
      <form onSubmit={add} style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
          {KINDS.map(([k, label]) => {
            const on = kind === k;
            return (
              <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={on}
                style={{ height: 36, borderRadius: 8, fontFamily: 'var(--font)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                  border: `1px solid ${on ? (k === 'off' ? 'var(--ink)' : 'var(--green)') : '#dfe3e8'}`,
                  background: on ? (k === 'off' ? 'var(--ink)' : 'var(--green-light)') : '#fafbfc',
                  color: on ? (k === 'off' ? '#fff' : 'var(--green-text)') : 'var(--text-muted)' }}>
                {label}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
          <label style={{ display: 'grid', gap: 3, fontSize: 11.5, color: 'var(--text-muted)' }}>From
            <input type="date" value={date} onChange={e => { setDate(e.target.value); if (to && to < e.target.value) setTo(''); }} style={field} />
          </label>
          <label style={{ display: 'grid', gap: 3, fontSize: 11.5, color: 'var(--text-muted)' }}>To (for more than one day)
            <input type="date" value={to} min={date || undefined} onChange={e => setTo(e.target.value)} style={field} />
          </label>
        </div>
        {kind === 'extra' && to > date && date && <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Only the days you're usually closed are added.</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 6 }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder={kind === 'off' ? 'e.g. Eid ul-Adha' : 'e.g. Ramadhaan'} maxLength={60} style={field} aria-label="Name" />
          <button className="btn btn-primary btn-sm" type="submit" disabled={!date || busy}><Plus size={13} />Add</button>
        </div>
      </form>
      {days === null ? <div className="text-muted text-sm">Loading…</div> : list.length === 0 ? (
        <div className="text-muted text-sm">Nothing coming up.</div>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          {list.map(g => { const { from: d, to: end, name: n, kind: k } = g; return (
            <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f3f4f6', borderRadius: 'var(--r-md)', padding: '7px 8px 7px 12px', fontSize: 13 }}>
              <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '2px 8px', flexShrink: 0,
                background: k === 'extra' ? 'var(--green-light)' : '#e5e7eb', color: k === 'extra' ? 'var(--green-text)' : 'var(--text-muted)' }}>
                {k === 'extra' ? 'Open' : 'Closed'}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 600, display: 'block' }}>{nice(d)}{end > d && <> – {nice(end)}</>}</span>
                <span className="text-muted" style={{ display: 'block', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n}</span>
              </span>
              <button type="button" onClick={() => remove(g)} aria-label={`Remove ${nice(d)}`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, display: 'flex' }}><X size={15} /></button>
            </div>
          ); })}
        </div>
      )}
      {error && <div style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 8 }}>{error}</div>}
    </div>
  );
}
