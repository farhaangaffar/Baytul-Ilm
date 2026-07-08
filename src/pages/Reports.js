import React, { useState } from 'react';
import Layout from '../components/Layout';
import { getStudents, calcAttendanceCounts, calcAttendancePct, getStudentFees, getStudentRecords, avatarInitials, getSettings, currentSchoolYear } from '../lib/store';
import { FileText, Download, Sparkles } from 'lucide-react';

function fmtDate(iso) { try { return new Date(iso+'T12:00:00').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'}); } catch{ return iso; } }
function currentMonth() { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }

async function generateReportPDF(student, counts, fees, schoolName, aiSummary) {
  const { jsPDF } = await import('jspdf');
  await import('jspdf-autotable');
  const doc=new jsPDF({unit:'mm',format:'a4'});
  const W=210,margin=18,cW=W-margin*2;
  let y=0;

  // Header
  doc.setFillColor(42,42,42); doc.rect(0,0,W,36,'F');
  doc.setTextColor(249,210,224); doc.setFontSize(15); doc.setFont('helvetica','bold');
  doc.text(schoolName.toUpperCase(),W/2,13,{align:'center'});
  doc.setTextColor(255,255,255); doc.setFontSize(9); doc.setFont('helvetica','normal');
  doc.text('Student Progress Report',W/2,21,{align:'center'});
  doc.text('Academic Year '+currentSchoolYear(),W/2,28,{align:'center'});
  y=46;

  // Student info
  doc.setFillColor(253,242,244); doc.setDrawColor(240,200,212);
  doc.roundedRect(margin,y,cW,28,3,3,'FD');
  doc.setTextColor(42,42,42); doc.setFontSize(13); doc.setFont('helvetica','bold');
  doc.text(`${student.forename} ${student.surname}`,margin+8,y+10);
  doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.setTextColor(107,76,88);
  doc.text(`Class: ${student.class}`,margin+8,y+17);
  doc.text(`Date of birth: ${student.dob}`,margin+8,y+23);
  doc.text(`Enrolled: ${student.enrollDate}`,margin+80,y+17);
  doc.text(`Weekly fee: £${student.weeklyFee}/wk`,margin+80,y+23);
  y+=36;

  const section=(title)=>{
    doc.setFillColor(42,42,42); doc.rect(margin,y,cW,7,'F');
    doc.setTextColor(255,255,255); doc.setFontSize(8); doc.setFont('helvetica','bold');
    doc.text(title.toUpperCase(),margin+4,y+5);
    y+=11;
  };

  // Attendance
  section('Attendance Summary');
  const att=calcAttendancePct(student.id,currentSchoolYear());
  const attStatus=att>=90?'Excellent':att>=75?'Satisfactory':'Needs improvement';
  doc.autoTable({
    startY:y,
    head:[['Present','Late','Absent','Total days','Attendance %','Status']],
    body:[[counts.present,counts.late,counts.absent,counts.total,`${att}%`,attStatus]],
    margin:{left:margin,right:margin},
    headStyles:{fillColor:[253,242,244],textColor:[42,42,42],fontStyle:'bold',fontSize:9},
    bodyStyles:{fontSize:9,textColor:[26,26,26]},
  });
  y=doc.lastAutoTable.finalY+10;

  // Fees — outstanding only
  section('Fee Status');
  const outstanding=fees.filter(f=>f.status!=='Paid');
  if (outstanding.length===0) {
    doc.setTextColor(39,103,73); doc.setFontSize(10); doc.setFont('helvetica','bold');
    doc.text('✓  Fees are up to date — no outstanding payments.',margin+4,y+5);
    y+=14;
  } else {
    doc.autoTable({
      startY:y,
      head:[['Week starting','Amount','Status']],
      body:outstanding.map(f=>[f.weekStarting,`£${Number(f.amount).toFixed(2)}`,f.status]),
      margin:{left:margin,right:margin},
      headStyles:{fillColor:[253,242,244],textColor:[42,42,42],fontStyle:'bold',fontSize:9},
      bodyStyles:{fontSize:9,textColor:[26,26,26]},
      didParseCell:data=>{ if(data.column.index===2&&data.section==='body'){ data.cell.styles.textColor=[197,48,48]; data.cell.styles.fontStyle='bold'; } }
    });
    y=doc.lastAutoTable.finalY+10;
  }

  // Parent contacts
  section('Parent / Guardian Contacts');
  const contactRows=[[student.parent1Name||'—',student.parent1Phone||'—','Parent 1']];
  if (student.parent2Name||student.parent2Phone) contactRows.push([student.parent2Name||'—',student.parent2Phone||'—','Parent 2']);
  doc.autoTable({
    startY:y,
    head:[['Name','Phone','Relation']],
    body:contactRows,
    margin:{left:margin,right:margin},
    headStyles:{fillColor:[253,242,244],textColor:[42,42,42],fontStyle:'bold',fontSize:9},
    bodyStyles:{fontSize:9,textColor:[26,26,26]},
  });
  y=doc.lastAutoTable.finalY+10;

  // AI summary if available
  if (aiSummary) {
    section("Teacher's Notes & Monthly Summary");
    doc.setTextColor(26,26,26); doc.setFontSize(9); doc.setFont('helvetica','italic');
    const lines=doc.splitTextToSize(aiSummary,cW-8);
    doc.text(lines,margin+4,y);
    y+=lines.length*4.5+8;
  } else if (student.notes) {
    section("Notes");
    doc.setTextColor(26,26,26); doc.setFontSize(9); doc.setFont('helvetica','italic');
    const lines=doc.splitTextToSize(student.notes,cW-8);
    doc.text(lines,margin+4,y);
    y+=lines.length*4.5+8;
  }

  // Signatures
  const sigY=Math.max(y+10,245);
  doc.setDrawColor(42,42,42);
  doc.line(margin,sigY,margin+55,sigY); doc.line(margin+90,sigY,margin+145,sigY);
  doc.setFontSize(8); doc.setTextColor(107,76,88);
  doc.text('Class Teacher',margin,sigY+5);
  doc.text('Head of Madrasah',margin+90,sigY+5);

  // Footer
  doc.setFillColor(42,42,42); doc.rect(0,285,W,12,'F');
  doc.setTextColor(255,255,255); doc.setFontSize(7.5);
  doc.text(`${schoolName}  ·  Confidential  ·  ${new Date().toLocaleDateString('en-GB')}`,W/2,292,{align:'center'});

  doc.save(`Report_${student.forename}_${student.surname}.pdf`);
}

export default function Reports() {
  const students=getStudents();
  const settings=getSettings();
  const year=currentSchoolYear();
  const [selected,setSelected]=useState(null);
  const [generating,setGenerating]=useState('');
  const [aiSummaries,setAiSummaries]=useState({});
  const [aiLoading,setAiLoading]=useState('');
  const [toast,setToast]=useState('');

  function showToast(msg){setToast(msg);setTimeout(()=>setToast(''),3000);}

  async function generateAI(student) {
    const month=currentMonth();
    const records=getStudentRecords(student.id);
    const dates=Object.keys(records).filter(d=>d.startsWith(month)).sort((a,b)=>b.localeCompare(a));
    if (!dates.length) {
      setAiSummaries(p=>({...p,[student.id]:'No daily records found for this month. Add records in the Daily Records section first.'}));
      return;
    }
    const entries=dates.map(d=>{
      const e=records[d]||{};
      return `${fmtDate(d)}:\n  Comment: ${e.comment||'None'}\n  Positives: ${e.positive||'None'}\n  Concerns: ${e.negative||'None'}`;
    }).join('\n\n');
    const counts=calcAttendanceCounts(student.id,year);
    const prompt=`You are a helpful Madrasah assistant. Below are daily records for ${student.forename} ${student.surname} at ${settings.schoolName} for ${new Date().toLocaleDateString('en-GB',{month:'long',year:'numeric'})}.\n\nAttendance: ${counts.present} present, ${counts.late} late, ${counts.absent} absent.\n\n${entries}\n\nWrite a warm professional monthly progress summary for this student's report. Cover: overall attitude, key positives, recurring concerns, brief recommendation. 150–200 words, paragraph form.`;
    setAiLoading(student.id);
    try {
      const res=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:1000,messages:[{role:'user',content:prompt}]})});
      const data=await res.json();
      setAiSummaries(p=>({...p,[student.id]:data.content?.map(c=>c.text||'').join('')||'Unable to generate.'}));
    } catch { setAiSummaries(p=>({...p,[student.id]:'Connection error. Please try again.'})); }
    setAiLoading('');
  }

  async function download(student) {
    setGenerating(student.id);
    try {
      const counts=calcAttendanceCounts(student.id,year);
      const fees=getStudentFees(student.id,year);
      const ai=aiSummaries[student.id]||'';
      await generateReportPDF(student,counts,fees,settings.schoolName,ai);
      showToast(`Report downloaded for ${student.forename} ${student.surname}`);
    } catch(e) { showToast('Error generating PDF — try again.'); }
    setGenerating('');
  }

  const preview=selected?students.find(s=>s.id===selected):null;

  return (
    <Layout title="Reports" subtitle="Generate PDF progress reports">
      <div className="grid-2">
        {/* Student list */}
        <div className="card">
          <div className="card-header">
            <div><div className="card-title">Select a student</div><div className="card-sub">Click to preview · download button for PDF</div></div>
            <button className="btn btn-primary btn-sm" onClick={async()=>{
              setGenerating('all');
              for(const s of students){ const counts=calcAttendanceCounts(s.id,year),fees=getStudentFees(s.id,year),ai=aiSummaries[s.id]||''; await generateReportPDF(s,counts,fees,settings.schoolName,ai); }
              setGenerating(''); showToast(`${students.length} reports downloaded`);
            }}>{generating==='all'?'Generating…':<><Download size={13}/>All reports</>}</button>
          </div>
          {/* Scrollable list */}
          <div style={{maxHeight:480,overflowY:'auto'}}>
            {students.map(s=>{
              const att=calcAttendancePct(s.id,year);
              const isActive=selected===s.id;
              return (
                <div key={s.id} onClick={()=>setSelected(s.id)} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'9px 12px',borderRadius:'var(--radius-sm)',cursor:'pointer',background:isActive?'#f9fafb':'transparent',border:isActive?'1px solid var(--border-strong)':'1px solid transparent',marginBottom:3,transition:'all 0.1s'}}>
                  <div className="flex items-center gap-2">
                    <div className="avatar" style={{width:30,height:30,fontSize:10,background:isActive?'var(--ink)':undefined,color:isActive?'#fff':undefined}}>{avatarInitials(s.forename+' '+s.surname)}</div>
                    <div>
                      <div style={{fontWeight:500,fontSize:13}}>{s.forename} {s.surname}</div>
                      <div className="text-muted text-sm">{s.class}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span style={{fontSize:12,fontWeight:600,color:att>=90?'var(--green)':att>=75?'var(--amber)':att>0?'var(--red)':'var(--text-soft)'}}>{att>0?`${att}%`:'—'}</span>
                    <button className="btn btn-sm" onClick={e=>{e.stopPropagation();download(s);}} disabled={!!generating}>{generating===s.id?'…':<Download size={12}/>}</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Preview */}
        <div>
          {preview?(
            <div>
              <div className="flex justify-between items-center mb-4">
                <div style={{fontWeight:600,fontSize:14}}>Preview — {preview.forename} {preview.surname}</div>
                <div className="flex items-center gap-2">
                  <button className="btn btn-ai btn-sm" onClick={()=>generateAI(preview)} disabled={aiLoading===preview.id}>
                    <Sparkles size={13}/>{aiLoading===preview.id?'Generating…':'AI summary'}
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={()=>download(preview)} disabled={!!generating}>
                    <Download size={13}/>{generating===preview.id?'Generating…':'Download PDF'}
                  </button>
                </div>
              </div>
              <ReportPreview student={preview} schoolName={settings.schoolName} year={year} aiSummary={aiSummaries[preview.id]||''}/>
            </div>
          ):(
            <div className="card" style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:400,color:'var(--text-muted)'}}>
              <FileText size={40} style={{marginBottom:12,opacity:.25}}/>
              <div style={{fontWeight:500}}>Select a student to preview</div>
              <div className="text-sm" style={{marginTop:4}}>Reports include attendance, fee status and AI summary</div>
            </div>
          )}
        </div>
      </div>
      {toast&&<div className="toast"><FileText size={14}/> {toast}</div>}
    </Layout>
  );
}

function ReportPreview({ student, schoolName, year, aiSummary }) {
  const counts=calcAttendanceCounts(student.id,year);
  const att=calcAttendancePct(student.id,year);
  const fees=getStudentFees(student.id,year);
  const outstanding=fees.filter(f=>f.status!=='Paid');
  const attStatus=att>=90?'Excellent':att>=75?'Satisfactory':'Needs improvement';
  return (
    <div className="report-preview">
      <div className="report-header">
        <div className="report-arabic">بيت العلم</div>
        <div className="report-school">{schoolName}</div>
        <div className="report-sub">Student Progress Report · {year}</div>
      </div>
      <div className="report-section">
        <div className="report-section-title">Student details</div>
        {[['Name',`${student.forename} ${student.surname}`],['Class',student.class],['DOB',student.dob],['Enrolled',student.enrollDate],['Weekly fee',`£${student.weeklyFee}/wk`]].map(([k,v])=>(
          <div key={k} className="report-row"><span className="report-key">{k}</span><span className="report-val">{v}</span></div>
        ))}
      </div>
      <div className="report-section">
        <div className="report-section-title">Attendance</div>
        {[['Present',counts.present,'var(--green)'],['Late',counts.late,'var(--amber)'],['Absent',counts.absent,'var(--red)'],['Total days',counts.total,undefined],['Attendance %',`${att}%`,att>=90?'var(--green)':att>=75?'var(--amber)':'var(--red)'],['Status',attStatus,undefined]].map(([k,v,col])=>(
          <div key={k} className="report-row"><span className="report-key">{k}</span><span className="report-val" style={{color:col}}>{v}</span></div>
        ))}
      </div>
      <div className="report-section">
        <div className="report-section-title">Fee status</div>
        {outstanding.length===0?(
          <div style={{color:'var(--green)',fontWeight:600,fontSize:13,padding:'6px 0'}}>✓ Fees are up to date — no outstanding payments.</div>
        ):(
          outstanding.map(f=>(
            <div key={f.id} className="report-row">
              <span className="report-key">w/c {f.weekStarting}</span>
              <span className="report-val" style={{color:'var(--red)'}}>£{Number(f.amount).toFixed(2)} outstanding</span>
            </div>
          ))
        )}
      </div>
      <div className="report-section">
        <div className="report-section-title">Parent contacts</div>
        <div className="report-row"><span className="report-key">Parent 1</span><span className="report-val">{student.parent1Name} · {student.parent1Phone}</span></div>
        {student.parent2Name&&<div className="report-row"><span className="report-key">Parent 2</span><span className="report-val">{student.parent2Name} · {student.parent2Phone}</span></div>}
      </div>
      {aiSummary&&(
        <div className="report-section">
          <div className="report-section-title">Monthly summary</div>
          <p style={{fontSize:12,lineHeight:1.7,color:'var(--text)'}}>{aiSummary}</p>
        </div>
      )}
      <div className="report-sig-row">
        <div className="report-sig"><div className="report-sig-line"/><div className="report-sig-label">Class teacher</div></div>
        <div className="report-sig"><div className="report-sig-line"/><div className="report-sig-label">Head of Madrasah</div></div>
      </div>
      <div className="report-footer">{schoolName} · Confidential · {new Date().toLocaleDateString('en-GB')}</div>
    </div>
  );
}
