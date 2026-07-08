import React, { useState } from 'react';
import Layout from '../components/Layout';
import EnrollmentForm from '../components/EnrollmentForm';
import { getStudents, deleteStudent, updateStudent, avatarInitials, getClassNames, calcAttendanceCounts } from '../lib/store';
import { Plus, Search, Eye, Pencil, Trash2, X, Save } from 'lucide-react';

export default function Students() {
  const [students, setStudents] = useState(getStudents);
  const [showEnroll, setShowEnroll] = useState(false);
  const [search, setSearch] = useState('');
  const classNames = getClassNames();
  const [activeClass, setActiveClass] = useState(classNames[0]||'');
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [toast, setToast] = useState('');

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''),2500); }
  function startEdit(s) { setEditForm({...s}); setEditing(s.id); setSelected(null); }
  function saveEdit() {
    updateStudent(editing,{...editForm,weeklyFee:Number(editForm.weeklyFee)});
    setStudents(getStudents()); setEditing(null); setEditForm(null);
    showToast('Student updated');
  }
  function confirmAndDelete() {
    deleteStudent(confirmDelete.id); setStudents(getStudents());
    setConfirmDelete(null); setSelected(null);
    showToast(`${confirmDelete.forename} ${confirmDelete.surname} removed`);
  }

  const filtered = students.filter(s =>
    s.class===activeClass &&
    `${s.forename} ${s.surname}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Layout title="Students" subtitle={`${students.length} enrolled`}>
      <div className="class-tabs">
        {classNames.map(c=>(
          <button key={c} className={`class-tab ${activeClass===c?'active':''}`} onClick={()=>setActiveClass(c)}>
            {c} ({students.filter(s=>s.class===c).length})
          </button>
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <div style={{position:'relative',maxWidth:260}}>
            <Search size={14} style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'var(--text-muted)'}}/>
            <input style={{paddingLeft:32,width:'100%'}} placeholder="Search by name…" value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
          <button className="btn btn-primary btn-sm" onClick={()=>setShowEnroll(true)}><Plus size={14}/> Enroll</button>
        </div>

        {/* Scrollable table */}
        <div style={{maxHeight:480,overflowY:'auto',overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13,minWidth:560}}>
            <thead>
              <tr>
                {['Student','Date of birth','Parent 1','Parent 2','Weekly fee','Status',''].map(h=>(
                  <th key={h} style={{textAlign:'left',fontSize:11,fontWeight:600,letterSpacing:'0.04em',color:'var(--text-muted)',textTransform:'uppercase',padding:'10px 12px 10px 0',borderBottom:'1px solid var(--border)',position:'sticky',top:0,background:'var(--surface)',zIndex:1,whiteSpace:'nowrap'}}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(s=>(
                <tr key={s.id} style={{cursor:'pointer'}} onClick={()=>setSelected(s)}>
                  <td style={{padding:'10px 12px 10px 0',borderBottom:'1px solid var(--border)'}}>
                    <div className="flex items-center gap-2">
                      <div className="avatar">{avatarInitials(s.forename+' '+s.surname)}</div>
                      <div style={{fontWeight:500}}>{s.forename} {s.surname}</div>
                    </div>
                  </td>
                  <td style={{padding:'10px 12px 10px 0',borderBottom:'1px solid var(--border)',color:'var(--text-muted)',fontSize:12}}>{s.dob}</td>
                  <td style={{padding:'10px 12px 10px 0',borderBottom:'1px solid var(--border)'}}>
                    <div style={{fontWeight:500,fontSize:13}}>{s.parent1Name}</div>
                    <div style={{color:'var(--text-muted)',fontSize:11}}>{s.parent1Phone}</div>
                  </td>
                  <td style={{padding:'10px 12px 10px 0',borderBottom:'1px solid var(--border)',color:'var(--text-muted)',fontSize:12}}>
                    {s.parent2Name?<><div style={{fontWeight:500,color:'var(--text)',fontSize:13}}>{s.parent2Name}</div><div style={{fontSize:11}}>{s.parent2Phone}</div></>:'—'}
                  </td>
                  <td style={{padding:'10px 12px 10px 0',borderBottom:'1px solid var(--border)',fontSize:13}}>£{s.weeklyFee}/wk</td>
                  <td style={{padding:'10px 12px 10px 0',borderBottom:'1px solid var(--border)'}}>
                    <span className={`badge ${s.status==='Active'?'badge-green':'badge-gray'}`}>{s.status}</span>
                  </td>
                  <td style={{padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
                    <div className="flex items-center gap-2" onClick={e=>e.stopPropagation()}>
                      <button className="btn btn-icon btn-sm" onClick={()=>setSelected(s)}><Eye size={13}/></button>
                      <button className="btn btn-icon btn-sm" onClick={()=>startEdit(s)}><Pencil size={13}/></button>
                      <button className="btn btn-icon btn-sm" style={{color:'var(--red)'}} onClick={()=>setConfirmDelete(s)}><Trash2 size={13}/></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length===0&&(
                <tr><td colSpan={7} style={{textAlign:'center',padding:28,color:'var(--text-muted)'}}>
                  {search?'No students match your search.':`No students in ${activeClass} yet.`}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
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
                    const c=calcAttendanceCounts(selected.id);
                    return [['Present',c.present,'var(--green)'],['Late',c.late,'var(--amber)'],['Absent',c.absent,'var(--red)'],['Total days',c.total,undefined]].map(([l,v,col])=>(
                      <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'1px solid var(--border)',fontSize:13}}>
                        <span className="text-muted">{l}</span><span style={{fontWeight:600,color:col}}>{v}</span>
                      </div>
                    ));
                  })()}
                </div>
              </div>
              <div className="form-section-title" style={{marginBottom:10}}>Parent contacts</div>
              <div className="grid-2 mb-4">
                <div style={{background:'var(--blush)',borderRadius:'var(--radius-sm)',padding:'10px 14px',fontSize:13}}>
                  <div style={{fontWeight:600,marginBottom:4}}>Parent 1</div>
                  <div>{selected.parent1Name||'—'}</div>
                  <div className="text-muted">{selected.parent1Phone||'—'}</div>
                </div>
                {(selected.parent2Name||selected.parent2Phone)&&(
                  <div style={{background:'var(--blush)',borderRadius:'var(--radius-sm)',padding:'10px 14px',fontSize:13}}>
                    <div style={{fontWeight:600,marginBottom:4}}>Parent 2</div>
                    <div>{selected.parent2Name||'—'}</div>
                    <div className="text-muted">{selected.parent2Phone||'—'}</div>
                  </div>
                )}
              </div>
              {selected.notes&&<div style={{background:'var(--blush)',borderRadius:'var(--radius-sm)',padding:'10px 14px',fontSize:13,color:'var(--text-muted)',fontStyle:'italic'}}>"{selected.notes}"</div>}
            </div>
            <div className="modal-footer">
              <button className="btn btn-danger" onClick={()=>{setSelected(null);setConfirmDelete(selected);}}><Trash2 size={13}/>Delete</button>
              <button className="btn btn-primary" onClick={()=>startEdit(selected)}><Pencil size={13}/>Edit</button>
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
              <button className="btn btn-lime" onClick={saveEdit}><Save size={13}/>Save changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {confirmDelete&&(
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setConfirmDelete(null)}>
          <div className="modal" style={{maxWidth:420}}>
            <div className="modal-body" style={{textAlign:'center',paddingTop:28}}>
              <div style={{width:52,height:52,borderRadius:'50%',background:'var(--red-light)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px'}}><Trash2 size={24} color="var(--red)"/></div>
              <div style={{fontSize:16,fontWeight:600,marginBottom:6}}>Remove {confirmDelete.forename} {confirmDelete.surname}?</div>
              <div style={{color:'var(--text-muted)',fontSize:13}}>This will permanently delete their profile, attendance and fee records.</div>
            </div>
            <div className="modal-footer" style={{justifyContent:'center'}}>
              <button className="btn" onClick={()=>setConfirmDelete(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmAndDelete}><Trash2 size={13}/>Yes, delete</button>
            </div>
          </div>
        </div>
      )}

      {toast&&<div className="toast">✓ {toast}</div>}
      {showEnroll&&<EnrollmentForm onClose={()=>setShowEnroll(false)} onSaved={()=>setStudents(getStudents())}/>}
    </Layout>
  );
}
