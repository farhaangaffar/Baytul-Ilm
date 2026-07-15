import React, { useState, useEffect, useCallback, useRef } from 'react';
import Layout from '../components/Layout';
import { LoadingState, ErrorState } from '../components/DataState';
import { getStudents, attendanceCountsFrom, studentFeesFrom, getAttendance, getFees, avatarInitials, currentSchoolYear, getAiSummariesForMonth, getAiSummaries, academicYearOfMonth } from '../lib/store';
import { generateReportPdfBytes } from '../lib/reportPdf';
import { FileText, Download, Plus } from 'lucide-react';

function currentMonth() { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
function monthLabelFor(monthStr) { const [y,m]=monthStr.split('-').map(Number); return new Date(y,m-1,1).toLocaleDateString('en-GB',{month:'long',year:'numeric'}); }

async function buildReportBytes(student, attendance, fees, { summary, behavior, reportDate }) {
  const counts = attendanceCountsFrom(attendance, student.id);
  const studentFees = studentFeesFrom(fees, student.id);
  return generateReportPdfBytes({ student, counts, studentFees, aiSummary: summary, behavior, reportDate });
}

function downloadBytes(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function Reports() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [students, setStudents] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [fees, setFees] = useState([]);
  const [currentSummaries, setCurrentSummaries] = useState({}); // studentId -> {summary, behavior} for this month, used for bulk download + "Add new report"
  const [selected, setSelected] = useState(null);
  const [studentReports, setStudentReports] = useState([]); // all saved ai_summaries rows for the selected student
  const [activeMonth, setActiveMonth] = useState(null); // month string of whichever report is in the preview, or null = "new" (current, live)
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewBytes, setPreviewBytes] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [generating, setGenerating] = useState('');
  const [toast, setToast] = useState('');
  const previewUrlRef = useRef('');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const y = await currentSchoolYear();
      const [studentsData, attendanceData, feesData, savedSummaries] = await Promise.all([
        getStudents(), getAttendance(y), getFees(y), getAiSummariesForMonth(currentMonth()).catch(()=>[]),
      ]);
      setStudents(studentsData); setAttendance(attendanceData); setFees(feesData);
      const map = {};
      savedSummaries.forEach(s => { map[s.studentId] = { summary: s.summary, behavior: s.behavior }; });
      setCurrentSummaries(map);
    } catch (err) {
      setError(err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => () => { if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current); }, []);

  function showToast(msg){setToast(msg);setTimeout(()=>setToast(''),3000);}

  function setPreview(url, bytes) {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = url;
    setPreviewUrl(url); setPreviewBytes(bytes);
  }

  const generateAndPreview = useCallback(async (student, entry) => {
    setPreviewLoading(true);
    setActiveMonth(entry ? entry.month : null);
    try {
      const summary = entry ? entry.summary : (currentSummaries[student.id]?.summary || '');
      const behavior = entry ? entry.behavior : (currentSummaries[student.id]?.behavior || '');
      const reportDate = entry ? new Date(entry.updatedAt) : new Date();
      const bytes = await buildReportBytes(student, attendance, fees, { summary, behavior, reportDate });
      setPreview(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })), bytes);
    } catch (err) {
      showToast('Could not generate the PDF preview.');
    }
    setPreviewLoading(false);
  }, [attendance, fees, currentSummaries]);

  async function selectStudent(student) {
    setSelected(student.id);
    setStudentReports([]);
    let reports = [];
    try { reports = await getAiSummaries(student.id); } catch { /* history is a bonus, not required */ }
    setStudentReports(reports);
    generateAndPreview(student, null);
  }

  async function quickDownload(student) {
    setGenerating(student.id);
    try {
      const bytes = await buildReportBytes(student, attendance, fees, {
        summary: currentSummaries[student.id]?.summary || '', behavior: currentSummaries[student.id]?.behavior || '', reportDate: new Date(),
      });
      downloadBytes(bytes, `Report_${student.forename}_${student.surname}.pdf`);
      showToast(`Report downloaded for ${student.forename} ${student.surname}`);
    } catch { showToast('Error generating PDF — try again.'); }
    setGenerating('');
  }

  if (loading) return <Layout title="Reports"><LoadingState /></Layout>;
  if (error) return <Layout title="Reports"><ErrorState error={error} onRetry={load} /></Layout>;

  const preview = selected ? students.find(s => s.id === selected) : null;

  // Sectioned by academic year, newest year and newest month first.
  const reportsByYear = {};
  studentReports.forEach(r => {
    const yr = academicYearOfMonth(r.month);
    (reportsByYear[yr] = reportsByYear[yr] || []).push(r);
  });
  const years = Object.keys(reportsByYear).sort().reverse();
  years.forEach(y => reportsByYear[y].sort((a, b) => b.month.localeCompare(a.month)));

  return (
    <Layout title="Reports" subtitle="Generate PDF progress reports">
      <div className="grid-2" style={{alignItems:'start'}}>
        {/* Student list */}
        <div className="card">
          <div className="card-header">
            <div><div className="card-title">Select a student</div><div className="card-sub">Click a name for their report history</div></div>
            <button className="btn btn-primary btn-sm" onClick={async()=>{
              setGenerating('all');
              for(const s of students){
                const bytes = await buildReportBytes(s, attendance, fees, {
                  summary: currentSummaries[s.id]?.summary || '', behavior: currentSummaries[s.id]?.behavior || '', reportDate: new Date(),
                });
                downloadBytes(bytes, `Report_${s.forename}_${s.surname}.pdf`);
              }
              setGenerating(''); showToast(`${students.length} reports downloaded`);
            }}>{generating==='all'?'Generating…':<><Download size={13}/>All reports</>}</button>
          </div>
          {/* Scrollable list */}
          <div style={{maxHeight:480,overflowY:'auto'}}>
            {students.map(s=>{
              const isActive=selected===s.id;
              return (
                <div key={s.id} onClick={()=>selectStudent(s)} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'9px 12px',borderRadius:'var(--radius-sm)',cursor:'pointer',background:isActive?'#f9fafb':'transparent',border:isActive?'1px solid var(--border-strong)':'1px solid transparent',marginBottom:3,transition:'all 0.1s'}}>
                  <div className="flex items-center gap-2">
                    <div className="avatar" style={{width:30,height:30,fontSize:10,background:isActive?'var(--ink)':undefined,color:isActive?'#fff':undefined}}>{avatarInitials(s.forename+' '+s.surname)}</div>
                    <div>
                      <div style={{fontWeight:500,fontSize:13}}>{s.forename} {s.surname}</div>
                      <div className="text-muted text-sm">{s.class}</div>
                    </div>
                  </div>
                  <button className="btn btn-sm" onClick={e=>{e.stopPropagation();quickDownload(s);}} disabled={!!generating} title="Download this month's report">{generating===s.id?'…':<Download size={12}/>}</button>
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
                <div style={{fontWeight:600,fontSize:14}}>{preview.forename} {preview.surname}</div>
                <button className="btn btn-primary btn-sm" onClick={()=>generateAndPreview(preview, null)} disabled={previewLoading}>
                  <Plus size={13}/>{previewLoading&&activeMonth===null?'Generating…':'Add new report'}
                </button>
              </div>

              <div className="card mb-4">
                <div className="card-title" style={{marginBottom:10}}>Previous reports</div>
                {years.length===0?(
                  <div className="text-muted text-sm">No reports saved yet for {preview.forename} — write a summary on their Daily Records page, then come back here.</div>
                ):years.map(yr=>(
                  <div key={yr} style={{marginBottom:12}}>
                    <div style={{fontWeight:600,fontSize:12,color:'var(--text-muted)',marginBottom:6}}>Academic year {yr}</div>
                    {reportsByYear[yr].map(r=>{
                      const isActive = activeMonth===r.month;
                      return (
                        <div key={r.month} onClick={()=>generateAndPreview(preview, r)}
                          style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'7px 10px',borderRadius:'var(--r-md)',cursor:'pointer',background:isActive?'#f9fafb':'transparent',border:isActive?'1px solid var(--border-strong)':'1px solid transparent',marginBottom:3,fontSize:13}}>
                          <span>{monthLabelFor(r.month)}</span>
                          {previewLoading&&isActive?<span className="text-muted text-sm">Loading…</span>:<Download size={13} className="text-muted"/>}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>

              <div className="card" style={{padding:0,overflow:'hidden'}}>
                <div className="flex justify-between items-center" style={{padding:'10px 14px',borderBottom:'1px solid var(--border)'}}>
                  <div style={{fontWeight:500,fontSize:13}}>{activeMonth?monthLabelFor(activeMonth):'New report — current month'}</div>
                  <button className="btn btn-sm" disabled={!previewBytes} onClick={()=>downloadBytes(previewBytes, `Report_${preview.forename}_${preview.surname}.pdf`)}>
                    <Download size={12}/>Download
                  </button>
                </div>
                {previewLoading?(
                  <div style={{height:600,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-muted)'}}>Generating preview…</div>
                ):previewUrl?(
                  <iframe title="Report preview" src={`${previewUrl}#toolbar=0&navpanes=0`} style={{width:'100%',height:600,border:'none',display:'block'}}/>
                ):(
                  <div style={{height:600,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-muted)'}}>Could not load preview.</div>
                )}
              </div>
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
