import React, { useState } from 'react';
import Layout from '../components/Layout';
import EnrollmentForm from '../components/EnrollmentForm';
import { getStudents, getFees, getAttendance, calcAttendancePct, avatarInitials, getClassNames, currentSchoolYear } from '../lib/store';
import { Plus } from 'lucide-react';

function isoToday() { return new Date().toISOString().split('T')[0]; }

export default function Dashboard() {
  const [showEnroll, setShowEnroll] = useState(false);
  const [students, setStudents] = useState(getStudents);
  const classNames = getClassNames();
  const year = currentSchoolYear();
  const fees = getFees(year);
  const attendance = getAttendance(year);
  const today = isoToday();

  const active = students.filter(s => s.status === 'Active');
  const present = active.filter(s => attendance[s.id]?.[today] === 'P').length;
  const late    = active.filter(s => attendance[s.id]?.[today] === 'L').length;
  const absent  = active.filter(s => attendance[s.id]?.[today] === 'A').length;
  const collected = fees.filter(f => f.status === 'Paid').reduce((s, f) => s + Number(f.amount), 0);

  const outstandingFees = fees.filter(f => f.status !== 'Paid');
  const owedByStudent = active
    .map(s => ({ student: s, owed: outstandingFees.filter(f => f.studentId === s.id).reduce((sum, f) => sum + Number(f.amount), 0) }))
    .filter(x => x.owed > 0)
    .sort((a, b) => b.owed - a.owed);
  const totalOwed = owedByStudent.reduce((s, x) => s + x.owed, 0);

  const dateStr = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <Layout title="Dashboard" subtitle={`Overview · ${year}`}>
      <div className="hero hero-ink">
        <div>
          <div className="hero-arabic">السلام عليكم</div>
          <div className="hero-greeting">Assalamu Alaikum</div>
          <div className="hero-sub">{dateStr} · {year}</div>
        </div>
        <div className="hero-stats">
          <div className="hero-stat"><div className="n">{active.length}</div><div className="l">Students</div></div>
          <div className="hero-stat"><div className="n">{present}</div><div className="l">Present</div></div>
          <div className="hero-stat"><div className="n">{late}</div><div className="l">Late</div></div>
          <div className="hero-stat"><div className="n">{absent}</div><div className="l">Absent</div></div>
          <div className="hero-stat"><div className="n">£{collected.toFixed(2)}</div><div className="l">Collected</div></div>
        </div>
      </div>

      <div className="dashboard-cards">
        {classNames.map(cls => {
          const classStudents = students.filter(s => s.class === cls);
          return (
            <div className="card" key={cls}>
              <div className="card-header">
                <div>
                  <div className="card-title">{cls}</div>
                  <div className="card-sub">{classStudents.length} students</div>
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => setShowEnroll(true)}>
                  <Plus size={13}/> Enroll
                </button>
              </div>
              <div style={{maxHeight:320, overflowY:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                  <thead>
                    <tr>
                      <th style={{textAlign:'left',fontSize:11,fontWeight:600,letterSpacing:'0.04em',color:'var(--text-muted)',textTransform:'uppercase',padding:'8px 12px 8px 0',borderBottom:'1px solid var(--border)',position:'sticky',top:0,background:'var(--surface)',zIndex:1}}>Name</th>
                      <th style={{textAlign:'left',fontSize:11,fontWeight:600,letterSpacing:'0.04em',color:'var(--text-muted)',textTransform:'uppercase',padding:'8px 12px 8px 0',borderBottom:'1px solid var(--border)',position:'sticky',top:0,background:'var(--surface)',zIndex:1}}>Parent contact</th>
                      <th style={{textAlign:'center',fontSize:11,fontWeight:600,letterSpacing:'0.04em',color:'var(--text-muted)',textTransform:'uppercase',padding:'8px 0',borderBottom:'1px solid var(--border)',position:'sticky',top:0,background:'var(--surface)',zIndex:1}}>Att.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classStudents.map(s => {
                      const att = calcAttendancePct(s.id, year);
                      return (
                        <tr key={s.id}>
                          <td style={{padding:'9px 12px 9px 0',borderBottom:'1px solid var(--border)'}}>
                            <div className="flex items-center gap-2">
                              <div className="avatar" style={{width:26,height:26,fontSize:10}}>{avatarInitials(s.forename+' '+s.surname)}</div>
                              <div style={{fontWeight:500}}>{s.forename} {s.surname}</div>
                            </div>
                          </td>
                          <td style={{padding:'9px 12px 9px 0',borderBottom:'1px solid var(--border)',color:'var(--text-muted)',fontSize:12}}>{s.parent1Phone}</td>
                          <td style={{padding:'9px 0',borderBottom:'1px solid var(--border)',textAlign:'center',fontWeight:600,color:att>=90?'var(--green)':att>=75?'var(--amber)':att>0?'var(--red)':'var(--text-soft)'}}>
                            {att>0?`${att}%`:'—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Outstanding fees</div>
              <div className="card-sub">£{totalOwed.toFixed(2)} across {owedByStudent.length} student{owedByStudent.length!==1?'s':''}</div>
            </div>
          </div>
          <div style={{maxHeight:320, overflowY:'auto'}}>
            {owedByStudent.length === 0 ? (
              <div style={{textAlign:'center',padding:'40px 0',color:'var(--text-muted)'}}>
                <div style={{fontWeight:500,marginBottom:4}}>All fees up to date</div>
                <div style={{fontSize:12}}>No outstanding balances</div>
              </div>
            ) : (
              owedByStudent.map(({student:s,owed}) => (
                <div className="list-row" key={s.id}>
                  <div className="flex items-center gap-2">
                    <div className="avatar" style={{width:26,height:26,fontSize:10}}>{avatarInitials(s.forename+' '+s.surname)}</div>
                    <div style={{fontWeight:500}}>{s.forename} {s.surname}</div>
                  </div>
                  <span className="badge badge-red">£{owed.toFixed(2)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {showEnroll && <EnrollmentForm onClose={() => setShowEnroll(false)} onSaved={() => setStudents(getStudents())}/>}
    </Layout>
  );
}
