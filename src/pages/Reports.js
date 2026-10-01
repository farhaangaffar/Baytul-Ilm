import React, { useState, useEffect, useCallback, useRef } from 'react';
import Layout from '../components/Layout';
import { LoadingState, ErrorState } from '../components/DataState';
import { getStudents, getClassNames, getAttendance, getFees, avatarInitials, currentSchoolYear, getAiSummariesForMonth, getAiSummaries, getTerms } from '../lib/store';
import { reportPeriodSetting, currentReportPeriod, periodForKey } from '../lib/reportPeriods';
import { buildReportBytes, downloadPdfBytes as downloadBytes } from '../lib/reportPdf';
import { FileText, Download, Plus } from 'lucide-react';


export default function Reports() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [students, setStudents] = useState([]);
  const [classNames, setClassNames] = useState([]);
  const [activeClass, setActiveClass] = useState('');
  // Attendance + fees per academic year, fetched as needed — a termly report (or an
  // older saved report) can belong to a different year than the current one.
  const yearData = useRef({});
  const [currentYear, setCurrentYear] = useState('');
  const [terms, setTerms] = useState([]);
  const [period, setPeriod] = useState(null); // the month or term reports are being made for now
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
      const termsData = reportPeriodSetting() === 'termly' ? await getTerms() : [];
      const p = currentReportPeriod(termsData);
      const [studentsData, classNamesData, attendanceData, feesData, savedSummaries] = await Promise.all([
        getStudents(), getClassNames(), getAttendance(y), getFees(y), p ? getAiSummariesForMonth(p.key).catch(()=>[]) : Promise.resolve([]),
      ]);
      yearData.current = { [y]: { attendance: attendanceData, fees: feesData } };
      setCurrentYear(y); setTerms(termsData); setPeriod(p);
      setStudents(studentsData); setClassNames(classNamesData);
      setActiveClass(prev => prev && classNamesData.includes(prev) ? prev : (classNamesData[0] || ''));
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

  async function dataFor(p) {
    const yr = p.yearLabel || currentYear;
    if (!yearData.current[yr]) {
      const [attendance, fees] = await Promise.all([getAttendance(yr), getFees(yr)]);
      yearData.current[yr] = { attendance, fees };
    }
    return yearData.current[yr];
  }

  async function reportBytes(student, p, { summary, behavior, reportDate }) {
    const { attendance, fees } = await dataFor(p);
    return buildReportBytes(student, attendance, fees, { summary, behavior, reportDate, period: p });
  }

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
      const p = entry ? periodForKey(entry.month, terms) : period;
      if (!p) { setPreview('', null); setPreviewLoading(false); return; }
      const bytes = await reportBytes(student, p, { summary, behavior, reportDate });
      setPreview(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })), bytes);
    } catch (err) {
      showToast('Could not generate the PDF preview.');
    }
    setPreviewLoading(false);
  }, [currentSummaries, period, terms, currentYear]);

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
      if (!period) { showToast('Add your term dates in Settings → Terms first.'); setGenerating(''); return; }
      const bytes = await reportBytes(student, period, {
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
  // Saved reports can be monthly ('YYYY-MM') or termly ('term:<id>') — each sorted by
  // the date its period starts.
  studentReports.forEach(r => {
    const p = periodForKey(r.month, terms);
    (reportsByYear[p.yearLabel || '—'] = reportsByYear[p.yearLabel || '—'] || []).push({ ...r, _p: p });
  });
  const years = Object.keys(reportsByYear).sort().reverse();
  years.forEach(y => reportsByYear[y].sort((a, b) => b._p.start.localeCompare(a._p.start)));

  // Split by class so a bulk download doesn't have to mean "every student in the
  // school" — pick a class, then "All reports" only covers that class's students.
  // A left student's reports live on their card in the Students page's "students who
  // have left" section instead — not duplicated here in the day-to-day class list.
  const classStudents = students.filter(s => s.class === activeClass && s.status!=='Inactive');

  return (
    <Layout title="Reports" subtitle="Generate PDF progress reports">
      {/* Unified top box: student picker on the left, selected student's
          header + report history on the right, inside one card. */}
      <div className="card mb-4" style={{padding:0}}>
        <div className="reports-top-grid">
          <div className="reports-top-col" style={{borderRight:'1px solid var(--border)'}}>
            <div className="card-header" style={{marginBottom:10}}>
              <div><div className="card-title">Select a student</div><div className="card-sub">Click a name for their report history</div></div>
              <button className="btn btn-primary btn-sm" onClick={async()=>{
                if (!period) { showToast('Add your term dates in Settings → Terms first.'); return; }
                setGenerating('all');
                for(const s of classStudents){
                  const bytes = await reportBytes(s, period, {
                    summary: currentSummaries[s.id]?.summary || '', behavior: currentSummaries[s.id]?.behavior || '', reportDate: new Date(),
                  });
                  downloadBytes(bytes, `Report_${s.forename}_${s.surname}.pdf`);
                }
                setGenerating(''); showToast(`${classStudents.length} report${classStudents.length!==1?'s':''} downloaded for ${activeClass}`);
              }}>{generating==='all'?'Generating…':<><Download size={13}/>{activeClass||'All'} reports</>}</button>
            </div>
            <div className="class-tabs" style={{marginBottom:12}}>
              {classNames.map(c=>(
                <button key={c} className={`class-tab ${activeClass===c?'active':''}`} onClick={()=>setActiveClass(c)}>{c}</button>
              ))}
            </div>
            {/* Scrollable list */}
            <div style={{maxHeight:420,overflowY:'auto'}}>
              {classStudents.map(s=>{
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
                    <button className="btn btn-sm" onClick={e=>{e.stopPropagation();quickDownload(s);}} disabled={!!generating} title={`Download this ${period?.kind === 'term' ? 'term' : 'month'}'s report`}>{generating===s.id?'…':<Download size={12}/>}</button>
                  </div>
                );
              })}
              {classStudents.length===0&&(
                <div className="text-muted text-sm" style={{padding:'12px 4px'}}>No students in {activeClass}.</div>
              )}
            </div>
          </div>

          <div className="reports-top-col">
            {preview?(
              <>
                <div className="card-header" style={{marginBottom:10}}>
                  <div><div className="card-title">{preview.forename} {preview.surname}</div><div className="card-sub">{preview.class}</div></div>
                  <button className="btn btn-primary btn-sm" onClick={()=>generateAndPreview(preview, null)} disabled={previewLoading}>
                    <Plus size={13}/>{previewLoading&&activeMonth===null?'Generating…':'Add new report'}
                  </button>
                </div>
                <div style={{maxHeight:420,overflowY:'auto'}}>
                  <div style={{fontWeight:600,fontSize:12,color:'var(--text-muted)',marginBottom:6}}>Previous reports</div>
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
                            <span>{r._p.label}</span>
                            {previewLoading&&isActive?<span className="text-muted text-sm">Loading…</span>:<Download size={13} className="text-muted"/>}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </>
            ):(
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:300,color:'var(--text-muted)'}}>
                <FileText size={40} style={{marginBottom:12,opacity:.25}}/>
                <div style={{fontWeight:500}}>Select a student to preview</div>
                <div className="text-sm" style={{marginTop:4}}>Reports include attendance, fee status and AI summary</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Preview — one big box, full width. */}
      {preview&&(
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <div className="flex justify-between items-center" style={{padding:'10px 14px',borderBottom:'1px solid var(--border)'}}>
            <div style={{fontWeight:500,fontSize:13}}>{activeMonth?periodForKey(activeMonth, terms).label:(period?`New report — ${period.label}`:'New report')}</div>
            <button className="btn btn-sm" disabled={!previewBytes} onClick={()=>downloadBytes(previewBytes, `Report_${preview.forename}_${preview.surname}.pdf`)}>
              <Download size={12}/>Download
            </button>
          </div>
          {previewLoading?(
            <div style={{height:800,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-muted)'}}>Generating preview…</div>
          ):previewUrl?(
            <>
              {/* Mobile browsers generally can't embed a blob PDF inline in an
                  iframe — it renders as an inert "open" placeholder that does
                  nothing when tapped. A blob: URL is also scoped to the tab
                  that created it, so window.open(previewUrl) unreliably opens
                  blank on mobile Safari/Chrome even as a new tab — a real
                  download (same as the Download button above) is the one
                  thing guaranteed to work, handed off to the OS's own PDF
                  viewer/Files app instead of staying in-browser. */}
              <iframe title="Report preview" className="report-preview-embed" src={`${previewUrl}#toolbar=0&navpanes=0`} style={{width:'100%',height:800,border:'none'}}/>
              <div className="report-preview-mobile-open" style={{height:300,flexDirection:'column',alignItems:'center',justifyContent:'center',gap:12,color:'var(--text-muted)'}}>
                <FileText size={36} style={{opacity:.3}}/>
                <div style={{fontSize:13}}>Preview isn't supported on this device</div>
                <button className="btn btn-primary btn-sm" disabled={!previewBytes} onClick={()=>downloadBytes(previewBytes, `Report_${preview.forename}_${preview.surname}.pdf`)}>Download to view</button>
              </div>
            </>
          ):(
            <div style={{height:800,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-muted)'}}>Could not load preview.</div>
          )}
        </div>
      )}
      {toast&&<div className="toast"><FileText size={14}/> {toast}</div>}
    </Layout>
  );
}
