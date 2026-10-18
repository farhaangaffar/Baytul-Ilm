import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getTeachers, getTeacherAttendance, setTeacherAttendance, isSchoolDay, getSpecialDays } from '../lib/store';
import { LoadingState, ErrorState } from './DataState';

// Attendance → Teachers (head only): the teachers' register for a day — a line per teacher with
// P / L / A (Late stamps the time when it's today), the day moved back and forward a school day at
// a time — and each teacher's totals for that day's month underneath.

const STATUS_LABELS = { P: 'Present', L: 'Late', A: 'Absent' };
const iso = d => d.toISOString().slice(0, 10);
const shift = (date, n) => { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
function timeNow() { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
// The nearest school day from `date` going `dir` (-1 back, +1 on), `date` itself if it is one (with step 0).
function schoolDayFrom(date, dir, step = 1) {
  let d = step ? shift(date, dir) : date;
  for (let i = 0; i < 14 && !isSchoolDay(d); i++) d = shift(d, dir || -1);
  return d;
}

export default function TeacherAttendance() {
  const TODAY = iso(new Date());
  const [teachers, setTeachers] = useState(null);
  const [error, setError] = useState(null);
  const [day, setDay] = useState(TODAY);
  const [marks, setMarks] = useState({}); // { teacherId: { date: { status, lateTime } } }
  const [daysOff, setDaysOff] = useState({});
  const [toast, setToast] = useState('');
  const month = day.slice(0, 7);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [list, special] = await Promise.all([getTeachers(), getSpecialDays().catch(() => null)]);
      setTeachers(list);
      if (special) setDaysOff(special.off || {});
      setDay(d => (d === TODAY ? schoolDayFrom(TODAY, -1, 0) : d)); // today, or the last school day before it
    } catch (err) { setError(err); }
  }, [TODAY]);
  useEffect(() => { load(); }, [load]);

  // The month's marks, fetched again when the day moves into another month.
  useEffect(() => {
    const last = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getUTCDate();
    getTeacherAttendance(`${month}-01`, `${month}-${String(last).padStart(2, '0')}`).then(rows => {
      const m = {};
      rows.forEach(r => { (m[r.teacherId] = m[r.teacherId] || {})[r.date] = { status: r.status, lateTime: r.lateTime }; });
      setMarks(m);
    }).catch(err => setToast(err.message || 'Could not load the register'));
  }, [month]);

  async function mark(teacherId, status) {
    const cur = marks[teacherId]?.[day];
    const next = cur?.status === status ? null : status;
    const lateTime = next === 'L' ? (day === TODAY ? timeNow() : cur?.lateTime) : undefined;
    const put = v => setMarks(prev => ({ ...prev, [teacherId]: { ...prev[teacherId], [day]: v } }));
    put(next ? { status: next, lateTime } : undefined);
    try { await setTeacherAttendance(teacherId, day, next, lateTime); }
    catch (err) { put(cur); setToast(err.message || 'Could not save'); setTimeout(() => setToast(''), 2500); }
  }

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!teachers) return <LoadingState />;
  if (!teachers.length) return <div className="card" style={{ textAlign: 'center', padding: 28, color: 'var(--text-muted)' }}>Add your teachers on Classes &amp; Teachers first.</div>;

  const label = new Date(day + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const closed = daysOff[day];
  const count = (id, s) => Object.entries(marks[id] || {}).filter(([d, v]) => d.startsWith(month) && v?.status === s).length;
  const todayDone = teachers.filter(t => marks[t.id]?.[day]).length;

  return (
    <>
      <div className="card att-week">
        <div className="ta-day">
          <button type="button" className="btn btn-icon btn-sm" aria-label="Previous school day" onClick={() => setDay(schoolDayFrom(day, -1))}><ChevronLeft size={16} /></button>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontWeight: 700 }}>{label}{day === TODAY && <span className="att-today">Today</span>}</div>
            <div className="att-day-status">{closed ? `Closed — ${closed}` : `${todayDone} of ${teachers.length} marked`}</div>
          </div>
          <button type="button" className="btn btn-icon btn-sm" aria-label="Next school day" disabled={day >= TODAY} onClick={() => setDay(schoolDayFrom(day, 1))}><ChevronRight size={16} /></button>
        </div>
        {teachers.map(t => {
          const m = marks[t.id]?.[day];
          return (
            <div className={`att-day ${m?.status || ''}`} key={t.id}>
              <span className="att-stripe" />
              <div className="att-day-main">
                <div className="att-day-date">{t.name}</div>
                <div className="att-day-status">{m ? STATUS_LABELS[m.status] : 'Not marked'}{m?.status === 'L' && m.lateTime ? ` · ${m.lateTime}` : ''}</div>
              </div>
              {['P', 'L', 'A'].map(k => (
                <button key={k} type="button" className={`att-mark ${m?.status === k ? 'on ' + k : ''}`} aria-pressed={m?.status === k}
                  aria-label={`${t.name}: ${STATUS_LABELS[k]}`} onClick={() => mark(t.id, k)}>{k}</button>
              ))}
            </div>
          );
        })}
      </div>

      <div className="card att-week" style={{ marginTop: 14 }}>
        <div className="att-week-title">This month · {new Date(day + 'T12:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</div>
        {teachers.map(t => (
          <div className="ta-month" key={t.id}>
            <span className="ta-month-name">{t.name}</span>
            <span className={`ta-count P ${count(t.id, 'P') ? '' : 'zero'}`}>{count(t.id, 'P')}<small>P</small></span>
            <span className={`ta-count L ${count(t.id, 'L') ? '' : 'zero'}`}>{count(t.id, 'L')}<small>L</small></span>
            <span className={`ta-count A ${count(t.id, 'A') ? '' : 'zero'}`}>{count(t.id, 'A')}<small>A</small></span>
          </div>
        ))}
      </div>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
