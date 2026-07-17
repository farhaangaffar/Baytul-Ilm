import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import { LoadingState, ErrorState } from '../components/DataState';
import { getStudents, getAttendance, setAttendance, getClassNames, getWeekDates, getAcademicYears, currentSchoolYear, academicYearStartISO, formatDayMonthGB } from '../lib/store';
import { ArrowLeft } from 'lucide-react';

function isoToday() { return new Date().toISOString().split('T')[0]; }
const STATUS_LABELS = { P:'Present', L:'Late', A:'Absent' };

export default function Attendance() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [students, setStudents] = useState([]);
  const [classNames, setClassNames] = useState([]);
  const [years, setYears] = useState([]);
  const [activeClass, setActiveClass] = useState('');
  const [year, setYear] = useState('');
  const [currentYear, setCurrentYear] = useState('');
  const [attData, setAttData] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [weekAnchor, setWeekAnchor] = useState(isoToday());
  const [toast, setToast] = useState('');
  const TODAY = isoToday();

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const y = await currentSchoolYear();
      const [studentsData, classNamesData, yearsData, attendanceData] = await Promise.all([
        getStudents(), getClassNames(), getAcademicYears(), getAttendance(y),
      ]);
      setStudents(studentsData); setClassNames(classNamesData); setYears(yearsData); setYear(y); setCurrentYear(y); setAttData(attendanceData);
      setActiveClass(prev => prev && classNamesData.includes(prev) ? prev : (classNamesData[0] || ''));
    } catch (err) {
      setError(err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function switchYear(y) {
    setYear(y);
    try { setAttData(await getAttendance(y)); } catch (err) { showToast(err.message || 'Could not load that year'); }
  }

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''),2000); }

  async function mark(studentId, date, status) {
    const cur = attData[studentId]?.[date]||null;
    const next = cur===status ? null : status;
    const s = students.find(s=>s.id===studentId);
    setAttData(prev => ({ ...prev, [studentId]: { ...prev[studentId], [date]: next } }));
    showToast(`${s?.forename} ${s?.surname} — ${next?STATUS_LABELS[next]:'Cleared'}`);
    try {
      await setAttendance(studentId, date, next, year);
    } catch (err) {
      setAttData(prev => ({ ...prev, [studentId]: { ...prev[studentId], [date]: cur } }));
      showToast(err.message || 'Could not save attendance');
    }
  }

  function openStudent(id) { setSelectedId(id); setWeekAnchor(year===currentYear ? isoToday() : academicYearStartISO(year)); }

  function shiftWeek(dir) {
    const wd = getWeekDates(weekAnchor);
    const d = new Date(wd[0]+'T12:00:00'); d.setDate(d.getDate()+dir*7);
    setWeekAnchor(d.toISOString().split('T')[0]);
  }

  if (loading) return <Layout title="Attendance"><LoadingState /></Layout>;
  if (error) return <Layout title="Attendance"><ErrorState error={error} onRetry={load} /></Layout>;

  const classStudents = students.filter(s=>s.class===activeClass);
  const isCurrentYear = year===currentYear;
  const referenceDate = isCurrentYear ? TODAY : academicYearStartISO(year);
  const thisWeekDates = getWeekDates(referenceDate);

  function weekCountsFor(studentId, dates) {
    const days = dates.map(d=>attData[studentId]?.[d]).filter(Boolean);
    return { P: days.filter(d=>d==='P').length, L: days.filter(d=>d==='L').length, A: days.filter(d=>d==='A').length };
  }

  // Present today (P or L both count as attended) out of active students, per class.
  function todayCountFor(className) {
    const inClass = students.filter(s=>s.class===className && s.status==='Active');
    const present = inClass.filter(s=>{ const st=attData[s.id]?.[TODAY]; return st==='P'||st==='L'; }).length;
    return { present, total: inClass.length };
  }

  const selected = students.find(s=>s.id===selectedId);

  if (selected) {
    const weekDates = getWeekDates(weekAnchor);
    const weekLabel = `${formatDayMonthGB(weekDates[0])} – ${formatDayMonthGB(weekDates[3])}`;
    const counts = weekCountsFor(selected.id, weekDates);
    const marked = counts.P + counts.L + counts.A;
    const pct = marked ? Math.round(((counts.P+counts.L)/marked)*100) : 0;

    return (
      <Layout title="Attendance" subtitle={`${selected.forename} ${selected.surname} · ${selected.class}`}>
        <div className="card-header" style={{marginBottom:20}}>
          <div className="flex items-center gap-3">
            <button className="back-pill" onClick={()=>setSelectedId(null)}><ArrowLeft size={14}/> All students</button>
            <div>
              <div style={{fontWeight:600,fontSize:16}}>{selected.forename} {selected.surname}</div>
              <div className="text-muted text-sm">{selected.class}</div>
            </div>
          </div>
          <div className="nav-arrow-row">
            <button className="nav-arrow-btn" onClick={()=>shiftWeek(-1)}>‹</button>
            <span>Week of {weekLabel}</span>
            <button className="nav-arrow-btn" onClick={()=>shiftWeek(1)}>›</button>
          </div>
        </div>

        <div className="day-cal-row">
          {weekDates.map(date=>{
            const status = attData[selected.id]?.[date];
            const dayName = new Date(date+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short'});
            const dayDate = formatDayMonthGB(date);
            const bg = status==='P'?'var(--green-light)':status==='L'?'var(--amber-light)':status==='A'?'var(--red-light)':'#f3f4f6';
            const dotBg = status==='P'?'var(--green)':status==='L'?'var(--amber)':status==='A'?'var(--red)':'#e5e7eb';
            return (
              <div className="day-cal-card" key={date} style={{background:bg}}>
                <div className="day-cal-name">{dayName}</div>
                <div className="day-cal-date">{dayDate}</div>
                <button className="day-cal-status" style={{background:dotBg, color: status ? '#fff' : 'var(--text-soft)'}}
                  onClick={async ()=>{
                    const cycle=['P','L','A',null];
                    const next=cycle[(cycle.indexOf(status||null)+1)%cycle.length];
                    setAttData(prev => ({ ...prev, [selected.id]: { ...prev[selected.id], [date]: next } }));
                    try { await setAttendance(selected.id,date,next,year); }
                    catch (err) {
                      setAttData(prev => ({ ...prev, [selected.id]: { ...prev[selected.id], [date]: status } }));
                      showToast(err.message || 'Could not save attendance');
                    }
                  }}>
                  {status||'·'}
                </button>
                <div className="day-cal-label">{status?STATUS_LABELS[status]:'Not marked'}</div>
              </div>
            );
          })}
        </div>

        <div className="summary-row-v2">
          <div className="summary-box-v2" style={{background:'var(--green-light)'}}><div className="n">{counts.P}</div><div className="l">Present</div></div>
          <div className="summary-box-v2" style={{background:'var(--amber-light)'}}><div className="n">{counts.L}</div><div className="l">Late</div></div>
          <div className="summary-box-v2" style={{background:'var(--red-light)'}}><div className="n">{counts.A}</div><div className="l">Absent</div></div>
          <div className="summary-box-v2" style={{background:'#f0f2f6'}}><div className="n">{pct}%</div><div className="l">This week</div></div>
        </div>
        {toast && <div className="toast">✓ {toast}</div>}
      </Layout>
    );
  }

  return (
    <Layout title="Attendance" subtitle={`${activeClass} · ${year}`}>
      {isCurrentYear ? (
        <div className="count-row">
          {classNames.map(c=>{
            const tc = todayCountFor(c);
            const pct = tc.total ? Math.round((tc.present/tc.total)*100) : 0;
            return (
              <div className="count-chip" key={c}>
                <div className="count-ring" style={{background:`conic-gradient(var(--green) 0% ${pct}%, #f3f4f6 ${pct}% 100%)`}}>{pct}%</div>
                <div>
                  <div className="figure">{tc.present}<span> / {tc.total} present</span></div>
                  <div className="label">{c} — today</div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-muted text-sm mb-4">Browsing {year} — showing the week of {formatDayMonthGB(thisWeekDates[0])}. Open a student to mark or edit any day.</div>
      )}
      <div className="pill-tabs">
        {classNames.map(c=>(
          <button key={c} className={`pill-tab ${activeClass===c?'active':''}`} onClick={()=>setActiveClass(c)}>{c}</button>
        ))}
        <div className="pill-divider"/>
        {years.map(y=>(
          <button key={y} className={`pill-tab ${year===y?'year-active':''}`} onClick={()=>switchYear(y)}>{y}</button>
        ))}
      </div>

      <div className="entity-grid">
        {classStudents.map(s=>{
          const todayStatus = attData[s.id]?.[TODAY];
          const wc = weekCountsFor(s.id, thisWeekDates);
          return (
            <div className="entity-card" key={s.id} onClick={()=>openStudent(s.id)}>
              <div className="entity-card-name">{s.forename} {s.surname}</div>
              <div className="entity-card-sub" style={{marginBottom:14}}>{s.class}</div>
              {isCurrentYear && (
                <div className="mark-btn-row" style={{justifyContent:'center'}} onClick={e=>e.stopPropagation()}>
                  <button className={`mark-btn ${todayStatus==='P'?'on-p':''}`} onClick={()=>mark(s.id,TODAY,'P')}>P</button>
                  <button className={`mark-btn ${todayStatus==='L'?'on-l':''}`} onClick={()=>mark(s.id,TODAY,'L')}>L</button>
                  <button className={`mark-btn ${todayStatus==='A'?'on-a':''}`} onClick={()=>mark(s.id,TODAY,'A')}>A</button>
                </div>
              )}
              <div style={{fontSize:11,color:'var(--text-soft)',marginTop:isCurrentYear?10:0,textAlign:'center'}}>Week of {formatDayMonthGB(thisWeekDates[0])}: {wc.P}P · {wc.L}L · {wc.A}A</div>
            </div>
          );
        })}
      </div>
      {classStudents.length===0&&(
        <div className="card" style={{textAlign:'center',padding:28,color:'var(--text-muted)'}}>No students in {activeClass}.</div>
      )}
      {toast && <div className="toast">✓ {toast}</div>}
    </Layout>
  );
}
