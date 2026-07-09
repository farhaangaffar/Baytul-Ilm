import React, { useState } from 'react';
import Layout from '../components/Layout';
import { getStudents, getAttendance, setAttendance, getClassNames, getWeekDates, getAcademicYears, currentSchoolYear } from '../lib/store';
import { ArrowLeft } from 'lucide-react';

function isoToday() { return new Date().toISOString().split('T')[0]; }
const STATUS_LABELS = { P:'Present', L:'Late', A:'Absent' };

export default function Attendance() {
  const [students] = useState(getStudents);
  const classNames = getClassNames();
  const [activeClass, setActiveClass] = useState(classNames[0]||'');
  const [year, setYear] = useState(currentSchoolYear());
  const years = getAcademicYears();
  const [attData, setAttData] = useState(() => getAttendance(year));
  const [selectedId, setSelectedId] = useState(null);
  const [weekAnchor, setWeekAnchor] = useState(isoToday());
  const [toast, setToast] = useState('');
  const TODAY = isoToday();

  function refreshAtt(y) { setAttData(getAttendance(y||year)); }
  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''),2000); }

  function mark(studentId, date, status) {
    const cur = attData[studentId]?.[date]||null;
    const next = cur===status ? null : status;
    setAttendance(studentId, date, next, year);
    refreshAtt();
    const s = students.find(s=>s.id===studentId);
    showToast(`${s?.forename} ${s?.surname} — ${next?STATUS_LABELS[next]:'Cleared'}`);
  }

  function openStudent(id) { setSelectedId(id); setWeekAnchor(isoToday()); }

  function shiftWeek(dir) {
    const wd = getWeekDates(weekAnchor);
    const d = new Date(wd[0]+'T12:00:00'); d.setDate(d.getDate()+dir*7);
    setWeekAnchor(d.toISOString().split('T')[0]);
  }

  const classStudents = students.filter(s=>s.class===activeClass);
  const thisWeekDates = getWeekDates(TODAY);

  function weekCountsFor(studentId, dates) {
    const days = dates.map(d=>attData[studentId]?.[d]).filter(Boolean);
    return { P: days.filter(d=>d==='P').length, L: days.filter(d=>d==='L').length, A: days.filter(d=>d==='A').length };
  }

  const selected = students.find(s=>s.id===selectedId);

  if (selected) {
    const weekDates = getWeekDates(weekAnchor);
    const weekLabel = `${new Date(weekDates[0]+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'})} – ${new Date(weekDates[3]+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'})}`;
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
            const dayDate = new Date(date+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'});
            const bg = status==='P'?'var(--green-light)':status==='L'?'var(--amber-light)':status==='A'?'var(--red-light)':'#f3f4f6';
            const dotBg = status==='P'?'var(--green)':status==='L'?'var(--amber)':status==='A'?'var(--red)':'#e5e7eb';
            return (
              <div className="day-cal-card" key={date} style={{background:bg}}>
                <div className="day-cal-name">{dayName}</div>
                <div className="day-cal-date">{dayDate}</div>
                <button className="day-cal-status" style={{background:dotBg, color: status ? '#fff' : 'var(--text-soft)'}}
                  onClick={()=>{
                    const cycle=['P','L','A',null];
                    const next=cycle[(cycle.indexOf(status||null)+1)%cycle.length];
                    setAttendance(selected.id,date,next,year); refreshAtt();
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
      <div className="pill-tabs">
        {classNames.map(c=>(
          <button key={c} className={`pill-tab ${activeClass===c?'active':''}`} onClick={()=>setActiveClass(c)}>{c}</button>
        ))}
        <div className="pill-divider"/>
        {years.map(y=>(
          <button key={y} className={`pill-tab ${year===y?'year-active':''}`} onClick={()=>{ setYear(y); refreshAtt(y); }}>{y}</button>
        ))}
      </div>

      <div className="entity-grid">
        {classStudents.map(s=>{
          const todayStatus = attData[s.id]?.[TODAY];
          const wc = weekCountsFor(s.id, thisWeekDates);
          return (
            <div className="entity-card" key={s.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:14}} onClick={()=>openStudent(s.id)}>
              <div>
                <div className="entity-card-name">{s.forename} {s.surname}</div>
                <div className="entity-card-sub">{s.class}</div>
                <div style={{fontSize:11,color:'var(--text-soft)',marginTop:6}}>This week: {wc.P}P · {wc.L}L · {wc.A}A</div>
              </div>
              <div className="mark-btn-row" onClick={e=>e.stopPropagation()}>
                <button className={`mark-btn ${todayStatus==='P'?'on-p':''}`} onClick={()=>mark(s.id,TODAY,'P')}>P</button>
                <button className={`mark-btn ${todayStatus==='L'?'on-l':''}`} onClick={()=>mark(s.id,TODAY,'L')}>L</button>
                <button className={`mark-btn ${todayStatus==='A'?'on-a':''}`} onClick={()=>mark(s.id,TODAY,'A')}>A</button>
              </div>
            </div>
          );
        })}
        {classStudents.length===0&&(
          <div className="card" style={{gridColumn:'1 / -1',textAlign:'center',padding:28,color:'var(--text-muted)'}}>No students in {activeClass}.</div>
        )}
      </div>
      {toast && <div className="toast">✓ {toast}</div>}
    </Layout>
  );
}
