import React, { useState, useMemo } from 'react';
import Layout from '../components/Layout';
import {
  getFees, getStudents, markFeePaid, markFeeUnpaid, addFeeRecord,
  deleteFeeRecord, deleteWeekFees, updateFeeAmount, getMondayOf,
  getWeekStartsForMonth, avatarInitials, getClassNames,
  getAcademicYears, currentSchoolYear
} from '../lib/store';
import { Plus, X, Pencil, Check, Trash2, Calendar } from 'lucide-react';

function isoToday() { return new Date().toISOString().split('T')[0]; }
function monthLabel(ym) {
  const [y,m]=ym.split('-').map(Number);
  return new Date(y,m-1,1).toLocaleDateString('en-GB',{month:'long',year:'numeric'});
}

export default function Fees() {
  const students = getStudents();
  const classNames = getClassNames();
  const years = getAcademicYears();
  const [year, setYear] = useState(currentSchoolYear());
  const [fees, setFees] = useState(()=>getFees(year));
  const [activeClass, setActiveClass] = useState(classNames[0]||'');
  const [showAddMonth, setShowAddMonth] = useState(false);
  const [addMonthVal, setAddMonthVal] = useState(isoToday().slice(0,7));
  const [editCell, setEditCell] = useState(null);
  const [confirmDelWeek, setConfirmDelWeek] = useState(null);
  const [toast, setToast] = useState('');

  function refresh(y2) { setFees(getFees(y2||year)); }
  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''),2500); }

  function togglePaid(fee) {
    if (fee.status==='Paid') markFeeUnpaid(fee.id,year);
    else markFeePaid(fee.id,year);
    refresh();
    showToast(fee.status==='Paid'?'Marked as unpaid':'Marked as paid ✓');
  }

  function saveEdit(feeId) {
    const val=parseFloat(editCell.val);
    if (!isNaN(val)&&val>=0) { updateFeeAmount(feeId,val,year); refresh(); showToast('Amount updated'); }
    setEditCell(null);
  }

  function addMonth() {
    const weeks=getWeekStartsForMonth(addMonthVal);
    const classStudents=students.filter(s=>s.status==='Active'&&s.class===activeClass);
    const existingWeeks=new Set(fees.filter(f=>classStudents.find(s=>s.id===f.studentId)).map(f=>f.weekStarting));
    let count=0;
    weeks.forEach(w=>{
      if (!existingWeeks.has(w)) {
        classStudents.forEach(s=>{ addFeeRecord({studentId:s.id,weekStarting:w,amount:s.weeklyFee||15,status:'Pending'},year); count++; });
      }
    });
    refresh();
    setShowAddMonth(false);
    showToast(count>0?`${weeks.length} weeks added for ${monthLabel(addMonthVal)}`:`All weeks already exist for ${monthLabel(addMonthVal)}`);
  }

  function doDeleteWeek(weekStarting) {
    deleteWeekFees(weekStarting,year,activeClass,students);
    refresh();
    setConfirmDelWeek(null);
    showToast(`Week of ${weekStarting} removed`);
  }

  const classStudents = students.filter(s=>s.class===activeClass);
  const classFees = fees.filter(f=>classStudents.find(s=>s.id===f.studentId));
  const weeks = [...new Set(classFees.map(f=>f.weekStarting))].sort();

  const lookup = useMemo(()=>{
    const m={};
    classFees.forEach(f=>{ if(!m[f.studentId])m[f.studentId]={}; m[f.studentId][f.weekStarting]=f; });
    return m;
  },[classFees]);

  const totalPaid = classFees.filter(f=>f.status==='Paid').reduce((s,f)=>s+Number(f.amount),0);
  const totalOwed = classFees.filter(f=>f.status!=='Paid').reduce((s,f)=>s+Number(f.amount),0);

  // Group weeks by month for display
  const weeksByMonth = useMemo(()=>{
    const groups={};
    weeks.forEach(w=>{
      const ym=w.slice(0,7);
      if(!groups[ym])groups[ym]=[];
      groups[ym].push(w);
    });
    return groups;
  },[weeks]);

  return (
    <Layout title="Fee management" subtitle="By month — students as rows, weeks as columns">
      <div className="class-tabs">
        {classNames.map(c=>(
          <button key={c} className={`class-tab ${activeClass===c?'active':''}`} onClick={()=>setActiveClass(c)}>{c}</button>
        ))}
        <div className="tab-divider"/>
        {years.map(y=>(
          <button key={y} className={`year-tab ${year===y?'active':''}`} onClick={()=>{ setYear(y); refresh(y); }}>{y}</button>
        ))}
      </div>

      <div className="metrics-grid mb-6">
        <div className="metric-card"><div className="metric-icon green"/><div className="metric-value" style={{color:'var(--green)'}}>£{totalPaid.toFixed(2)}</div><div className="metric-label">Collected — {activeClass}</div></div>
        <div className="metric-card"><div className="metric-icon red"/><div className="metric-value" style={{color:'var(--red)'}}>£{totalOwed.toFixed(2)}</div><div className="metric-label">Outstanding</div></div>
        <div className="metric-card"><div className="metric-icon amber"/><div className="metric-value">{classFees.filter(f=>f.status!=='Paid').length}</div><div className="metric-label">Unpaid records</div></div>
        <div className="metric-card"><div className="metric-icon dark"/><div className="metric-value">{classStudents.filter(s=>s.status==='Active').length}</div><div className="metric-label">Active students</div></div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Fee register — {activeClass} · {year}</div>
            <div className="card-sub">✓ = paid · ✗ = due · click to toggle · click £ to edit · 🗑 to remove a week</div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={()=>setShowAddMonth(true)}>
            <Calendar size={13}/> Add a month
          </button>
        </div>

        {weeks.length===0 ? (
          <div style={{textAlign:'center',padding:48,color:'var(--text-muted)'}}>
            <Calendar size={36} style={{opacity:.2,marginBottom:12,display:'block',margin:'0 auto 12px'}}/>
            <div style={{fontWeight:500,marginBottom:6}}>No fee records yet</div>
            <div style={{fontSize:12}}>Click "Add a month" to generate weeks for {activeClass}</div>
          </div>
        ) : (
          <div className="fee-grid-outer">
            <div style={{overflowX:'auto'}}>
              <table className="fee-grid-table">
                <thead>
                  <tr>
                    <th className="name-col">Student</th>
                    {/* Month group headers */}
                    {Object.entries(weeksByMonth).map(([ym,wks])=>(
                      <th key={ym} colSpan={wks.length} style={{borderBottom:'1px solid rgba(255,255,255,0.15)',background:'#2a2a22',color:ym===isoToday().slice(0,7)?'#a3e635':'rgba(255,255,255,.65)',fontSize:11}}>
                        {monthLabel(ym)}
                      </th>
                    ))}
                    <th className="total-col paid-col" style={{minWidth:90}}>Paid</th>
                    <th className="total-col owed-col" style={{minWidth:90}}>Owed</th>
                  </tr>
                  <tr>
                    <th className="name-col" style={{top:'37px'}}></th>
                    {weeks.map(w=>(
                      <th key={w} style={{minWidth:72,top:'37px',fontSize:10}}>
                        <div style={{marginBottom:3}}>{new Date(w+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</div>
                        <button
                          onClick={()=>setConfirmDelWeek(w)}
                          title="Remove this week"
                          style={{background:'none',border:'none',cursor:'pointer',color:'rgba(255,100,100,.7)',padding:0,fontSize:11}}
                        ><Trash2 size={10}/></button>
                      </th>
                    ))}
                    <th className="total-col paid-col" style={{top:'37px',minWidth:90}}></th>
                    <th className="total-col owed-col" style={{top:'37px',minWidth:90}}></th>
                  </tr>
                </thead>
                <tbody>
                  {classStudents.map(s=>{
                    const sPaid=weeks.reduce((sum,w)=>{ const f=lookup[s.id]?.[w]; return sum+(f&&f.status==='Paid'?Number(f.amount):0); },0);
                    const sOwed=weeks.reduce((sum,w)=>{ const f=lookup[s.id]?.[w]; return sum+(f&&f.status!=='Paid'?Number(f.amount):0); },0);
                    return (
                      <tr key={s.id}>
                        <td className="name-col">
                          <div className="flex items-center gap-2">
                            <div className="avatar" style={{width:24,height:24,fontSize:9}}>{avatarInitials(s.forename+' '+s.surname)}</div>
                            <div>
                              <div style={{fontWeight:500,fontSize:12}}>{s.forename} {s.surname}</div>
                              <div style={{fontSize:10,color:'var(--text-muted)'}}>£{s.weeklyFee}/wk</div>
                            </div>
                          </div>
                        </td>
                        {weeks.map(w=>{
                          const f=lookup[s.id]?.[w];
                          if (!f) return <td key={w}><div style={{display:'flex',justifyContent:'center'}}><div className="fee-empty">—</div></div></td>;
                          const isEditing=editCell?.feeId===f.id;
                          return (
                            <td key={w}>
                              <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:3}}>
                                <button className={f.status==='Paid'?'fee-tick':'fee-cross'} onClick={()=>togglePaid(f)}>
                                  {f.status==='Paid'?'✓':'✗'}
                                </button>
                                {isEditing ? (
                                  <div style={{display:'flex',alignItems:'center',gap:2}}>
                                    <input type="number" value={editCell.val}
                                      onChange={e=>setEditCell({...editCell,val:e.target.value})}
                                      onKeyDown={e=>{if(e.key==='Enter')saveEdit(f.id);if(e.key==='Escape')setEditCell(null);}}
                                      autoFocus
                                      style={{width:44,padding:'2px 4px',fontSize:11,border:'1px solid var(--lime)',borderRadius:4,fontFamily:'var(--font)',textAlign:'center'}}
                                    />
                                    <button style={{background:'none',border:'none',cursor:'pointer',color:'var(--green)',padding:1}} onClick={()=>saveEdit(f.id)}><Check size={11}/></button>
                                    <button style={{background:'none',border:'none',cursor:'pointer',color:'var(--red)',padding:1}} onClick={()=>setEditCell(null)}><X size={11}/></button>
                                  </div>
                                ) : (
                                  <button style={{background:'none',border:'none',cursor:'pointer',fontSize:11,color:'var(--text-muted)',display:'flex',alignItems:'center',gap:2,fontFamily:'var(--font)',padding:'1px 3px',borderRadius:3}}
                                    title="Edit amount" onClick={()=>setEditCell({feeId:f.id,val:String(f.amount)})}>
                                    £{Number(f.amount).toFixed(2)}<Pencil size={9} style={{opacity:.5}}/>
                                  </button>
                                )}
                              </div>
                            </td>
                          );
                        })}
                        <td className="total-col paid-col" style={{color:'var(--green)'}}>£{sPaid.toFixed(2)}</td>
                        <td className="total-col owed-col" style={{color:sOwed>0?'var(--red)':undefined}}>{sOwed>0?`£${sOwed.toFixed(2)}`:'—'}</td>
                      </tr>
                    );
                  })}
                  {/* Totals row */}
                  <tr style={{borderTop:'2px solid var(--border-strong)',background:'var(--lime-light)'}}>
                    <td className="name-col" style={{fontWeight:600,fontSize:12,color:'var(--ink)'}}>Week total</td>
                    {weeks.map(w=>{
                      const wP=classFees.filter(f=>f.weekStarting===w&&f.status==='Paid').reduce((s,f)=>s+Number(f.amount),0);
                      const wO=classFees.filter(f=>f.weekStarting===w&&f.status!=='Paid').reduce((s,f)=>s+Number(f.amount),0);
                      return (
                        <td key={w} style={{textAlign:'center',fontSize:11}}>
                          <div style={{fontWeight:600,color:'var(--green)'}}>£{wP.toFixed(0)}</div>
                          {wO>0&&<div style={{color:'var(--red)',fontSize:10}}>-£{wO.toFixed(0)}</div>}
                        </td>
                      );
                    })}
                    <td className="total-col paid-col" style={{color:'var(--green)',fontWeight:700}}>£{totalPaid.toFixed(2)}</td>
                    <td className="total-col owed-col" style={{color:totalOwed>0?'var(--red)':undefined,fontWeight:700}}>{totalOwed>0?`£${totalOwed.toFixed(2)}`:'—'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Add month modal */}
      {showAddMonth&&(
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowAddMonth(false)}>
          <div className="modal" style={{maxWidth:460}}>
            <div className="modal-header">
              <div className="modal-title">Add a month — {activeClass}</div>
              <button className="btn btn-icon" onClick={()=>setShowAddMonth(false)}><X size={16}/></button>
            </div>
            <div className="modal-body">
              <div className="form-group" style={{marginBottom:16}}>
                <label>Select month</label>
                <input type="month" value={addMonthVal} onChange={e=>setAddMonthVal(e.target.value)}
                  style={{padding:'9px 14px',border:'1px solid var(--border)',borderRadius:'var(--r-md)',fontFamily:'var(--font)',fontSize:13}}/>
              </div>
              {addMonthVal&&(()=>{
                const weeks=getWeekStartsForMonth(addMonthVal);
                return (
                  <div style={{background:'var(--ink-faint)',borderRadius:'var(--r-md)',padding:'12px 16px',fontSize:13}}>
                    <div style={{fontWeight:600,marginBottom:8,color:'var(--ink)'}}>
                      {weeks.length} week{weeks.length!==1?'s':''} will be added for {monthLabel(addMonthVal)}:
                    </div>
                    {weeks.map(w=>(
                      <div key={w} style={{display:'flex',justifyContent:'space-between',padding:'4px 0',borderBottom:'1px solid var(--border)',fontSize:12}}>
                        <span style={{color:'var(--text-muted)'}}>w/c {w}</span>
                        <span style={{fontWeight:500}}>
                          {classStudents.filter(s=>s.status==='Active').length} students
                        </span>
                      </div>
                    ))}
                    <div style={{marginTop:10,fontSize:12,color:'var(--text-muted)'}}>
                      Each student charged at their individual weekly rate. Weeks already added are skipped.
                    </div>
                  </div>
                );
              })()}
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={()=>setShowAddMonth(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={addMonth}>Add month</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete week confirm */}
      {confirmDelWeek&&(
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setConfirmDelWeek(null)}>
          <div className="modal" style={{maxWidth:400}}>
            <div className="modal-body" style={{textAlign:'center',paddingTop:28}}>
              <div style={{width:52,height:52,borderRadius:'50%',background:'var(--red-light)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px'}}>
                <Trash2 size={24} color="var(--red)"/>
              </div>
              <div style={{fontSize:16,fontWeight:600,marginBottom:6}}>Remove week of {confirmDelWeek}?</div>
              <div style={{color:'var(--text-muted)',fontSize:13}}>
                This will delete all {activeClass} fee records for this week. Paid records will also be removed.
              </div>
            </div>
            <div className="modal-footer" style={{justifyContent:'center'}}>
              <button className="btn" onClick={()=>setConfirmDelWeek(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={()=>doDeleteWeek(confirmDelWeek)}><Trash2 size={13}/>Remove week</button>
            </div>
          </div>
        </div>
      )}

      {toast&&<div className="toast">✓ {toast}</div>}
    </Layout>
  );
}
