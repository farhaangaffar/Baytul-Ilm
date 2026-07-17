import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import { LoadingState, ErrorState } from '../components/DataState';
import {
  getFees, getStudents, markFeePaid, markFeeUnpaid, addFeeMonth,
  updateFeeAmount, deleteWeekFees, getMondayOf, getWeekStartsForMonth, getClassNames,
  getAcademicYears, currentSchoolYear, getCurrentSchoolMonth, academicYearStartISO, academicYearOfMonth, formatDayMonthGB
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [students, setStudents] = useState([]);
  const [classNames, setClassNames] = useState([]);
  const [years, setYears] = useState([]);
  const [year, setYear] = useState('');
  const [currentYear, setCurrentYear] = useState('');
  const [fees, setFees] = useState([]);
  const [activeClass, setActiveClass] = useState('');

  const [showAddMonth, setShowAddMonth] = useState(false);
  const [addMonthVal, setAddMonthVal] = useState(isoToday().slice(0,7));
  const [addingMonth, setAddingMonth] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [monthAnchor, setMonthAnchor] = useState(isoToday().slice(0,7));
  const [editCell, setEditCell] = useState(null);
  const [confirmDeleteWeek, setConfirmDeleteWeek] = useState(null);
  const [confirmToggle, setConfirmToggle] = useState(null);
  const [toggling, setToggling] = useState(false);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const y = await currentSchoolYear();
      const [studentsData, classNamesData, yearsData, feesData] = await Promise.all([
        getStudents(), getClassNames(), getAcademicYears(), getFees(y),
      ]);
      setStudents(studentsData); setClassNames(classNamesData); setYears(yearsData); setYear(y); setCurrentYear(y); setFees(feesData);
      setActiveClass(prev => prev && classNamesData.includes(prev) ? prev : (classNamesData[0] || ''));
    } catch (err) {
      setError(err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function refresh(y2) { setFees(await getFees(y2||year)); }
  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''),2500); }

  async function switchYear(y) {
    setYear(y);
    try { await refresh(y); } catch (err) { showToast(err.message || 'Could not load that year'); }
  }

  async function confirmTogglePaid() {
    const fee = confirmToggle;
    const wasPaid = fee.status === 'Paid';
    const nextStatus = wasPaid ? 'Pending' : 'Paid';
    const nextPaidDate = wasPaid ? null : isoToday();
    setToggling(true);
    setFees(prev => prev.map(f => f.id===fee.id ? { ...f, status: nextStatus, paidDate: nextPaidDate } : f));
    try {
      if (wasPaid) await markFeeUnpaid(fee.id,year);
      else await markFeePaid(fee.id,year);
      showToast(wasPaid?'Marked as unpaid':'Marked as paid');
      setConfirmToggle(null);
    } catch (err) {
      setFees(prev => prev.map(f => f.id===fee.id ? { ...f, status: fee.status, paidDate: fee.paidDate } : f));
      showToast(err.message || 'Could not update this record');
    }
    setToggling(false);
  }

  async function saveEdit(feeId) {
    const val=parseFloat(editCell.val);
    if (!isNaN(val)&&val>=0) {
      try { await updateFeeAmount(feeId,val,year); await refresh(); showToast('Amount updated'); }
      catch (err) { showToast(err.message || 'Could not update amount'); }
    }
    setEditCell(null);
  }

  async function addMonth() {
    const weeks=getWeekStartsForMonth(addMonthVal);
    const classStudents=students.filter(s=>s.status==='Active'&&s.class===activeClass);
    setAddingMonth(true);
    try {
      const { created } = await addFeeMonth(year, weeks, classStudents);
      await refresh();
      setShowAddMonth(false);
      showToast(created>0?`${created} fee record${created!==1?'s':''} added for ${monthLabel(addMonthVal)}`:`All weeks already exist for ${monthLabel(addMonthVal)}`);
    } catch (err) {
      showToast(err.message || 'Could not add this month');
    }
    setAddingMonth(false);
  }

  function openStudent(id) { setSelectedId(id); setMonthAnchor((year===currentYear ? isoToday() : academicYearStartISO(year)).slice(0,7)); }

  // Months are browsed within their own academic year only — crossing September or
  // August hops to the adjacent year's tab (matching the source spreadsheets, one file
  // per academic year) rather than wandering into another year while still "on" this one.
  async function shiftDetailMonth(dir) {
    const newMonth = shiftMonth(monthAnchor, dir);
    const newYear = academicYearOfMonth(newMonth);
    if (newYear === year) { setMonthAnchor(newMonth); return; }
    if (!years.includes(newYear)) {
      showToast(`No ${newYear} academic year yet — add it in Settings to browse further.`);
      return;
    }
    setYear(newYear);
    setMonthAnchor(newMonth);
    try { await refresh(newYear); } catch (err) { showToast(err.message || 'Could not load that year'); }
  }

  if (loading) return <Layout title="Fees"><LoadingState /></Layout>;
  if (error) return <Layout title="Fees"><ErrorState error={error} onRetry={load} /></Layout>;

  const isCurrentYear = year===currentYear;
  const referenceDate = isCurrentYear ? isoToday() : academicYearStartISO(year);
  const classStudents = students.filter(s=>s.class===activeClass);
  const classFees = fees.filter(f=>classStudents.some(s=>s.id===f.studentId));
  const totalPaid = classFees.filter(f=>f.status==='Paid').reduce((s,f)=>s+Number(f.amount),0);
  const totalOwed = classFees.filter(f=>f.status!=='Paid').reduce((s,f)=>s+Number(f.amount),0);
  const schoolMonth = getCurrentSchoolMonth(referenceDate);
  const schoolMonthWeeks = getWeekStartsForMonth(schoolMonth.start.slice(0,7));
  const thisWeekMonday = getMondayOf(referenceDate);
  // schoolMonth.label follows the "first Monday" school-month boundary, which for a
  // September 1st that falls on a weekend can label itself the previous calendar month
  // (e.g. "August") — the browsing hint below uses the plain calendar month instead so
  // it doesn't contradict the per-student view, which is always a straight "September ...".
  const referenceMonthLabel = isCurrentYear ? schoolMonth.label : monthLabel(referenceDate.slice(0,7));

  const selected = students.find(s=>s.id===selectedId);
  const toggleStudent = confirmToggle && students.find(s=>s.id===confirmToggle.studentId);
  const willBePaid = confirmToggle?.status!=='Paid';
  const confirmToggleModal = confirmToggle&&(
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&!toggling&&setConfirmToggle(null)}>
      <div className="modal" style={{maxWidth:360}}>
        <div className="modal-body" style={{textAlign:'center',paddingTop:28}}>
          <div style={{width:48,height:48,borderRadius:'50%',background:willBePaid?'var(--green-light)':'var(--red-light)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px'}}>
            {willBePaid?<Check size={22} color="var(--green-text)"/>:<X size={22} color="var(--red-text)"/>}
          </div>
          <div style={{fontSize:15,fontWeight:600,marginBottom:6}}>
            Mark week of {formatDayMonthGB(confirmToggle.weekStarting)} as {willBePaid?'paid':'unpaid'}?
          </div>
          <div style={{color:'var(--text-muted)',fontSize:12.5}}>
            {toggleStudent?`${toggleStudent.forename} ${toggleStudent.surname}`:''} — £{Number(confirmToggle.amount).toFixed(2)} for this week.
          </div>
        </div>
        <div className="modal-footer" style={{justifyContent:'center'}}>
          <button className="btn" onClick={()=>setConfirmToggle(null)} disabled={toggling}>Cancel</button>
          <button className={willBePaid?'btn btn-green':'btn btn-danger'} onClick={confirmTogglePaid} disabled={toggling}>
            {willBePaid?<Check size={13}/>:<X size={13}/>}{toggling?'Saving…':(willBePaid?'Mark paid':'Mark unpaid')}
          </button>
        </div>
      </div>
    </div>
  );

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
    const canGoPrev = years.includes(academicYearOfMonth(shiftMonth(monthAnchor,-1)));
    const canGoNext = years.includes(academicYearOfMonth(shiftMonth(monthAnchor,1)));

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
            <button className="nav-arrow-btn" onClick={()=>shiftDetailMonth(-1)} disabled={!canGoPrev}>‹</button>
            <span>{monthLabel(monthAnchor)}</span>
            <button className="nav-arrow-btn" onClick={()=>shiftDetailMonth(1)} disabled={!canGoNext}>›</button>
          </div>
        </div>

        <div className="day-cal-row" style={{gridTemplateColumns:`repeat(${monthWeeks.length},1fr)`}}>
          {monthWeeks.map(w=>{
            const f = lookup[w];
            const dateLabel = formatDayMonthGB(w);
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
                <button className="day-cal-status" style={{background:dotBg}} onClick={()=>setConfirmToggle(f)}>
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
          <div className="summary-box-v2" style={{background:'var(--green-light)'}}><div className="n">£{paid.toFixed(2)}</div><div className="l">Paid</div></div>
          <div className="summary-box-v2" style={{background:'var(--red-light)'}}><div className="n">£{owed.toFixed(2)}</div><div className="l">Owed</div></div>
          <div className="summary-box-v2" style={{background:'#f0f2f6'}}><div className="n">£{billed.toFixed(2)}</div><div className="l">Billed this month</div></div>
          <div className="summary-box-v2" style={{background:'#f0f2f6'}}><div className="n">{collectedPct}%</div><div className="l">Collected</div></div>
        </div>

        {confirmDeleteWeek&&(
          <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setConfirmDeleteWeek(null)}>
            <div className="modal" style={{maxWidth:400}}>
              <div className="modal-body" style={{textAlign:'center',paddingTop:28}}>
                <div style={{width:52,height:52,borderRadius:'50%',background:'var(--red-light)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px'}}><Trash2 size={24} color="var(--red)"/></div>
                <div style={{fontSize:16,fontWeight:600,marginBottom:6}}>Remove this week?</div>
                <div style={{color:'var(--text-muted)',fontSize:13}}>
                  Week of {formatDayMonthGB(confirmDeleteWeek)} will be removed for every student in {selected.class}.
                  <br/><span style={{fontSize:12}}>Useful for holiday weeks. This cannot be undone.</span>
                </div>
              </div>
              <div className="modal-footer" style={{justifyContent:'center'}}>
                <button className="btn" onClick={()=>setConfirmDeleteWeek(null)}>Cancel</button>
                <button className="btn btn-danger" onClick={async ()=>{
                  try {
                    await deleteWeekFees(confirmDeleteWeek, year, selected.class);
                    await refresh();
                    setConfirmDeleteWeek(null);
                    showToast(`Week removed for ${selected.class}`);
                  } catch (err) {
                    showToast(err.message || 'Could not remove week');
                  }
                }}><Trash2 size={13}/>Remove week</button>
              </div>
            </div>
          </div>
        )}
        {confirmToggleModal}
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
          <button key={y} className={`pill-tab ${year===y?'year-active':''}`} onClick={()=>switchYear(y)}>{y}</button>
        ))}
      </div>

      <div className="stat-grid-v2">
        <div className="stat-card-v2"><div className="n" style={{color:'var(--green-text)'}}>£{totalPaid.toFixed(2)}</div><div className="l">Collected — {activeClass}</div></div>
        <div className="stat-card-v2"><div className="n" style={{color:'var(--red-text)'}}>£{totalOwed.toFixed(2)}</div><div className="l">Outstanding</div></div>
        <div className="stat-card-v2"><div className="n">{classFees.filter(f=>f.status!=='Paid').length}</div><div className="l">Unpaid records</div></div>
        <div className="stat-card-v2"><div className="n">{classStudents.filter(s=>s.status==='Active').length}</div><div className="l">Active students</div></div>
      </div>

      <div className="flex items-center justify-between mb-5" style={{flexWrap:'wrap',gap:12}}>
        <div className="text-muted text-sm">
          {isCurrentYear ? 'Click a student’s card to view their full month' : `Browsing ${year} — showing ${referenceMonthLabel}. Click a student’s card to view their full month.`}
        </div>
        <button className="btn btn-primary" style={{background:'var(--blue)'}} onClick={()=>setShowAddMonth(true)}><Calendar size={13}/> Add a month</button>
      </div>

      <div className="entity-grid">
        {classStudents.map(s=>{
          const monthFees = fees.filter(f=>f.studentId===s.id && f.weekStarting>=schoolMonth.start && f.weekStarting<schoolMonth.endExclusive);
          const monthPaid = monthFees.filter(f=>f.status==='Paid').reduce((s,f)=>s+Number(f.amount),0);
          const monthOwed = monthFees.filter(f=>f.status!=='Paid').reduce((s,f)=>s+Number(f.amount),0);
          return (
            <div className="entity-card" key={s.id} onClick={()=>openStudent(s.id)}>
              <div className="entity-card-name">{s.forename} {s.surname}</div>
              <div className="entity-card-sub" style={{marginBottom:14}}>£{s.weeklyFee}/wk</div>
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:6}} onClick={e=>e.stopPropagation()}>
                <div className="week-pill-row" style={{justifyContent:'center'}}>
                  {schoolMonthWeeks.map(w=>{
                    const f = monthFees.find(fee=>fee.weekStarting===w);
                    const dayNum = new Date(w+'T12:00:00').getDate();
                    const dateLabel = formatDayMonthGB(w);
                    const isCurrent = w===thisWeekMonday;
                    if (!f) {
                      return (
                        <button key={w} className={`week-pill not-added ${isCurrent?'is-current':''}`} disabled title={`Week of ${dateLabel} — not added`}>
                          <span className="d">{dayNum}</span><span className="m">—</span>
                        </button>
                      );
                    }
                    const paid = f.status==='Paid';
                    return (
                      <button key={w} className={`week-pill ${paid?'paid':'unpaid'} ${isCurrent?'is-current':''}`}
                        title={`Week of ${dateLabel} — ${paid?'Paid':'Unpaid'} (click to toggle)`}
                        onClick={()=>setConfirmToggle(f)}>
                        <span className="d">{dayNum}</span><span className="m">{paid?'paid':'due'}</span>
                      </button>
                    );
                  })}
                </div>
                <span style={{fontSize:11,color:'var(--text-soft)',textAlign:'center'}}>This month: £{monthPaid.toFixed(2)} paid · £{monthOwed.toFixed(2)} due</span>
              </div>
            </div>
          );
        })}
      </div>
      {classStudents.length===0&&(
        <div className="card" style={{textAlign:'center',padding:28,color:'var(--text-muted)'}}>No students in {activeClass}.</div>
      )}

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
              <button className="btn btn-primary" style={{background:'var(--blue)'}} onClick={addMonth} disabled={addingMonth}>{addingMonth?'Adding…':'Add month'}</button>
            </div>
          </div>
        </div>
      )}

      {confirmToggleModal}
      {toast&&<div className="toast">✓ {toast}</div>}
    </Layout>
  );
}
