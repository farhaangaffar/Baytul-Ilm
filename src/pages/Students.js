import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import EnrollmentForm from '../components/EnrollmentForm';
import { LoadingState, ErrorState } from '../components/DataState';
import { getStudents, deleteStudent, updateStudent, reorderStudents, avatarInitials, getClassNames, attendanceCountsFrom, getAttendance, getFees, currentSchoolYear } from '../lib/store';
import { useReorder } from '../lib/useReorder';
import { Plus, Search, Pencil, Trash2, X, Save, GripVertical } from 'lucide-react';

export default function Students() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [students, setStudents] = useState([]);
  const [classNames, setClassNames] = useState([]);
  const [year, setYear] = useState('');
  const [fees, setFees] = useState([]);
  const [attendance, setAttendance] = useState({});

  const [showEnroll, setShowEnroll] = useState(false);
  const [search, setSearch] = useState('');
  const [activeClass, setActiveClass] = useState('');
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [toast, setToast] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const y = await currentSchoolYear();
      const [studentsData, classNamesData, feesData, attendanceData] = await Promise.all([
        getStudents(), getClassNames(), getFees(y), getAttendance(y),
      ]);
      setYear(y); setStudents(studentsData); setClassNames(classNamesData); setFees(feesData); setAttendance(attendanceData);
      setActiveClass(prev => prev && classNamesData.includes(prev) ? prev : (classNamesData[0] || ''));
    } catch (err) {
      setError(err);
    }
    setLoading(false);
  }, []);

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

  const classStudents = students.filter(s=>s.class===activeClass);
  const { list: orderedStudents, isDragging, handleProps, cardAttrs } = useReorder(
    classStudents, s => s.id,
    async ids => { try { await reorderStudents(ids); await load(); } catch (err) { showToast(err.message || 'Could not save the new order'); } }
  );

  if (loading) return <Layout title="Students"><LoadingState /></Layout>;
  if (error) return <Layout title="Students"><ErrorState error={error} onRetry={load} /></Layout>;

  const filtered = orderedStudents.filter(s =>
    `${s.forename} ${s.surname}`.toLowerCase().includes(search.toLowerCase())
  );

  const classFees = fees.filter(f=>classStudents.some(s=>s.id===f.studentId));
  const activeCount = classStudents.filter(s=>s.status==='Active').length;
  const studentAttPct = st => {
    const c = attendanceCountsFrom(attendance, st.id);
    return c.total ? Math.round(((c.present+c.late)/c.total)*100) : 0;
  };
  const avgAtt = classStudents.length ? Math.round(classStudents.reduce((s,st)=>s+studentAttPct(st),0)/classStudents.length) : 0;
  const collected = classFees.filter(f=>f.status==='Paid').reduce((s,f)=>s+Number(f.amount),0);
  const owed = classFees.filter(f=>f.status!=='Paid').reduce((s,f)=>s+Number(f.amount),0);

  return (
    <Layout title="Students" subtitle={`${students.length} enrolled`}>
      <div className="pill-tabs">
        {classNames.map(c=>(
          <button key={c} className={`pill-tab ${activeClass===c?'active':''}`} onClick={()=>setActiveClass(c)}>
            {c} ({students.filter(s=>s.class===c).length})
          </button>
        ))}
      </div>

      <div className="stat-grid-v2">
        <div className="stat-card-v2"><div className="n">{activeCount}</div><div className="l">Active — {activeClass}</div></div>
        <div className="stat-card-v2"><div className="n">{avgAtt}%</div><div className="l">Avg attendance</div></div>
        <div className="stat-card-v2"><div className="n">£{collected.toFixed(2)}</div><div className="l">Fees collected</div></div>
        <div className="stat-card-v2"><div className="n">£{owed.toFixed(2)}</div><div className="l">Outstanding</div></div>
      </div>

      <div className="flex items-center justify-between mb-5" style={{flexWrap:'wrap',gap:12}}>
        <div style={{position:'relative',maxWidth:260,flex:1}}>
          <Search size={14} style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',color:'var(--text-muted)'}}/>
          <input
            style={{paddingLeft:34,width:'100%',borderRadius:'var(--r-btn)',boxShadow:'var(--shadow-sm)'}}
            placeholder="Search by name…" value={search} onChange={e=>setSearch(e.target.value)}
          />
        </div>
        <button className="btn btn-primary" style={{background:'var(--blue)'}} onClick={()=>setShowEnroll(true)}><Plus size={14}/> Enroll</button>
      </div>

      <div className="entity-grid">
        {filtered.map(s=>{
          const c = attendanceCountsFrom(attendance, s.id);
          return (
            <div className={`entity-card ${isDragging(s.id)?'is-dragging':''}`} key={s.id} onClick={()=>setSelected(s)} {...cardAttrs(s.id)}>
              <div className="flex items-center justify-between">
                <div className="entity-card-name">{s.forename} {s.surname}</div>
                {!search && <div className="drag-handle" {...handleProps(s.id)} onClick={e=>e.stopPropagation()} title="Drag to reorder"><GripVertical size={15}/></div>}
              </div>
              <div className="entity-card-sub">{s.class} · £{s.weeklyFee}/wk</div>
              <div className="mini-stat-row">
                <div className="mini-stat-box" style={{background:'var(--green-light)'}}><div className="n">{c.present}</div><div className="l">Present</div></div>
                <div className="mini-stat-box" style={{background:'var(--amber-light)'}}><div className="n">{c.late}</div><div className="l">Late</div></div>
                <div className="mini-stat-box" style={{background:'var(--red-light)'}}><div className="n">{c.absent}</div><div className="l">Absent</div></div>
              </div>
              <div className="card-footer" style={{display:'flex',justifyContent:'space-between',fontSize:12,color:'var(--text-muted)'}}>
                <span>{s.parent1Name} · {s.parent1Phone}</span>
                <span style={{color:'var(--blue)',fontWeight:600}}>View profile →</span>
              </div>
            </div>
          );
        })}
        {filtered.length===0&&(
          <div className="card" style={{gridColumn:'1 / -1',textAlign:'center',padding:28,color:'var(--text-muted)'}}>
            {search?'No students match your search.':`No students in ${activeClass} yet.`}
          </div>
        )}
      </div>

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
                  {[['Date of birth',selected.dob],['Class',selected.class],['Enrolled',selected.enrollDate],['Weekly fee',`£${selected.weeklyFee}/wk`],['Status',selected.status]].map(([l,v])=>(
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
                <div className="form-group"><label>Enrolment date</label><input type="date" value={editForm.enrollDate} onChange={e=>setEditForm({...editForm,enrollDate:e.target.value})}/></div>
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
      {showEnroll&&<EnrollmentForm onClose={()=>setShowEnroll(false)} onSaved={load}/>}
    </Layout>
  );
}
