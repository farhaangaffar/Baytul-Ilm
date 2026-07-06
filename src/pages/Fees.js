// pages/Fees.js — spreadsheet grid layout
import React, { useState } from 'react';
import Layout from '../components/Layout';
import { getFees, getStudents, markFeePaid, markFeeUnpaid, addFeeRecord, deleteFeeRecord, updateFeeAmount, getMondayOf, avatarInitials, getClassNames } from '../lib/store';
import { Plus, X, Pencil, Check } from 'lucide-react';

function isoToday() { return new Date().toISOString().split('T')[0]; }

export default function Fees() {
  const students = getStudents();
  const classNames = getClassNames();
  const [fees, setFees] = useState(getFees);
  const [toast, setToast] = useState('');
  const [activeClass, setActiveClass] = useState(classNames[0] || '');
  const [showCharge, setShowCharge] = useState(false);
  const [chargeDate, setChargeDate] = useState(isoToday());
  const [editCell, setEditCell] = useState(null); // { feeId, val }

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 2500); }

  function togglePaid(fee) {
    if (fee.status === 'Paid') { markFeeUnpaid(fee.id); } else { markFeePaid(fee.id); }
    setFees(getFees());
    showToast(fee.status === 'Paid' ? 'Marked as unpaid' : 'Marked as paid');
  }

  function saveEdit(feeId) {
    const val = parseFloat(editCell.val);
    if (!isNaN(val) && val >= 0) { updateFeeAmount(feeId, val); setFees(getFees()); showToast('Amount updated'); }
    setEditCell(null);
  }

  function chargeWeek() {
    const weekStarting = getMondayOf(chargeDate);
    const classStudents = students.filter(s => s.status === 'Active' && s.class === activeClass);
    const existing = new Set(fees.filter(f => f.weekStarting === weekStarting).map(f => f.studentId));
    let count = 0;
    classStudents.forEach(s => {
      if (!existing.has(s.id)) { addFeeRecord({ studentId:s.id, weekStarting, amount:s.weeklyFee||15, status:'Pending' }); count++; }
    });
    setFees(getFees());
    setShowCharge(false);
    showToast(count > 0 ? `${count} students charged for w/c ${weekStarting}` : 'All students already charged for that week');
  }

  const classStudents = students.filter(s => s.class === activeClass);
  const classFees = fees.filter(f => classStudents.find(s => s.id === f.studentId));

  // Get sorted unique weeks
  const weeks = [...new Set(classFees.map(f => f.weekStarting))].sort();

  // Build lookup: studentId → weekStarting → fee record
  const lookup = {};
  classFees.forEach(f => {
    if (!lookup[f.studentId]) lookup[f.studentId] = {};
    lookup[f.studentId][f.weekStarting] = f;
  });

  // Totals
  const totalPaid = classFees.filter(f => f.status==='Paid').reduce((s,f) => s+Number(f.amount), 0);
  const totalOwed = classFees.filter(f => f.status!=='Paid').reduce((s,f) => s+Number(f.amount), 0);

  return (
    <Layout title="Fee management" subtitle="Grid view — students as rows, weeks as columns">
      <div className="class-tabs">
        {classNames.map(c => (
          <button key={c} className={`class-tab ${activeClass===c?'active':''}`} onClick={() => setActiveClass(c)}>{c}</button>
        ))}
      </div>

      <div className="metrics-grid mb-6">
        <div className="metric-card"><div className="metric-icon green" style={{background:'#f0fff4',color:'#276749'}} /><div className="metric-value" style={{color:'#276749'}}>£{totalPaid.toFixed(2)}</div><div className="metric-label">Collected — {activeClass}</div></div>
        <div className="metric-card"><div className="metric-icon red" /><div className="metric-value" style={{color:'var(--red)'}}>£{totalOwed.toFixed(2)}</div><div className="metric-label">Outstanding</div></div>
        <div className="metric-card"><div className="metric-icon gold" /><div className="metric-value">{classFees.filter(f=>f.status!=='Paid').length}</div><div className="metric-label">Unpaid records</div></div>
        <div className="metric-card"><div className="metric-icon brown" /><div className="metric-value">{classStudents.filter(s=>s.status==='Active').length}</div><div className="metric-label">Active students</div></div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Fee register — {activeClass}</div>
            <div className="card-sub">✓ = paid · ✗ = unpaid · click to toggle · click £ to edit amount</div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowCharge(true)}>
            <Plus size={13} /> Charge a week
          </button>
        </div>

        {weeks.length === 0 ? (
          <div style={{textAlign:'center',padding:40,color:'var(--text-muted)'}}>
            No fee records yet. Click "Charge a week" to get started.
          </div>
        ) : (
          <div className="fee-grid-wrap">
            <table className="fee-grid">
              <thead>
                <tr>
                  <th className="name-col">Student</th>
                  {weeks.map(w => (
                    <th key={w}>
                      <div>{new Date(w+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</div>
                      <div style={{fontWeight:400,fontSize:10,opacity:0.7}}>w/c</div>
                    </th>
                  ))}
                  <th className="total-col">Total paid</th>
                  <th className="total-col">Owed</th>
                </tr>
              </thead>
              <tbody>
                {classStudents.map(s => {
                  const studentPaid = weeks.reduce((sum,w) => {
                    const f = lookup[s.id]?.[w];
                    return sum + (f && f.status==='Paid' ? Number(f.amount) : 0);
                  }, 0);
                  const studentOwed = weeks.reduce((sum,w) => {
                    const f = lookup[s.id]?.[w];
                    return sum + (f && f.status!=='Paid' ? Number(f.amount) : 0);
                  }, 0);
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
                      {weeks.map(w => {
                        const f = lookup[s.id]?.[w];
                        if (!f) return (
                          <td key={w}>
                            <div style={{display:'flex',alignItems:'center',justifyContent:'center'}}>
                              <div className="fee-empty" title="No record">—</div>
                            </div>
                          </td>
                        );
                        const isEditing = editCell?.feeId === f.id;
                        return (
                          <td key={w}>
                            <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:3}}>
                              {/* Paid toggle */}
                              <button
                                className={f.status==='Paid' ? 'fee-tick' : 'fee-cross'}
                                onClick={() => togglePaid(f)}
                                title={f.status==='Paid' ? 'Click to mark unpaid' : 'Click to mark paid'}
                              >
                                {f.status==='Paid' ? '✓' : '✗'}
                              </button>
                              {/* Amount — editable */}
                              {isEditing ? (
                                <div style={{display:'flex',alignItems:'center',gap:2}}>
                                  <input
                                    type="number"
                                    value={editCell.val}
                                    onChange={e => setEditCell({...editCell, val:e.target.value})}
                                    onKeyDown={e => { if(e.key==='Enter') saveEdit(f.id); if(e.key==='Escape') setEditCell(null); }}
                                    autoFocus
                                    style={{width:44,padding:'2px 4px',fontSize:11,border:'1px solid var(--gold)',borderRadius:4,fontFamily:'var(--font)',textAlign:'center'}}
                                  />
                                  <button style={{background:'none',border:'none',cursor:'pointer',color:'#276749',padding:1}} onClick={() => saveEdit(f.id)}><Check size={11}/></button>
                                  <button style={{background:'none',border:'none',cursor:'pointer',color:'var(--red)',padding:1}} onClick={() => setEditCell(null)}><X size={11}/></button>
                                </div>
                              ) : (
                                <button
                                  style={{background:'none',border:'none',cursor:'pointer',fontSize:11,color:'var(--text-muted)',display:'flex',alignItems:'center',gap:2,fontFamily:'var(--font)',padding:'1px 3px',borderRadius:3}}
                                  title="Click to edit amount"
                                  onClick={() => setEditCell({feeId:f.id, val:String(f.amount)})}
                                >
                                  £{Number(f.amount).toFixed(2)} <Pencil size={9} style={{opacity:0.5}}/>
                                </button>
                              )}
                            </div>
                          </td>
                        );
                      })}
                      <td className="total-col">£{studentPaid.toFixed(2)}</td>
                      <td className="total-col" style={{color:studentOwed>0?'var(--red)':undefined}}>
                        {studentOwed > 0 ? `£${studentOwed.toFixed(2)}` : '—'}
                      </td>
                    </tr>
                  );
                })}
                {/* Column totals row */}
                <tr style={{borderTop:'2px solid var(--border-strong)',background:'var(--brown-faint)'}}>
                  <td className="name-col" style={{fontWeight:600,fontSize:12,color:'var(--brown)'}}>Weekly total</td>
                  {weeks.map(w => {
                    const wTotal = classFees.filter(f=>f.weekStarting===w&&f.status==='Paid').reduce((s,f)=>s+Number(f.amount),0);
                    const wOwed  = classFees.filter(f=>f.weekStarting===w&&f.status!=='Paid').reduce((s,f)=>s+Number(f.amount),0);
                    return (
                      <td key={w} style={{textAlign:'center',fontSize:11}}>
                        <div style={{fontWeight:600,color:'#276749'}}>£{wTotal.toFixed(0)}</div>
                        {wOwed>0 && <div style={{color:'var(--red)',fontSize:10}}>-£{wOwed.toFixed(0)}</div>}
                      </td>
                    );
                  })}
                  <td className="total-col">£{totalPaid.toFixed(2)}</td>
                  <td className="total-col" style={{color:totalOwed>0?'var(--red)':undefined}}>
                    {totalOwed>0?`£${totalOwed.toFixed(2)}`:'—'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Charge modal */}
      {showCharge && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget&&setShowCharge(false)}>
          <div className="modal" style={{maxWidth:460}}>
            <div className="modal-header">
              <div className="modal-title">Charge a week — {activeClass}</div>
              <button className="btn btn-icon" onClick={()=>setShowCharge(false)}><X size={16}/></button>
            </div>
            <div className="modal-body">
              <div className="form-group" style={{marginBottom:16}}>
                <label>Pick any date in the week to charge</label>
                <input type="date" value={chargeDate} onChange={e=>setChargeDate(e.target.value)} />
                <span style={{fontSize:12,color:'var(--text-muted)',marginTop:4}}>
                  Week starting Monday: <strong>{getMondayOf(chargeDate)}</strong>
                </span>
              </div>
              <p style={{fontSize:13,color:'var(--text-muted)',lineHeight:1.6,marginBottom:14}}>
                Creates a <strong>Pending</strong> record for every active {activeClass} student at their individual rate. Students already charged that week are skipped. Charge any week — past or future.
              </p>
              <div style={{background:'var(--bg)',borderRadius:'var(--radius-sm)',padding:'10px 14px',fontSize:13}}>
                {classStudents.filter(s=>s.status==='Active').map(s=>(
                  <div key={s.id} className="flex justify-between" style={{padding:'4px 0',borderBottom:'1px solid var(--border)'}}>
                    <span>{s.forename} {s.surname}</span>
                    <span style={{fontWeight:600,color:'var(--brown)'}}>£{s.weeklyFee||15}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={()=>setShowCharge(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={chargeWeek}>Generate charges</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">✓ {toast}</div>}
    </Layout>
  );
}
