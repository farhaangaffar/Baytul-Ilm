import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import EnrollmentForm from '../components/EnrollmentForm';
import { LoadingState, ErrorState } from '../components/DataState';
import { getStudents, deleteStudent, updateStudent, reorderStudents, avatarInitials, getClassNames, attendanceCountsFrom, attendancePctFrom, getAttendance, getFees, currentSchoolYear, formatDateGB } from '../lib/store';
import ReorderableGrid from '../components/ReorderableGrid';
import { Plus, Search, Pencil, Trash2, X, Save, GripVertical, Clock, ArrowRight, Users } from 'lucide-react';

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

  const fetchData = useCallback(async () => {
    const y = await currentSchoolYear();
    const [studentsData, classNamesData, feesData, attendanceData] = await Promise.all([
      getStudents(), getClassNames(), getFees(y), getAttendance(y),
    ]);
    setYear(y); setStudents(studentsData); setClassNames(classNamesData); setFees(feesData); setAttendance(attendanceData);
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

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''),2500); }
  function startEdit(s) { setEditForm({...s}); setEditing(s.id); setSelected(null); }

  async function saveEdit() {
    setSaving(true);
    try {
      await updateStudent(editing, {...editForm, weeklyFee: Number(editForm.weeklyFee)});
      await load();
      setEditing(null); setEditForm(null);
      showToast('Student updated');
    } catch (err) {
      showToast(err.message || 'Could not save changes');
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
  const rosterStudents = students.filter(s=>s.class!==WAITING_LIST);
  const avgAtt = rosterStudents.length ? Math.round(rosterStudents.reduce((s,st)=>s+attendancePctFrom(attendance, st.id),0)/rosterStudents.length) : 0;
  const collected = fees.filter(f=>f.status==='Paid').reduce((s,f)=>s+Number(f.amount),0);
  const owed = fees.filter(f=>f.status!=='Paid').reduce((s,f)=>s+Number(f.amount),0);
  const waitingStudents = students.filter(s=>s.class===WAITING_LIST);

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
            style={{paddingLeft:34,width:'100%',borderRadius:'var(--r-btn)',boxShadow:'var(--shadow-sm)'}}
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
        <div className="student-columns" style={{gridTemplateColumns:`repeat(${classNames.length||1},1fr)`}}>
          {classNames.map(c=>{
            const classStudents = students.filter(s=>s.class===c);
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
      )}

      {/* View modal */}
      {selected&&(
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setSelected(null)}>
          <div className="modal">
            <div className="modal-header">
              <div className="flex items-center gap-3">
                <div className="avatar" style={{width:40,height:40}}>{avatarInitials(selected.forename+' '+selected.surname)}</div>
                <div><div className="modal-title">{selected.forename} {selected.surname}</div><div className="text-muted text-sm">{selected.class}</div></div>
              </div>
              <button className="btn btn-icon" onClick={()=>setSelected(null)}><X size={16}/></button>
            </div>
            <div className="modal-body">
              <div className="grid-2 mb-4">
                <div>
                  <div className="form-section-title" style={{marginBottom:10}}>Student</div>
                  {[['Date of birth',formatDateGB(selected.dob)],['Class',selected.class],['Enrolled',selected.enrollDate?formatDateGB(selected.enrollDate):'Not yet'],['Weekly fee',`£${selected.weeklyFee}/wk`],['Status',selected.status]].map(([l,v])=>(
                    <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'1px solid var(--border)',fontSize:13}}>
                      <span className="text-muted">{l}</span><span style={{fontWeight:500}}>{v}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="form-section-title" style={{marginBottom:10}}>Attendance</div>
                  {(()=>{
                    const c=attendanceCountsFrom(attendance, selected.id);
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
              <button className="btn btn-danger" onClick={()=>{setSelected(null);setConfirmDelete(selected);}}><Trash2 size={13}/>Delete</button>
              <button className="btn btn-primary" style={{background:'var(--blue)'}} onClick={()=>startEdit(selected)}><Pencil size={13}/>Edit</button>
              <button className="btn" onClick={()=>setSelected(null)}>Close</button>
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
                  <select value={editForm.status} onChange={e=>setEditForm({...editForm,status:e.target.value})}>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                    <option value="Waiting list">Waiting list</option>
                  </select>
                </div>
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

      {toast&&<div className="toast">✓ {toast}</div>}
      {showEnroll&&<EnrollmentForm onClose={()=>setShowEnroll(false)} onSaved={silentRefresh}/>}
    </Layout>
  );
}
