// pages/Attendance.js
import React, { useState } from 'react';
import Layout from '../components/Layout';
import { getStudents, getAttendance, setAttendance, calcAttendancePct, avatarInitials, getClassNames, getWeekDates } from '../lib/store';

function isoToday() { return new Date().toISOString().split('T')[0]; }

const STATUS_LABELS = { P:'Present', L:'Late', A:'Absent' };
const CYCLE = ['P','L','A',null];

export default function Attendance() {
  const [students] = useState(getStudents);
  const [att, setAtt] = useState(getAttendance);
  const [toast, setToast] = useState('');
  const classNames = getClassNames();
  const [activeClass, setActiveClass] = useState(classNames[0] || '');
  const [weekAnchor, setWeekAnchor] = useState(isoToday());
  const weekDates = getWeekDates(weekAnchor); // Mon–Thu only
  const TODAY = isoToday();

  function toggle(studentId, date) {
    const cur = att[studentId]?.[date] || null;
    const next = CYCLE[(CYCLE.indexOf(cur)+1) % CYCLE.length];
    setAttendance(studentId, date, next);
    setAtt(getAttendance());
    const s = students.find(s => s.id === studentId);
    showToast(`${s?.forename} ${s?.surname} — ${next ? STATUS_LABELS[next] : 'Cleared'}`);
  }

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 2000); }
  function shiftWeek(dir) {
    const d = new Date(weekDates[0] + 'T12:00:00');
    d.setDate(d.getDate() + dir*7);
    setWeekAnchor(d.toISOString().split('T')[0]);
  }

  const filtered = students.filter(s => s.class === activeClass);

  const dailyCounts = weekDates.map(date => ({
    date,
    P: filtered.filter(s => att[s.id]?.[date]==='P').length,
    L: filtered.filter(s => att[s.id]?.[date]==='L').length,
    A: filtered.filter(s => att[s.id]?.[date]==='A').length,
    total: filtered.filter(s => att[s.id]?.[date]).length,
  }));

  const todayCount = dailyCounts.find(d => d.date===TODAY) || { P:0, L:0, A:0 };
  const avgAtt = filtered.length ? Math.round(filtered.reduce((s,st)=>s+calcAttendancePct(st.id),0)/filtered.length) : 0;

  const weekLabel = `${new Date(weekDates[0]+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'})} – ${new Date(weekDates[3]+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'})}`;

  return (
    <Layout title="Attendance" subtitle={`Week of ${weekLabel} — Mon to Thu`}>
      <div className="class-tabs">
        {classNames.map(c => (
          <button key={c} className={`class-tab ${activeClass===c?'active':''}`} onClick={() => setActiveClass(c)}>{c}</button>
        ))}
      </div>

      <div className="metrics-grid mb-6">
        <div className="metric-card"><div className="metric-icon green" style={{background:'#f0fff4',color:'#276749'}}><span style={{fontSize:18}}>✓</span></div><div className="metric-value">{todayCount.P}</div><div className="metric-label">Present today</div></div>
        <div className="metric-card"><div className="metric-icon gold"><span style={{fontSize:18}}>~</span></div><div className="metric-value">{todayCount.L}</div><div className="metric-label">Late today</div></div>
        <div className="metric-card"><div className="metric-icon red"><span style={{fontSize:18}}>✗</span></div><div className="metric-value">{todayCount.A}</div><div className="metric-label">Absent today</div></div>
        <div className="metric-card"><div className="metric-icon brown"><span style={{fontSize:18}}>%</span></div><div className="metric-value">{avgAtt}%</div><div className="metric-label">Avg — {activeClass}</div></div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Register — {activeClass}</div>
            <div className="card-sub">Click to cycle: Present → Late → Absent → Clear &nbsp;·&nbsp; Mon–Thu only</div>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn btn-sm" onClick={() => shiftWeek(-1)}>← Prev</button>
            <button className="btn btn-sm btn-primary" onClick={() => setWeekAnchor(isoToday())}>Today</button>
            <button className="btn btn-sm" onClick={() => shiftWeek(1)}>Next →</button>
          </div>
        </div>

        {/* Legend */}
        <div style={{display:'flex',gap:12,marginBottom:14,flexWrap:'wrap'}}>
          {[['#276749','P','Present'],['#d69e2e','L','Late'],['#c53030','A','Absent']].map(([bg,letter,label])=>(
            <div key={label} className="flex items-center gap-2 text-sm text-muted">
              <div style={{width:26,height:26,borderRadius:6,background:bg,color:'#fff',fontWeight:700,fontSize:12,display:'flex',alignItems:'center',justifyContent:'center'}}>{letter}</div>
              {label}
            </div>
          ))}
        </div>

        <div style={{overflowX:'auto'}}>
          <table style={{minWidth:420}}>
            <thead>
              <tr>
                <th style={{minWidth:160}}>Student</th>
                {weekDates.map(d => (
                  <th key={d} style={{textAlign:'center',minWidth:60}}>
                    <div>{new Date(d+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short'})}</div>
                    <div style={{fontWeight:d===TODAY?700:400,fontSize:10,color:d===TODAY?'var(--gold)':undefined}}>
                      {new Date(d+'T12:00:00').getDate()}/{new Date(d+'T12:00:00').getMonth()+1}
                    </div>
                  </th>
                ))}
                <th style={{textAlign:'center'}}>%</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => {
                const pct = calcAttendancePct(s.id);
                return (
                  <tr key={s.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="avatar" style={{width:26,height:26,fontSize:10}}>{avatarInitials(s.forename+' '+s.surname)}</div>
                        <div style={{fontWeight:500,fontSize:13}}>{s.forename} {s.surname}</div>
                      </div>
                    </td>
                    {weekDates.map(date => {
                      const status = att[s.id]?.[date];
                      let bg='var(--sand)', color='var(--text-soft)', letter='·';
                      if (status==='P'){bg='#276749';color='#fff';letter='P';}
                      else if (status==='L'){bg='#d69e2e';color='#fff';letter='L';}
                      else if (status==='A'){bg='#c53030';color='#fff';letter='A';}
                      return (
                        <td key={date} style={{textAlign:'center',background:date===TODAY?'rgba(200,150,12,0.05)':undefined}}>
                          <button
                            onClick={() => toggle(s.id,date)}
                            title={STATUS_LABELS[status]||'Not marked'}
                            className="att-btn"
                            style={{background:bg,color,fontFamily:'var(--font)'}}
                          >{letter}</button>
                        </td>
                      );
                    })}
                    <td style={{textAlign:'center',fontWeight:600,color:pct>=90?'#276749':pct>=75?'var(--amber)':'var(--red)'}}>
                      {pct}%
                    </td>
                  </tr>
                );
              })}

              {/* Daily count row */}
              {filtered.length > 0 && (
                <tr style={{borderTop:'2px solid var(--border)'}}>
                  <td style={{fontSize:12,fontWeight:600,color:'var(--text-muted)',paddingTop:10}}>Daily count</td>
                  {dailyCounts.map(dc => (
                    <td key={dc.date} style={{textAlign:'center',paddingTop:10,background:dc.date===TODAY?'rgba(200,150,12,0.05)':undefined}}>
                      {dc.total>0 ? (
                        <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:1,fontSize:11}}>
                          <span style={{fontWeight:700,color:'#276749',fontSize:13}}>{dc.P}</span>
                          {dc.L>0 && <span style={{color:'#d69e2e',fontWeight:600}}>L:{dc.L}</span>}
                          {dc.A>0 && <span style={{color:'#c53030',fontWeight:600}}>A:{dc.A}</span>}
                        </div>
                      ) : <span style={{color:'var(--text-soft)'}}>—</span>}
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
