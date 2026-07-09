import React, { useState } from 'react';
import Layout from '../components/Layout';
import {
  getFees, getStudents, markFeePaid, markFeeUnpaid, addFeeRecord,
  updateFeeAmount, deleteWeekFees, getMondayOf, getWeekStartsForMonth, getClassNames,
  getAcademicYears, currentSchoolYear, getCurrentSchoolMonth
} from '../lib/store';
import { X, Pencil, Check, Calendar, ArrowLeft, Trash2 } from 'lucide-react';

function isoToday() { return new Date().toISOString().split('T')[0]; }
function monthLabel(ym) {
  const [y,m]=ym.split('-').map(Number);
  return new Date(y,m-1,1).toLocaleDateString('en-GB',{month:'long',year:'numeric'});
}
function shiftMonth(ym, dir) {
  const [y,m]=ym.split('-').map(Number);
  const d=new Date(y,m-1+dir,1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
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
  const [selectedId, setSelectedId] = useState(null);
  const [monthAnchor, setMonthAnchor] = useState(isoToday().slice(0,7));
  const [editCell, setEditCell] = useState(null);
  const [confirmDeleteWeek, setConfirmDeleteWeek] = useState(null);
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
    const existingKeys=new Set(fees.filter(f=>classStudents.some(s=>s.id===f.studentId)).map(f=>f.studentId+'|'+f.weekStarting));
    let count=0;
    weeks.forEach(w=>{
      classStudents.forEach(s=>{
        const key=s.id+'|'+w;
        if (!existingKeys.has(key)) {
          addFeeRecord({studentId:s.id,weekStarting:w,amount:s.weeklyFee||15,status:'Pending'},year);
          existingKeys.add(key);
          count++;
        }
      });
    });
    refresh();
    setShowAddMonth(false);
    showToast(count>0?`${count} fee record${count!==1?'s':''} added for ${monthLabel(addMonthVal)}`:`All weeks already exist for ${monthLabel(addMonthVal)}`);
  }

  function openStudent(id) { setSelectedId(id); setMonthAnchor(isoToday().slice(0,7)); }

  const classStudents = students.filter(s=>s.class===activeClass);
  const classFees = fees.filter(f=>classStudents.some(s=>s.id===f.studentId));
  const totalPaid = classFees.filter(f=>f.status==='Paid').reduce((s,f)=>s+Number(f.amount),0);
  const totalOwed = classFees.filter(f=>f.status!=='Paid').reduce((s,f)=>s+Number(f.amount),0);
  const schoolMonth = getCurrentSchoolMonth();
  const schoolMonthWeeks = getWeekStartsForMonth(schoolMonth.start.slice(0,7));
  const thisWeekMonday = getMondayOf(isoToday());

  const selected = students.find(s=>s.id===selectedId);

  if (selected) {
    const monthWeeks = getWeekStartsForMonth(monthAnchor);
    const studentFees = fees.filter(f=>f.studentId===selected.id);
    const lookup = {};
    studentFees.forEach(f=>{ lookup[f.weekStarting]=f; });
    const monthFeesForStudent = monthWeeks.map(w=>lookup[w]).filter(Boolean);
    const paid = monthFeesForStudent.filter(f=>f.status==='Paid').reduce((s,f)=>s+Number(f.amount),0);
    const owed = monthFeesForStudent.filter(f=>f.status!=='Paid').reduce((s,f)=>s+Number(f.amount),0);
    const billed = paid+owed;
    const collectedPct = billed ? Math.round((paid/billed)*100) : 0;

    return (
      <Layout title="Fees" subtitle={`${selected.forename} ${selected.surname} · ${selected.class}`}>
        <div className="card-header" style={{marginBottom:20}}>
          <div className="flex items-center gap-3">
            <button className="back-pill" onClick={()=>setSelectedId(null)}><ArrowLeft size={14}/> All students</button>
            <div>
              <div style={{fontWeight:600,fontSize:16}}>{selected.forename} {selected.surname}</div>
              <div className="text-muted text-sm">{selected.class} · £{selected.weeklyFee}/wk</div>
            </div>
          </div>
          <div className="nav-arrow-row">
            <button className="nav-arrow-btn" onClick={()=>setMonthAnchor(shiftMonth(monthAnchor,-1))}>‹</button>
            <span>{monthLabel(monthAnchor)}</span>
            <button className="nav-arrow-btn" onClick={()=>setMonthAnchor(shiftMonth(monthAnchor,1))}>›</button>
          </div>
        </div>

        <div className="day-cal-row" style={{gridTemplateColumns:`repeat(${monthWeeks.length},1fr)`}}>
          {monthWeeks.map(w=>{
            const f = lookup[w];
            const dateLabel = new Date(w+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'});
            const isEditing = f && editCell?.feeId===f.id;
            if (!f) {
              return (
                <div className="day-cal-card" key={w} style={{background:'#f4f5f8'}}>
                  <div className="day-cal-name">W/C</div>
                  <div className="day-cal-date">{dateLabel}</div>
                  <div className="day-cal-status" style={{background:'#e5e7eb',color:'var(--text-soft)',cursor:'default'}}>—</div>
                  <div className="day-cal-label">Not added</div>
                </div>
              );
            }
            const bg = f.status==='Paid' ? 'var(--green-light)' : 'var(--red-light)';
            const dotBg = f.status==='Paid' ? 'var(--green)' : 'var(--red)';
            return (
              <div className="day-cal-card" key={w} style={{background:bg, position:'relative'}}>
                <button
                  onClick={()=>setConfirmDeleteWeek(w)}
                  title={`Remove week of ${dateLabel} for all of ${selected.class} (e.g. holidays)`}
                  style={{position:'absolute',top:8,right:8,background:'none',border:'none',cursor:'pointer',color:'var(--text-soft)',padding:2,lineHeight:0}}>
                  <Trash2 size={12}/>
                </button>
                <div className="day-cal-name">W/C</div>
                <div className="day-cal-date">{dateLabel}</div>
                <button className="day-cal-status" style={{background:dotBg}} onClick={()=>togglePaid(f)}>
                  {f.status==='Paid'?'✓':'✗'}
                </button>
                {isEditing ? (
                  <div className="flex items-center gap-2" style={{justifyContent:'center',marginTop:10}} onClick={e=>e.stopPropagation()}>
                    <input type="number" value={editCell.val} autoFocus
                      onChange={e=>setEditCell({...editCell,val:e.target.value})}
                      onKeyDown={e=>{if(e.key==='Enter')saveEdit(f.id);if(e.key==='Escape')setEditCell(null);}}
                      style={{width:50,padding:'3px 5px',fontSize:11,border:'1px solid var(--blue)',borderRadius:4,fontFamily:'var(--font)',textAlign:'center'}}/>
                    <button style={{background:'none',border:'none',cursor:'pointer',color:'var(--green-text)'}} onClick={()=>saveEdit(f.id)}><Check size={12}/></button>
                    <button style={{background:'none',border:'none',cursor:'pointer',color:'var(--red-text)'}} onClick={()=>setEditCell(null)}><X size={12}/></button>
                  </div>
                ) : (
                  <div className="day-cal-label" style={{cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:4}}
                    onClick={()=>setEditCell({feeId:f.id,val:String(f.amount)})}>
                    £{Number(f.amount).toFixed(2)}<Pencil size={9} style={{opacity:.5}}/>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="summary-row-v2">
          <div className="summary-box-v2" style={{background:'var(--green-light)'}}><div className="n">£{paid.toFixed(0)}</div><div className="l">Paid</div></div>
          <div className="summary-box-v2" style={{background:'var(--red-light)'}}><div className="n">£{owed.toFixed(0)}</div><div className="l">Owed</div></div>
          <div className="summary-box-v2" style={{background:'#f0f2f6'}}><div className="n">£{billed.toFixed(0)}</div><div className="l">Billed this month</div></div>
          <div className="summary-box-v2" style={{background:'#f0f2f6'}}><div className="n">{collectedPct}%</div><div className="l">Collected</div></div>
        </div>

        {confirmDeleteWeek&&(
          <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setConfirmDeleteWeek(null)}>
            <div className="modal" style={{maxWidth:400}}>
              <div className="modal-body" style={{textAlign:'center',paddingTop:28}}>
                <div style={{width:52,height:52,borderRadius:'50%',background:'var(--red-light)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px'}}><Trash2 size={24} color="var(--red)"/></div>
                <div style={{fontSize:16,fontWeight:600,marginBottom:6}}>Remove this week?</div>
                <div style={{color:'var(--text-muted)',fontSize:13}}>
                  Week of {new Date(confirmDeleteWeek+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'long'})} will be removed for every student in {selected.class}.
                  <br/><span style={{fontSize:12}}>Useful for holiday weeks. This cannot be undone.</span>
                </div>
              </div>
              <div className="modal-footer" style={{justifyContent:'center'}}>
                <button className="btn" onClick={()=>setConfirmDeleteWeek(null)}>Cancel</button>
                <button className="btn btn-danger" onClick={()=>{
                  deleteWeekFees(confirmDeleteWeek, year, selected.class, students);
                  refresh();
                  setConfirmDeleteWeek(null);
                  showToast(`Week removed for ${selected.class}`);
                }}><Trash2 size={13}/>Remove week</button>
              </div>
            </div>
          </div>
        )}
        {toast&&<div className="toast">✓ {toast}</div>}
      </Layout>
    );
  }

  return (
    <Layout title="Fees" subtitle={`${activeClass} · ${year}`}>
      <div className="pill-tabs">
        {classNames.map(c=>(
          <button key={c} className={`pill-tab ${activeClass===c?'active':''}`} onClick={()=>setActiveClass(c)}>{c}</button>
        ))}
        <div className="pill-divider"/>
        {years.map(y=>(
          <button key={y} className={`pill-tab ${year===y?'year-active':''}`} onClick={()=>{ setYear(y); refresh(y); }}>{y}</button>
        ))}
      </div>

      <div className="stat-grid-v2">
        <div className="stat-card-v2"><div className="n" style={{color:'var(--green-text)'}}>£{totalPaid.toFixed(0)}</div><div className="l">Collected — {activeClass}</div></div>
        <div className="stat-card-v2"><div className="n" style={{color:'var(--red-text)'}}>£{totalOwed.toFixed(0)}</div><div className="l">Outstanding</div></div>
        <div className="stat-card-v2"><div className="n">{classFees.filter(f=>f.status!=='Paid').length}</div><div className="l">Unpaid records</div></div>
        <div className="stat-card-v2"><div className="n">{classStudents.filter(s=>s.status==='Active').length}</div><div className="l">Active students</div></div>
      </div>

      <div className="flex items-center justify-between mb-5" style={{flexWrap:'wrap',gap:12}}>
        <div className="text-muted text-sm">Click a student's card to view their full month</div>
        <button className="btn btn-primary" style={{background:'var(--blue)'}} onClick={()=>setShowAddMonth(true)}><Calendar size={13}/> Add a month</button>
      </div>

      <div className="entity-grid">
        {classStudents.map(s=>{
          const monthFees = fees.filter(f=>f.studentId===s.id && f.weekStarting>=schoolMonth.start && f.weekStarting<schoolMonth.endExclusive);
          const monthPaid = monthFees.filter(f=>f.status==='Paid').reduce((s,f)=>s+Number(f.amount),0);
          const monthOwed = monthFees.filter(f=>f.status!=='Paid').reduce((s,f)=>s+Number(f.amount),0);
          return (
            <div className="entity-card" key={s.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:14}} onClick={()=>openStudent(s.id)}>
              <div>
                <div className="entity-card-name">{s.forename} {s.surname}</div>
                <div className="entity-card-sub">£{s.weeklyFee}/wk</div>
                <div style={{fontSize:11,color:'var(--text-soft)',marginTop:6}}>This month: £{monthPaid.toFixed(0)} paid · £{monthOwed.toFixed(0)} due</div>
              </div>
              <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:6}} onClick={e=>e.stopPropagation()}>
                <div style={{display:'flex',gap:5}}>
                  {schoolMonthWeeks.map(w=>{
                    const f = monthFees.find(fee=>fee.weekStarting===w);
                    const dayNum = new Date(w+'T12:00:00').getDate();
                    const dateLabel = new Date(w+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'});
                    const isCurrent = w===thisWeekMonday;
                    if (!f) {
                      return <button key={w} className={`mark-btn-sm ${isCurrent?'is-current':''}`} disabled title={`Week of ${dateLabel} — not added`}>{dayNum}</button>;
                    }
                    const paid = f.status==='Paid';
                    return (
                      <button key={w} className={`mark-btn-sm ${isCurrent?'is-current':''}`}
                        style={paid?{background:'var(--green)',borderColor:'var(--green)',color:'#fff'}:{background:'var(--red)',borderColor:'var(--red)',color:'#fff'}}
                        title={`Week of ${dateLabel} — ${paid?'Paid':'Unpaid'} (click to toggle)`}
                        onClick={()=>togglePaid(f)}>{dayNum}</button>
                    );
                  })}
                </div>
                <span style={{fontSize:9.5,color:'var(--text-soft)',textTransform:'uppercase',letterSpacing:'.03em'}}>This month</span>
              </div>
            </div>
          );
        })}
        {classStudents.length===0&&(
          <div className="card" style={{gridColumn:'1 / -1',textAlign:'center',padding:28,color:'var(--text-muted)'}}>No students in {activeClass}.</div>
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
                  <div style={{background:'#f9fafb',borderRadius:'var(--r-md)',padding:'12px 16px',fontSize:13}}>
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
              <button className="btn btn-primary" style={{background:'var(--blue)'}} onClick={addMonth}>Add month</button>
            </div>
          </div>
        </div>
      )}

      {toast&&<div className="toast">✓ {toast}</div>}
    </Layout>
  );
}
