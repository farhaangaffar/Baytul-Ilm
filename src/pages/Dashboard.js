import React, { useState } from 'react';
import Layout from '../components/Layout';
import EnrollmentForm from '../components/EnrollmentForm';
import { getStudents, getFees, getAttendance, avatarInitials, getClassNames, currentSchoolYear, getCurrentSchoolMonth } from '../lib/store';
import { Plus } from 'lucide-react';

export default function Dashboard() {
  const [showEnroll, setShowEnroll] = useState(false);
  const [students, setStudents] = useState(getStudents);
  const classNames = getClassNames();
  const year = currentSchoolYear();
  const fees = getFees(year);
  const attendance = getAttendance(year);
  const schoolMonth = getCurrentSchoolMonth();

  const active = students.filter(s => s.status === 'Active');

  const monthFees = fees.filter(f => f.weekStarting >= schoolMonth.start && f.weekStarting < schoolMonth.endExclusive);
  const collected = monthFees.filter(f => f.status === 'Paid').reduce((s, f) => s + Number(f.amount), 0);
  const monthOutstandingFees = monthFees.filter(f => f.status !== 'Paid');

  const owedByStudent = active
    .map(s => ({ student: s, owed: monthOutstandingFees.filter(f => f.studentId === s.id).reduce((sum, f) => sum + Number(f.amount), 0) }))
    .filter(x => x.owed > 0)
    .sort((a, b) => b.owed - a.owed);
  const totalOwed = owedByStudent.reduce((s, x) => s + x.owed, 0);

  function monthAttendancePct(studentId) {
    const rec = attendance[studentId] || {};
    const days = Object.entries(rec).filter(([date]) => date >= schoolMonth.start && date < schoolMonth.endExclusive).map(([,status]) => status);
    if (!days.length) return 0;
    return Math.round((days.filter(d => d==='P'||d==='L').length / days.length) * 100);
  }

  const dateStr = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <Layout title="Dashboard" subtitle={`Overview · ${year}`}>
      <div className="hero hero-ink">
        <div>
          <div className="hero-arabic">السلام عليكم</div>
          <div className="hero-greeting">Assalamu Alaikum</div>
          <div className="hero-sub">{dateStr} · {schoolMonth.label}</div>
        </div>
        <div className="hero-stats">
          <div className="hero-stat"><div className="n">{active.length}</div><div className="l">Students</div></div>
          <div className="hero-stat"><div className="n">£{collected.toFixed(2)}</div><div className="l">Collected</div></div>
          <div className="hero-stat"><div className="n">£{totalOwed.toFixed(2)}</div><div className="l">Outstanding</div></div>
        </div>
      </div>

      <div className="grid-2" style={{marginTop:14}}>
        {classNames.map(cls => {
          const classStudents = students.filter(s => s.class === cls);
          return (
            <div className="card" style={{padding:'14px 16px'}} key={cls}>
              <div className="card-header" style={{marginBottom:10}}>
                <div>
                  <div className="card-title">{cls}</div>
                  <div className="card-sub">{classStudents.length} students</div>
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => setShowEnroll(true)}>
                  <Plus size={13}/> Enroll
                </button>
              </div>
              <div style={{maxHeight:180, overflowY:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                  <thead>
                    <tr>
                      <th style={{textAlign:'left',fontSize:11,fontWeight:600,letterSpacing:'0.04em',color:'var(--text-muted)',textTransform:'uppercase',padding:'6px 12px 6px 0',borderBottom:'1px solid var(--border)',position:'sticky',top:0,background:'var(--surface)',zIndex:1}}>Name</th>
                      <th style={{textAlign:'left',fontSize:11,fontWeight:600,letterSpacing:'0.04em',color:'var(--text-muted)',textTransform:'uppercase',padding:'6px 12px 6px 0',borderBottom:'1px solid var(--border)',position:'sticky',top:0,background:'var(--surface)',zIndex:1}}>Parent contact</th>
                      <th style={{textAlign:'center',fontSize:11,fontWeight:600,letterSpacing:'0.04em',color:'var(--text-muted)',textTransform:'uppercase',padding:'6px 0',borderBottom:'1px solid var(--border)',position:'sticky',top:0,background:'var(--surface)',zIndex:1}}>Att.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classStudents.map(s => {
                      const att = monthAttendancePct(s.id);
                      const badgeColor = att>=90?'green':att>=75?'amber':att>0?'red':'gray';
                      return (
                        <tr key={s.id}>
                          <td style={{padding:'6px 12px 6px 0',borderBottom:'1px solid var(--border)'}}>
                            <div className="flex items-center gap-2">
                              <div className="avatar" style={{width:22,height:22,fontSize:9}}>{avatarInitials(s.forename+' '+s.surname)}</div>
                              <div style={{fontWeight:500}}>{s.forename} {s.surname}</div>
                            </div>
                          </td>
                          <td style={{padding:'6px 12px 6px 0',borderBottom:'1px solid var(--border)',color:'var(--text-muted)',fontSize:12}}>{s.parent1Phone}</td>
                          <td style={{padding:'6px 0',borderBottom:'1px solid var(--border)',textAlign:'center'}}>
                            <span className={`badge badge-${badgeColor}`}>{att>0?`${att}%`:'—'}</span>
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
      </div>

      <div className="card" style={{marginTop:10,padding:'14px 16px'}}>
        <div className="card-header" style={{marginBottom:8}}>
          <div>
            <div className="card-title">Outstanding fees</div>
            <div className="card-sub">£{totalOwed.toFixed(2)} across {owedByStudent.length} student{owedByStudent.length!==1?'s':''} · {schoolMonth.label}</div>
          </div>
        </div>
        <div style={{maxHeight:150, overflowY:'auto'}}>
          {owedByStudent.length === 0 ? (
            <div style={{textAlign:'center',padding:'20px 0',color:'var(--text-muted)'}}>
              <div style={{fontWeight:500,marginBottom:4}}>All fees up to date</div>
              <div style={{fontSize:12}}>No outstanding balances this month</div>
            </div>
          ) : (
            owedByStudent.map(({student:s,owed}) => (
              <div className="list-row" key={s.id} style={{padding:'6px 0'}}>
                <div className="flex items-center gap-2">
                  <div className="avatar" style={{width:22,height:22,fontSize:9}}>{avatarInitials(s.forename+' '+s.surname)}</div>
                  <div style={{fontWeight:500}}>{s.forename} {s.surname}</div>
                </div>
                <span className="badge badge-red">£{owed.toFixed(2)}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {showEnroll && <EnrollmentForm onClose={() => setShowEnroll(false)} onSaved={() => setStudents(getStudents())}/>}
    </Layout>
  );
}
