import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import EnrollmentForm from '../components/EnrollmentForm';
import { LoadingState, ErrorState } from '../components/DataState';
import { getStudents, deleteStudent, updateStudent, reorderStudents, avatarInitials, getClassNames, attendanceCountsFrom, attendancePctFrom, getAttendance, getFees, currentSchoolYear, formatDateGB, getStudentTotals, cancelRemainingFees } from '../lib/store';
import { useBackToClose } from '../lib/useBackToClose';
import ReorderableGrid from '../components/ReorderableGrid';
import { Plus, Search, Pencil, Trash2, X, Save, GripVertical, Clock, ArrowRight, Users, ChevronDown, ChevronUp } from 'lucide-react';

const WAITING_LIST = 'Waiting list';

function fmtDob(dob) { try { return formatDateGB(dob); } catch { return dob; } }

export default function Students() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [students, setStudents] = useState([]);
  const [classNames, setClassNames] = useState([]);
  const [year, setYear] = useState('');
  const [fees, setFees] = useState([]);
  const [attendance, setAttendance] = useState({});

  const [showEnroll, setShowEnroll] = useState(false);
  const [view, setView] = useState('roster');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [toast, setToast] = useState('');
  const [saving, setSaving] = useState(false);
  // "Students who have left" — collapsed by default, with an all-time (every academic
  // year, not just the currently-loaded one) attendance/fees/records summary per
  // student, so their whole history is readable right on the card instead of needing
  // to hunt for it across Attendance/Daily Records/Fees (which no longer show them).
  const [leftExpanded, setLeftExpanded] = useState(false);
  const [leftTotals, setLeftTotals] = useState({});
  const [confirmCancelFees, setConfirmCancelFees] = useState(null);

  const fetchData = useCallback(async () => {
    const y = await currentSchoolYear();
    const [studentsData, classNamesData, feesData, attendanceData] = await Promise.all([
      getStudents(), getClassNames(), getFees(y), getAttendance(y),
    ]);
    setYear(y); setStudents(studentsData); setClassNames(classNamesData); setFees(feesData); setAttendance(attendanceData);
    const leftIds = studentsData.filter(s=>s.status==='Inactive').map(s=>s.id);
    if (leftIds.length) getStudentTotals(leftIds).then(setLeftTotals).catch(()=>{/* pills are a bonus, not required to use the page */});
    else setLeftTotals({});
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { await fetchData(); } catch (err) { setError(err); }
    setLoading(false);
  }, [fetchData]);

  // Re-fetches without the loading skeleton — used after a reorder, where flashing the
  // whole page blank on every drop would look like the page keeps reloading.
  const silentRefresh = useCallback(async () => {
    try { await fetchData(); } catch (err) { showToast(err.message || 'Could not refresh'); }
  }, [fetchData]);

  useEffect(() => { load(); }, [load]);
  const closeSelected = useBackToClose(!!selected, () => setSelected(null));

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''),2500); }
  function startEdit(s) { setEditForm({...s}); setEditing(s.id); closeSelected(); }

  async function saveEdit() {
    setSaving(true);
    // Captured before load() overwrites `students` — this is the one moment we can
    // still tell whether this save is what just turned them Inactive, as opposed to
    // e.g. re-saving an already-left student's profile with no status change.
    const original = students.find(s=>s.id===editing);
    const becomingLeft = original && original.status!=='Inactive' && editForm.status==='Inactive';
    try {
      const patch = {...editForm, weeklyFee: Number(editForm.weeklyFee)};
      if (becomingLeft && !patch.leaveDate) patch.leaveDate = new Date().toISOString().split('T')[0];
      await updateStudent(editing, patch);
      await load();
      setEditing(null); setEditForm(null);
      showToast('Student updated');
      // If they still have unpaid future weeks sitting on their account from when
      // "Add month" ran for the whole class, offer to clear just those — already-paid
      // weeks are never touched, so this never rewrites what actually happened.
      if (becomingLeft) {
        const fromDate = patch.leaveDate;
        const toCancel = fees.filter(f=>f.studentId===editing && f.status==='Pending' && f.weekStarting>=fromDate);
        if (toCancel.length) {
          setConfirmCancelFees({
            studentId: editing,
            name: `${editForm.forename} ${editForm.surname}`,
            fromDate,
            count: toCancel.length,
            amount: toCancel.reduce((s,f)=>s+Number(f.amount),0),
          });
        }
      }
    } catch (err) {
      showToast(err.message || 'Could not save changes');
    }
    setSaving(false);
  }

  async function doCancelFees() {
    setSaving(true);
    try {
      await cancelRemainingFees(confirmCancelFees.studentId, confirmCancelFees.fromDate);
      await silentRefresh();
      showToast('Remaining unpaid weeks cancelled');
      setConfirmCancelFees(null);
    } catch (err) {
      showToast(err.message || 'Could not cancel those weeks');
    }
    setSaving(false);
  }

  async function moveToClass(student, className) {
    try {
      // Enrolment date is set here, not when they were first added to the waiting
      // list — this is the date they actually start, which is what "enrolled" means.
      const patch = { class: className };
      if (!student.enrollDate) patch.enrollDate = new Date().toISOString().split('T')[0];
      await updateStudent(student.id, patch);
      await silentRefresh();
      showToast(`${student.forename} moved to ${className}`);
    } catch (err) {
      showToast(err.message || 'Could not move this student');
    }
  }

  async function confirmAndDelete() {
    setSaving(true);
    try {
      await deleteStudent(confirmDelete.id);
      await load();
      const name = `${confirmDelete.forename} ${confirmDelete.surname}`;
      setConfirmDelete(null); setSelected(null);
      showToast(`${name} removed`);
    } catch (err) {
      showToast(err.message || 'Could not delete student');
    }
    setSaving(false);
  }

  if (loading) return <Layout title="Students"><LoadingState /></Layout>;
  if (error) return <Layout title="Students"><ErrorState error={error} onRetry={load} /></Layout>;

  const activeCount = students.filter(s=>s.status==='Active' && s.class!==WAITING_LIST).length;
  // Left students skew a "current" stat if included — they're a historical record
  // now, not part of today's roster.
  const rosterStudents = students.filter(s=>s.class!==WAITING_LIST && s.status!=='Inactive');
  const avgAtt = rosterStudents.length ? Math.round(rosterStudents.reduce((s,st)=>s+attendancePctFrom(attendance, st.id),0)/rosterStudents.length) : 0;
  const collected = fees.filter(f=>f.status==='Paid').reduce((s,f)=>s+Number(f.amount),0);
  const owed = fees.filter(f=>f.status!=='Paid').reduce((s,f)=>s+Number(f.amount),0);
  const waitingStudents = students.filter(s=>s.class===WAITING_LIST);
  const leftStudents = students.filter(s=>s.status==='Inactive' && s.class!==WAITING_LIST);

  return (
    <Layout title="Students" subtitle={`${students.length} enrolled`}>
      <div className="stat-grid-v2">
        <div className="stat-card-v2"><div className="n">{activeCount}</div><div className="l">Active students</div></div>
        <div className="stat-card-v2"><div className="n">{avgAtt}%</div><div className="l">Avg attendance</div></div>
        <div className="stat-card-v2"><div className="n">£{collected.toFixed(2)}</div><div className="l">Fees collected</div></div>
        <div className="stat-card-v2"><div className="n">£{owed.toFixed(2)}</div><div className="l">Outstanding</div></div>
      </div>

      <div className="students-toolbar flex items-center justify-between mb-5" style={{flexWrap:'wrap',gap:12}}>
        <div className="students-toolbar-search" style={{position:'relative',flex:1}}>
          <Search size={14} style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',color:'var(--text-muted)'}}/>
          <input
            style={{height:31,boxSizing:'border-box',padding:'0 14px 0 34px',width:'100%',borderRadius:'var(--r-btn)',border:'none',boxShadow:'var(--shadow-sm)',fontSize:13}}
            placeholder="Search by name…" value={search} onChange={e=>setSearch(e.target.value)}
          />
        </div>
        <div className="students-toolbar-tabs" style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <button className={`btn ${view==='roster'?'btn-primary':''}`} style={view==='roster'?{background:'var(--blue)'}:undefined} onClick={()=>setView('roster')}>
            <Users size={14}/> Classes
          </button>
          <button className={`btn ${view==='waiting'?'btn-primary':''}`} style={view==='waiting'?{background:'var(--blue)'}:undefined} onClick={()=>setView('waiting')}>
            <Clock size={14}/> Waiting list{waitingStudents.length>0?` (${waitingStudents.length})`:''}
          </button>
          <button className="btn btn-primary" style={{background:'var(--blue)'}} onClick={()=>setShowEnroll(true)}><Plus size={14}/> Enroll</button>
        </div>
      </div>

      {view==='waiting' ? (
        <div>
          <div className="student-column-header"><span>Waiting list</span><span className="text-muted" style={{fontWeight:500,fontSize:12}}>{waitingStudents.length}</span></div>
          <div className="student-compact-list">
            {waitingStudents.filter(s => `${s.forename} ${s.surname}`.toLowerCase().includes(search.toLowerCase())).map(s=>(
              <div className="student-compact-card" key={s.id} style={{flexWrap:'wrap',gap:10}} onClick={()=>setSelected(s)}>
                <div style={{minWidth:0}}>
                  <div className="student-compact-name">{s.forename} {s.surname}</div>
                  <div className="student-compact-sub">{fmtDob(s.dob)}</div>
                </div>
                <div style={{display:'flex',gap:6,flexWrap:'wrap',marginLeft:'auto'}} onClick={e=>e.stopPropagation()}>
                  {classNames.map(c=>(
                    <button key={c} className="btn" style={{fontSize:12,padding:'6px 12px'}} onClick={()=>moveToClass(s,c)}>
                      {c} <ArrowRight size={12}/>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {waitingStudents.length===0&&(
            <div className="card" style={{textAlign:'center',padding:20,color:'var(--text-muted)',fontSize:13}}>
              No students on the waiting list.
            </div>
          )}
        </div>
      ) : (
        <>
        <div className="student-columns" style={{gridTemplateColumns:`repeat(${classNames.length||1},1fr)`}}>
          {classNames.map(c=>{
            const classStudents = students.filter(s=>s.class===c && s.status!=='Inactive');
            const filtered = classStudents.filter(s => `${s.forename} ${s.surname}`.toLowerCase().includes(search.toLowerCase()));
            return (
              <div key={c}>
                <div className="student-column-header"><span>{c}</span><span className="text-muted" style={{fontWeight:500,fontSize:12}}>{classStudents.length}</span></div>
                <ReorderableGrid
                  items={filtered}
                  getId={s=>s.id}
                  className="student-compact-list"
                  onReordered={async ids => { try { await reorderStudents(ids); await silentRefresh(); } catch (err) { showToast(err.message || 'Could not save the new order'); } }}
                  renderItem={(s, {isDragging, handleProps, cardAttrs}) => (
                    <div className={`student-compact-card ${isDragging?'is-dragging':''}`} key={s.id} onClick={()=>setSelected(s)} {...cardAttrs}>
                      <div style={{minWidth:0}}>
                        <div className="student-compact-name">{s.forename} {s.surname}</div>
                        <div className="student-compact-sub">£{s.weeklyFee}/wk · {fmtDob(s.dob)}</div>
                      </div>
                      {!search && <div className="drag-handle" {...handleProps} onClick={e=>e.stopPropagation()} title="Drag to reorder"><GripVertical size={15}/></div>}
                    </div>
                  )}
                />
                {filtered.length===0&&(
                  <div className="card" style={{textAlign:'center',padding:20,color:'var(--text-muted)',fontSize:13}}>
                    {search?'No students match your search.':`No students in ${c} yet.`}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {leftStudents.length>0&&(
          <div className="card" style={{marginTop:20}}>
            <div onClick={()=>setLeftExpanded(e=>!e)}
              style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontWeight:700,fontSize:13}}>
              {leftExpanded?<ChevronUp size={14}/>:<ChevronDown size={14}/>}
              Students who have left ({leftStudents.length})
            </div>
            {leftExpanded&&(
              <div className="grid-2" style={{marginTop:16}}>
                {leftStudents.map(s=>{
                  const t = leftTotals[s.id] || {present:0,late:0,absent:0,paid:0,owed:0,recordsCount:0};
                  return (
                    <div key={s.id} className="card" style={{cursor:'pointer'}} onClick={()=>setSelected(s)}>
                      <div style={{marginBottom:10}}>
                        <div style={{fontWeight:600,fontSize:14}}>{s.forename} {s.surname}</div>
                        <div className="text-muted text-sm">{s.class}{s.leaveDate?` · Left ${formatDateGB(s.leaveDate)}`:''}</div>
                      </div>
                      {/* Attendance — same neutral-tile + colored-dot language as the
                          Daily Records / Attendance / Fees cards. */}
                      <div style={{display:'flex',gap:8,fontSize:12,marginBottom:8}}>
                        {[['Present',t.present,'var(--green)'],['Late',t.late,'var(--amber)'],['Absent',t.absent,'var(--red)']].map(([l,v,dot])=>(
                          <div key={l} style={{flex:1,background:'#f3f4f6',borderRadius:'var(--r-md)',padding:'8px 10px',textAlign:'center',position:'relative'}}>
                            <div style={{position:'absolute',top:7,right:7,width:7,height:7,borderRadius:'50%',background:dot}}/>
                            <div style={{fontWeight:700,color:'var(--ink)',fontSize:15}}>{v}</div>
                            <div style={{color:'var(--text-muted)',fontSize:10}}>{l}</div>
                          </div>
                        ))}
                      </div>
                      {/* Fees + records — all-time totals, spanning every academic year */}
                      <div style={{display:'flex',gap:8,fontSize:12}}>
                        <div style={{flex:1,background:'var(--green-light)',borderRadius:'var(--r-md)',padding:'6px 10px',textAlign:'center'}}>
                          <div style={{fontWeight:700,color:'var(--green-text)',fontSize:14}}>£{t.paid.toFixed(2)}</div>
                          <div style={{color:'var(--green-text)',fontSize:10}}>Paid</div>
                        </div>
                        <div style={{flex:1,background:'var(--red-light)',borderRadius:'var(--r-md)',padding:'6px 10px',textAlign:'center'}}>
                          <div style={{fontWeight:700,color:'var(--red-text)',fontSize:14}}>£{t.owed.toFixed(2)}</div>
                          <div style={{color:'var(--red-text)',fontSize:10}}>Owed</div>
                        </div>
                        <div style={{flex:1,background:'#f3f4f6',borderRadius:'var(--r-md)',padding:'6px 10px',textAlign:'center'}}>
                          <div style={{fontWeight:700,color:'var(--ink)',fontSize:14}}>{t.recordsCount}</div>
                          <div style={{color:'var(--text-muted)',fontSize:10}}>Records</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        </>
      )}

      {/* View modal */}
      {selected&&(
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&closeSelected()}>
          <div className="modal">
            <div className="modal-header">
              <div className="flex items-center gap-3">
                <div className="avatar" style={{width:40,height:40}}>{avatarInitials(selected.forename+' '+selected.surname)}</div>
                <div><div className="modal-title">{selected.forename} {selected.surname}</div><div className="text-muted text-sm">{selected.class}</div></div>
              </div>
              <button className="btn btn-icon" onClick={closeSelected}><X size={16}/></button>
            </div>
            <div className="modal-body">
              <div className="grid-2 mb-4">
                <div>
                  <div className="form-section-title" style={{marginBottom:10}}>Student</div>
                  {[
                    ['Date of birth',formatDateGB(selected.dob)],
                    ['Class',selected.class],
                    ['Enrolled',selected.enrollDate?formatDateGB(selected.enrollDate):'Not yet'],
                    ['Weekly fee',`£${selected.weeklyFee}/wk`],
                    ['Status',selected.status],
                    // Extra history rows only for a left student — their attendance/fees
                    // totals below are already all-time, so the fuller picture (paid,
                    // owed, daily records) lives here too rather than only as pills.
                    ...(selected.status==='Inactive'?[
                      ['Left',selected.leaveDate?formatDateGB(selected.leaveDate):'—'],
                      ['Fees paid (all time)',`£${(leftTotals[selected.id]?.paid||0).toFixed(2)}`],
                      ['Fees owed (all time)',`£${(leftTotals[selected.id]?.owed||0).toFixed(2)}`],
                      ['Daily records',leftTotals[selected.id]?.recordsCount||0],
                    ]:[]),
                  ].map(([l,v])=>(
                    <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'1px solid var(--border)',fontSize:13}}>
                      <span className="text-muted">{l}</span><span style={{fontWeight:500}}>{v}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="form-section-title" style={{marginBottom:10}}>Attendance{selected.status==='Inactive'?' (all time)':''}</div>
                  {(()=>{
                    const c = selected.status==='Inactive'
                      ? (()=>{ const t=leftTotals[selected.id]||{present:0,late:0,absent:0}; return {...t, total:t.present+t.late+t.absent}; })()
                      : attendanceCountsFrom(attendance, selected.id);
                    return [['Present',c.present,'var(--green-text)'],['Late',c.late,'var(--amber-text)'],['Absent',c.absent,'var(--red-text)'],['Total days',c.total,undefined]].map(([l,v,col])=>(
                      <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'1px solid var(--border)',fontSize:13}}>
                        <span className="text-muted">{l}</span><span style={{fontWeight:600,color:col}}>{v}</span>
                      </div>
                    ));
                  })()}
                </div>
              </div>
              <div className="form-section-title" style={{marginBottom:10}}>Parent contacts</div>
              <div className="grid-2 mb-4">
                <div style={{background:'var(--blue-light)',borderRadius:'var(--r-md)',padding:'10px 14px',fontSize:13}}>
                  <div style={{fontWeight:600,marginBottom:4}}>Parent 1</div>
                  <div>{selected.parent1Name||'—'}</div>
                  <div className="text-muted">{selected.parent1Phone||'—'}</div>
                </div>
                {(selected.parent2Name||selected.parent2Phone)&&(
                  <div style={{background:'var(--blue-light)',borderRadius:'var(--r-md)',padding:'10px 14px',fontSize:13}}>
                    <div style={{fontWeight:600,marginBottom:4}}>Parent 2</div>
                    <div>{selected.parent2Name||'—'}</div>
                    <div className="text-muted">{selected.parent2Phone||'—'}</div>
                  </div>
                )}
              </div>
              {selected.notes&&<div style={{background:'var(--blue-light)',borderRadius:'var(--r-md)',padding:'10px 14px',fontSize:13,color:'var(--text-muted)',fontStyle:'italic'}}>"{selected.notes}"</div>}
            </div>
            <div className="modal-footer">
              <button className="btn btn-danger" onClick={()=>{const s=selected;closeSelected();setConfirmDelete(s);}}><Trash2 size={13}/>Delete</button>
              <button className="btn btn-primary" style={{background:'var(--blue)'}} onClick={()=>startEdit(selected)}><Pencil size={13}/>Edit</button>
              <button className="btn" onClick={closeSelected}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editing&&editForm&&(
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setEditing(null)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">Edit — {editForm.forename} {editForm.surname}</div>
              <button className="btn btn-icon" onClick={()=>setEditing(null)}><X size={16}/></button>
            </div>
            <div className="modal-body">
              <div className="form-section-title" style={{marginBottom:12}}>Student details</div>
              <div className="form-grid form-grid-2 mb-5">
                {[['Forename','forename'],['Surname','surname']].map(([l,k])=>(
                  <div className="form-group" key={k}><label>{l}</label><input value={editForm[k]} onChange={e=>setEditForm({...editForm,[k]:e.target.value})}/></div>
                ))}
                <div className="form-group"><label>Date of birth</label><input type="date" value={editForm.dob} onChange={e=>setEditForm({...editForm,dob:e.target.value})}/></div>
                <div className="form-group"><label>Enrolment date</label><input type="date" value={editForm.enrollDate||''} onChange={e=>setEditForm({...editForm,enrollDate:e.target.value})}/></div>
                <div className="form-group"><label>Status</label>
                  <select value={editForm.status} onChange={e=>{
                    const status = e.target.value;
                    // Pre-fill today as a convenient default the moment someone's marked
                    // as having left — still fully editable before saving.
                    const leaveDate = status==='Inactive' && !editForm.leaveDate ? new Date().toISOString().split('T')[0] : editForm.leaveDate;
                    setEditForm({...editForm,status,leaveDate});
                  }}>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                    <option value="Waiting list">Waiting list</option>
                  </select>
                </div>
                {editForm.status==='Inactive'&&(
                  <div className="form-group"><label>Leave date</label><input type="date" value={editForm.leaveDate||''} onChange={e=>setEditForm({...editForm,leaveDate:e.target.value})}/></div>
                )}
              </div>
              <div className="form-section-title" style={{marginBottom:12}}>Parent contacts</div>
              <div className="form-grid form-grid-2 mb-5">
                {[['Parent 1 name','parent1Name'],['Parent 1 phone','parent1Phone'],['Parent 2 name','parent2Name'],['Parent 2 phone','parent2Phone']].map(([l,k])=>(
                  <div className="form-group" key={k}><label>{l}</label><input value={editForm[k]||''} onChange={e=>setEditForm({...editForm,[k]:e.target.value})}/></div>
                ))}
              </div>
              <div className="form-section-title" style={{marginBottom:12}}>Class & fees</div>
              <div className="form-grid form-grid-2 mb-5">
                <div className="form-group"><label>Class</label>
                  <select value={editForm.class} onChange={e=>setEditForm({...editForm,class:e.target.value})}>
                    {classNames.map(c=><option key={c} value={c}>{c}</option>)}
                    <option value={WAITING_LIST}>{WAITING_LIST}</option>
                  </select>
                </div>
                <div className="form-group"><label>Weekly fee (£)</label><input type="number" value={editForm.weeklyFee} onChange={e=>setEditForm({...editForm,weeklyFee:e.target.value})}/></div>
              </div>
              <div className="form-group"><label>Notes</label><textarea rows={2} value={editForm.notes||''} onChange={e=>setEditForm({...editForm,notes:e.target.value})} style={{resize:'vertical'}}/></div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={()=>setEditing(null)}>Cancel</button>
              <button className="btn btn-primary" style={{background:'var(--blue)'}} onClick={saveEdit} disabled={saving}><Save size={13}/>{saving?'Saving…':'Save changes'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {confirmDelete&&(
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setConfirmDelete(null)}>
          <div className="modal" style={{maxWidth:420}}>
            <div className="modal-body" style={{textAlign:'center',paddingTop:28}}>
              <div style={{width:52,height:52,borderRadius:'50%',background:'var(--red-light)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px'}}><Trash2 size={24} color="var(--red-text)"/></div>
              <div style={{fontSize:16,fontWeight:600,marginBottom:6}}>Remove {confirmDelete.forename} {confirmDelete.surname}?</div>
              <div style={{color:'var(--text-muted)',fontSize:13}}>This will permanently delete their profile, attendance and fee records.</div>
            </div>
            <div className="modal-footer" style={{justifyContent:'center'}}>
              <button className="btn" onClick={()=>setConfirmDelete(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmAndDelete} disabled={saving}><Trash2 size={13}/>{saving?'Deleting…':'Yes, delete'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel remaining unpaid fees — offered right after marking someone as left,
          only when they actually have unpaid future weeks to clear. */}
      {confirmCancelFees&&(
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setConfirmCancelFees(null)}>
          <div className="modal" style={{maxWidth:420}}>
            <div className="modal-body" style={{textAlign:'center',paddingTop:28}}>
              <div style={{width:52,height:52,borderRadius:'50%',background:'var(--red-light)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px'}}><Trash2 size={24} color="var(--red-text)"/></div>
              <div style={{fontSize:16,fontWeight:600,marginBottom:6}}>Cancel remaining unpaid weeks?</div>
              <div style={{color:'var(--text-muted)',fontSize:13}}>
                {confirmCancelFees.name} has {confirmCancelFees.count} unpaid week{confirmCancelFees.count!==1?'s':''} (£{confirmCancelFees.amount.toFixed(2)}) from {formatDateGB(confirmCancelFees.fromDate)} onward.
                <br/><span style={{fontSize:12}}>Already-paid weeks won't be touched. This cannot be undone.</span>
              </div>
            </div>
            <div className="modal-footer" style={{justifyContent:'center'}}>
              <button className="btn" onClick={()=>setConfirmCancelFees(null)}>Keep them</button>
              <button className="btn btn-danger" onClick={doCancelFees} disabled={saving}><Trash2 size={13}/>{saving?'Cancelling…':'Cancel these weeks'}</button>
            </div>
          </div>
        </div>
      )}

      {toast&&<div className="toast">✓ {toast}</div>}
      {showEnroll&&<EnrollmentForm onClose={()=>setShowEnroll(false)} onSaved={silentRefresh}/>}
    </Layout>
  );
}
