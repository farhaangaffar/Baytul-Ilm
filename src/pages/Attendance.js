import React, { useState } from 'react';
import Layout from '../components/Layout';
import { getStudents, getAttendance, setAttendance, calcAttendancePct, calcAttendanceCounts, avatarInitials, getClassNames, getWeekDates, SCHOOL_YEARS, currentSchoolYear } from '../lib/store';

function isoToday() { return new Date().toISOString().split('T')[0]; }
const STATUS_LABELS = { P:'Present', L:'Late', A:'Absent' };
const CYCLE = ['P','L','A',null];

export default function Attendance() {
  const [students] = useState(getStudents);
  const classNames = getClassNames();
  const [activeClass, setActiveClass] = useState(classNames[0]||'');
  const [weekAnchor, setWeekAnchor] = useState(isoToday());
  const [year, setYear] = useState(currentSchoolYear());
  const [attData, setAttData] = useState(() => getAttendance(year));
  const [toast, setToast] = useState('');
  const TODAY = isoToday();
  const weekDates = getWeekDates(weekAnchor);

  function refreshAtt(y) { setAttData(getAttendance(y||year)); }

  function toggle(studentId, date) {
    const cur = attData[studentId]?.[date]||null;
    const next = CYCLE[(CYCLE.indexOf(cur)+1)%CYCLE.length];
    setAttendance(studentId, date, next, year);
    refreshAtt();
    const s = students.find(s=>s.id===studentId);
    showToast(`${s?.forename} ${s?.surname} — ${next?STATUS_LABELS[next]:'Cleared'}`);
  }

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''),2000); }
  function shiftWeek(dir) {
    const d=new Date(weekDates[0]+'T12:00:00'); d.setDate(d.getDate()+dir*7);
    setWeekAnchor(d.toISOString().split('T')[0]);
  }

  const filtered = students.filter(s=>s.class===activeClass);

  const dailyCounts = weekDates.map(date=>({
    date,
    P: filtered.filter(s=>attData[s.id]?.[date]==='P').length,
    L: filtered.filter(s=>attData[s.id]?.[date]==='L').length,
    A: filtered.filter(s=>attData[s.id]?.[date]==='A').length,
    total: filtered.filter(s=>attData[s.id]?.[date]).length,
  }));

  const todayCount = dailyCounts.find(d=>d.date===TODAY)||{P:0,L:0,A:0};
  const avgAtt = filtered.length ? Math.round(filtered.reduce((s,st)=>s+calcAttendancePct(st.id,year),0)/filtered.length) : 0;
  const weekLabel = `${new Date(weekDates[0]+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'})} – ${new Date(weekDates[3]+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'})}`;

  return (
    <Layout title="Attendance" subtitle={`${activeClass} · ${year} · ${weekLabel}`}>
      {/* Class + Year tabs */}
      <div className="class-tabs">
        {classNames.map(c=>(
          <button key={c} className={`class-tab ${activeClass===c?'active':''}`} onClick={()=>setActiveClass(c)}>{c}</button>
        ))}
        <div className="tab-divider"/>
        {SCHOOL_YEARS.map(y=>(
          <button key={y} className={`year-tab ${year===y?'active':''}`} onClick={()=>{ setYear(y); refreshAtt(y); }}>{y}</button>
        ))}
      </div>

      {/* Metrics */}
      <div className="metrics-grid mb-6">
        <div className="metric-card"><div className="metric-icon green"><span style={{fontSize:16}}>✓</span></div><div className="metric-value">{todayCount.P}</div><div className="metric-label">Present today</div></div>
        <div className="metric-card"><div className="metric-icon amber"><span style={{fontSize:16}}>~</span></div><div className="metric-value">{todayCount.L}</div><div className="metric-label">Late today</div></div>
        <div className="metric-card"><div className="metric-icon red"><span style={{fontSize:16}}>✗</span></div><div className="metric-value">{todayCount.A}</div><div className="metric-label">Absent today</div></div>
        <div className="metric-card"><div className="metric-icon dark"><span style={{fontSize:16}}>%</span></div><div className="metric-value">{avgAtt}%</div><div className="metric-label">Avg — {activeClass}</div></div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Register — {activeClass} · {year}</div>
            <div className="card-sub">Click to cycle P → L → A → Clear · Mon–Thu only</div>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn btn-sm" onClick={()=>shiftWeek(-1)}>← Prev</button>
            <button className="btn btn-sm btn-primary" onClick={()=>setWeekAnchor(isoToday())}>Today</button>
            <button className="btn btn-sm" onClick={()=>shiftWeek(1)}>Next →</button>
          </div>
        </div>

        {/* Legend */}
        <div style={{display:'flex',gap:12,marginBottom:14,flexWrap:'wrap'}}>
          {[['#276749','P','Present'],['#d69e2e','L','Late'],['#c53030','A','Absent']].map(([bg,l,label])=>(
            <div key={label} className="flex items-center gap-2 text-sm text-muted">
              <div style={{width:26,height:26,borderRadius:6,background:bg,color:'#fff',fontWeight:700,fontSize:12,display:'flex',alignItems:'center',justifyContent:'center'}}>{l}</div>
              {label}
            </div>
          ))}
        </div>

        {/* Scrollable table container */}
        <div style={{overflowX:'auto'}}>
          <table style={{minWidth:480,borderCollapse:'collapse',width:'100%',fontSize:13}}>
            <thead>
              <tr>
                <th style={{textAlign:'left',fontSize:11,fontWeight:600,letterSpacing:'0.04em',color:'var(--text-muted)',textTransform:'uppercase',padding:'10px 12px 10px 16px',borderBottom:'1px solid var(--border)',position:'sticky',top:0,background:'var(--surface)',zIndex:1,minWidth:170}}>Student</th>
                {weekDates.map(d=>(
                  <th key={d} style={{textAlign:'center',fontSize:11,fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',padding:'10px 6px',borderBottom:'1px solid var(--border)',position:'sticky',top:0,background:'var(--surface)',zIndex:1,minWidth:60}}>
                    <div>{new Date(d+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short'})}</div>
                    <div style={{fontWeight:d===TODAY?700:400,fontSize:10,color:d===TODAY?'var(--rose-dark)':undefined}}>
                      {new Date(d+'T12:00:00').getDate()}/{new Date(d+'T12:00:00').getMonth()+1}
                    </div>
                  </th>
                ))}
                <th style={{textAlign:'center',fontSize:11,fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',padding:'10px 6px',borderBottom:'1px solid var(--border)',position:'sticky',top:0,background:'var(--surface)',zIndex:1,minWidth:160}}>P / L / A / %</th>
              </tr>
            </thead>
            <tbody>
              {/* Scrollable body */}
              {filtered.map(s=>{
                const pct = calcAttendancePct(s.id, year);
                const c = calcAttendanceCounts(s.id, year);
                return (
                  <tr key={s.id}>
                    <td style={{padding:'10px 12px 10px 16px',borderBottom:'1px solid var(--border)',verticalAlign:'middle'}}>
                      <div className="flex items-center gap-2">
                        <div className="avatar" style={{width:26,height:26,fontSize:10}}>{avatarInitials(s.forename+' '+s.surname)}</div>
                        <div style={{fontWeight:500,fontSize:13}}>{s.forename} {s.surname}</div>
                      </div>
                    </td>
                    {weekDates.map(date=>{
                      const status=attData[s.id]?.[date];
                      let bg='var(--charcoal-faint)',color='var(--text-soft)',letter='·';
                      if(status==='P'){bg='#276749';color='#fff';letter='P';}
                      else if(status==='L'){bg='#d69e2e';color='#fff';letter='L';}
                      else if(status==='A'){bg='#c53030';color='#fff';letter='A';}
                      return (
                        <td key={date} style={{textAlign:'center',padding:'10px 6px',borderBottom:'1px solid var(--border)',background:date===TODAY?'rgba(225,29,120,0.04)':undefined}}>
                          <button onClick={()=>toggle(s.id,date)} title={STATUS_LABELS[status]||'Not marked'} className="att-btn" style={{background:bg,color}}>{letter}</button>
                        </td>
                      );
                    })}
                    {/* P/L/A counts + % in boxes */}
                    <td style={{textAlign:'center',padding:'10px 6px',borderBottom:'1px solid var(--border)'}}>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:4,flexWrap:'wrap'}}>
                        <span className="att-stat-box att-stat-p">{c.present}</span>
                        <span className="att-stat-box att-stat-l">{c.late}</span>
                        <span className="att-stat-box att-stat-a">{c.absent}</span>
                        <span className="att-stat-box att-stat-pct">{pct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {/* Daily count row */}
              {filtered.length>0 && (
                <tr style={{borderTop:'2px solid var(--border-strong)'}}>
                  <td style={{padding:'10px 12px 10px 16px',fontSize:12,fontWeight:600,color:'var(--text-muted)'}}>Daily count</td>
                  {dailyCounts.map(dc=>(
                    <td key={dc.date} style={{textAlign:'center',padding:'10px 6px',background:dc.date===TODAY?'rgba(225,29,120,0.04)':undefined}}>
                      {dc.total>0?(
                        <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:3}}>
                          <span className="day-count-box" style={{background:'#276749',color:'#fff'}}>{dc.P}</span>
                          {dc.L>0 && <span className="day-count-box" style={{background:'#d69e2e',color:'#fff'}}>L:{dc.L}</span>}
                          {dc.A>0 && <span className="day-count-box" style={{background:'#c53030',color:'#fff'}}>A:{dc.A}</span>}
                        </div>
                      ):<span style={{color:'var(--text-soft)',fontSize:12}}>—</span>}
                    </td>
                  ))}
                  <td/>
                </tr>
              )}

              {filtered.length===0 && (
                <tr><td colSpan={6} style={{textAlign:'center',padding:24,color:'var(--text-muted)'}}>No students in {activeClass}.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {toast && <div className="toast">✓ {toast}</div>}
    </Layout>
  );
}
