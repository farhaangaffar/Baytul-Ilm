import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import { LoadingState, ErrorState } from '../components/DataState';
import { getStudents, attendanceCountsFrom, attendancePctFrom, studentFeesFrom, getAttendance, getFees, getStudentRecords, avatarInitials, getSettings, currentSchoolYear, getAiSummariesForMonth, saveAiSummary } from '../lib/store';
import { generateReportPdfBytes, downloadPdfBytes } from '../lib/reportPdf';
import { FileText, Download, Sparkles } from 'lucide-react';

function fmtDate(iso) { try { return new Date(iso+'T12:00:00').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'}); } catch{ return iso; } }
function currentMonth() { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }

async function generateReportPDF(student, counts, studentFees, aiSummary, behavior) {
  const bytes = await generateReportPdfBytes({ student, counts, studentFees, aiSummary, behavior, reportDate: new Date() });
  downloadPdfBytes(bytes, `Report_${student.forename}_${student.surname}.pdf`);
}

export default function Reports() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [students, setStudents] = useState([]);
  const [settings, setSettings] = useState(null);
  const [year, setYear] = useState('');
  const [attendance, setAttendance] = useState({});
  const [fees, setFees] = useState([]);
  const [selected,setSelected]=useState(null);
  const [generating,setGenerating]=useState('');
  const [aiSummaries,setAiSummaries]=useState({});
  const [savedInstructions,setSavedInstructions]=useState({});
  const [behaviors,setBehaviors]=useState({});
  const [aiLoading,setAiLoading]=useState('');
  const [toast,setToast]=useState('');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const y = await currentSchoolYear();
      const [studentsData, settingsData, attendanceData, feesData, savedSummaries] = await Promise.all([
        getStudents(), getSettings(), getAttendance(y), getFees(y), getAiSummariesForMonth(currentMonth()).catch(()=>[]),
      ]);
      setStudents(studentsData); setSettings(settingsData); setYear(y); setAttendance(attendanceData); setFees(feesData);
      // Pre-load any summaries already saved from the Daily Records page (or a
      // previous visit here) so they don't disappear on navigating back.
      const summaryMap = {}; const instrMap = {}; const behaviorMap = {};
      savedSummaries.forEach(s => { summaryMap[s.studentId] = s.summary; instrMap[s.studentId] = s.instructions; behaviorMap[s.studentId] = s.behavior; });
      setAiSummaries(summaryMap); setSavedInstructions(instrMap); setBehaviors(behaviorMap);
    } catch (err) {
      setError(err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function showToast(msg){setToast(msg);setTimeout(()=>setToast(''),3000);}

  async function generateAI(student) {
    const month=currentMonth();
    let records;
    try { records = await getStudentRecords(student.id); }
    catch (err) { showToast(err.message || 'Could not load records'); return; }
    const dates=Object.keys(records).filter(d=>d.startsWith(month)).sort((a,b)=>b.localeCompare(a));
    if (!dates.length) {
      setAiSummaries(p=>({...p,[student.id]:'No daily records found for this month. Add records in the Daily Records section first.'}));
      return;
    }
    const entries=dates.map(d=>{
      const e=records[d]||{};
      return `${fmtDate(d)}:\n  Comment: ${e.comment||'None'}\n  Positives: ${e.positive||'None'}\n  Concerns: ${e.negative||'None'}`;
    }).join('\n\n');
    const counts=attendanceCountsFrom(attendance, student.id);
    const prompt=`You are a helpful Madrasah assistant. Below are daily records for ${student.forename} ${student.surname} at ${settings.schoolName} for ${new Date().toLocaleDateString('en-GB',{month:'long',year:'numeric'})}.\n\nAttendance: ${counts.present} present, ${counts.late} late, ${counts.absent} absent.\n\n${entries}\n\nWrite a warm professional monthly progress summary for this student's report. Cover: overall attitude, key positives, recurring concerns, brief recommendation. Keep it under 1000 characters (including spaces) so it fits the report's summary box — this is a hard limit, not a target to aim near. Plain prose in paragraph form. Do not use bullet points, headings, titles, or any Markdown formatting — output plain text only.`;
    setAiLoading(student.id);
    try {
      const res=await fetch('/api/ai-summary',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt})});
      const data=await res.json();
      if (!res.ok) throw new Error(data.error || 'API error');
      const summary=data.summary||'Unable to generate summary.';
      setAiSummaries(p=>({...p,[student.id]:summary}));
      // Save immediately — otherwise this only lives in local state and
      // disappears the moment this page is left and come back to.
      saveAiSummary(student.id, month, { summary, instructions: savedInstructions[student.id]||'' }).catch(()=>{});
    } catch (err) { setAiSummaries(p=>({...p,[student.id]:err.message || 'Connection error. Please try again.'})); }
    setAiLoading('');
  }

  async function download(student) {
    setGenerating(student.id);
    try {
      const counts=attendanceCountsFrom(attendance, student.id);
      const studentFees=studentFeesFrom(fees, student.id);
      const ai=aiSummaries[student.id]||'';
      await generateReportPDF(student,counts,studentFees,ai,behaviors[student.id]||'');
      showToast(`Report downloaded for ${student.forename} ${student.surname}`);
    } catch(e) { showToast('Error generating PDF — try again.'); }
    setGenerating('');
  }

  if (loading) return <Layout title="Reports"><LoadingState /></Layout>;
  if (error) return <Layout title="Reports"><ErrorState error={error} onRetry={load} /></Layout>;

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
              for(const s of students){
                const counts=attendanceCountsFrom(attendance, s.id), studentFees=studentFeesFrom(fees, s.id), ai=aiSummaries[s.id]||'';
                await generateReportPDF(s,counts,studentFees,ai,behaviors[s.id]||'');
              }
              setGenerating(''); showToast(`${students.length} reports downloaded`);
            }}>{generating==='all'?'Generating…':<><Download size={13}/>All reports</>}</button>
          </div>
          {/* Scrollable list */}
          <div style={{maxHeight:480,overflowY:'auto'}}>
            {students.map(s=>{
              const att=attendancePctFrom(attendance, s.id);
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
              <ReportPreview student={preview} schoolName={settings.schoolName} year={year} aiSummary={aiSummaries[preview.id]||''} attendance={attendance} fees={fees}/>
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

function ReportPreview({ student, schoolName, year, aiSummary, attendance, fees }) {
  const counts=attendanceCountsFrom(attendance, student.id);
  const att=attendancePctFrom(attendance, student.id);
  const studentFees=studentFeesFrom(fees, student.id);
  const outstanding=studentFees.filter(f=>f.status!=='Paid');
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
