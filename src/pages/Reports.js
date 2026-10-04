import React, { useState, useEffect, useCallback, useRef } from 'react';
import Layout from '../components/Layout';
import { LoadingState, ErrorState } from '../components/DataState';
import { useNavigate } from 'react-router-dom';
import { getStudents, getClassNames, getAttendance, getFees, currentSchoolYear, getAiSummariesForMonth, getAiSummaries, getTerms } from '../lib/store';
import { useBackToClose } from '../lib/useBackToClose';
import { reportPeriodSetting, currentReportPeriod, periodForKey } from '../lib/reportPeriods';
import { buildReportBytes, downloadPdfBytes as downloadBytes } from '../lib/reportPdf';
import { FileText, Download, X } from 'lucide-react';

// Box styles shared with Daily records' history boxes: plain grey, dark when chosen,
// light green when done.
const box = {
  border: '1px solid #dfe3e8', background: '#f3f4f6', color: 'var(--ink)', borderRadius: 8, padding: '7px 4px', minHeight: 46,
  cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'center', display: 'flex', flexDirection: 'column',
  justifyContent: 'center', alignItems: 'center', minWidth: 0,
};
const onBox = { background: 'var(--ink)', borderColor: 'var(--ink)', color: '#fff' };
const greenBox = { background: 'var(--green-light)', borderColor: 'var(--green)', color: 'var(--green-text)' };
const boxSub = { fontSize: 10.5, fontWeight: 500, opacity: 0.8, marginTop: 1 };


export default function Reports() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [students, setStudents] = useState([]);
  const [classNames, setClassNames] = useState([]);
  const [activeClass, setActiveClass] = useState(() => { try { return localStorage.getItem('reports_class') || ''; } catch { return ''; } });
  const navigate = useNavigate();
  // Attendance + fees per academic year, fetched as needed — a termly report (or an
  // older saved report) can belong to a different year than the current one.
  const yearData = useRef({});
  const [currentYear, setCurrentYear] = useState('');
  const [terms, setTerms] = useState([]);
  const [period, setPeriod] = useState(null); // the month or term reports are being made for now
  const [currentSummaries, setCurrentSummaries] = useState({}); // studentId -> {summary, behavior} for this month, used for bulk download + "Add new report"
  const [selected, setSelected] = useState(null);
  const [studentReports, setStudentReports] = useState([]); // all saved ai_summaries rows for the selected student
  const [activeMonth, setActiveMonth] = useState(undefined); // the saved report in the preview ('YYYY-MM' / 'term:<id>'); undefined = none chosen yet
  const [openYear, setOpenYear] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
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
      // The class last opened on this device, or the only class there is.
      setActiveClass(prev => prev && classNamesData.includes(prev) ? prev : (classNamesData.length === 1 ? classNamesData[0] : ''));
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

  function pickClass(c) {
    setActiveClass(c);
    try { localStorage.setItem('reports_class', c); } catch { /* fine */ }
  }

  // A child's report history, in a pop-up (the phone's back button closes it).
  async function openHistory(student) {
    setSelected(student.id); setOpenYear(null); setActiveMonth(undefined); setPreview('', null);
    setStudentReports([]); setHistoryLoading(true);
    try { setStudentReports(await getAiSummaries(student.id)); } catch { /* shows "no reports" */ }
    setHistoryLoading(false);
  }
  const closeHistory = useBackToClose(!!selected, () => { setSelected(null); setPreview('', null); });

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

  // Saved reports for the open student, by academic year, oldest to newest left to right
  // (like Daily records' boxes); the newest year opens first. Saved reports
  // can be monthly ('YYYY-MM') or termly ('term:<id>') — each sorted by its start date.
  const reportsByYear = {};
  studentReports.forEach(r => {
    const p = periodForKey(r.month, terms);
    (reportsByYear[p.yearLabel || '—'] = reportsByYear[p.yearLabel || '—'] || []).push({ ...r, _p: p });
  });
  const years = Object.keys(reportsByYear).sort();
  years.forEach(y => reportsByYear[y].sort((a, b) => a._p.start.localeCompare(b._p.start)));
  const shownYear = openYear && reportsByYear[openYear] ? openYear : years[years.length - 1];

  // Current children only — a left student's reports are on their card in the Students
  // page's "students who have left" section.
  const current = students.filter(s => s.status !== 'Inactive');
  const ready = s => !!currentSummaries[s.id]?.summary;
  const classStudents = current.filter(s => s.class === activeClass);
  const readyInClass = classStudents.filter(ready);
  const unit = period?.kind === 'term' ? 'term' : 'month';
  const reportName = s => `Report_${s.forename}_${s.surname}.pdf`;

  async function downloadReady() {
    if (!period) { showToast('Add your term dates in Settings → Terms first.'); return; }
    setGenerating('all');
    for (const s of readyInClass) {
      const bytes = await reportBytes(s, period, { summary: currentSummaries[s.id].summary, behavior: currentSummaries[s.id].behavior || '', reportDate: new Date() });
      downloadBytes(bytes, reportName(s));
    }
    setGenerating('');
    showToast(`${readyInClass.length} report${readyInClass.length !== 1 ? 's' : ''} downloaded for ${activeClass}`);
  }

  // "Not written" → that child's Report tab on Daily records, to write the summary.
  function writeReport(s) {
    try { localStorage.setItem('records_tab', 'report'); } catch { /* fine */ }
    navigate(`/records?student=${encodeURIComponent(s.id)}`);
  }

  return (
    <Layout title="Reports" subtitle={period ? `${period.label} reports` : 'PDF progress reports'}>
      {/* Classes as boxes (any number fit) — each shows how many of this month's or
          term's reports are written. Tap one for its children. */}
      <div className="card mb-4">
        <div className="card-title" style={{ marginBottom: 2 }}>Classes</div>
        <div className="card-sub" style={{ marginBottom: 12 }}>{period ? `Reports ready for ${period.label}` : 'Add your term dates in Settings → Terms first.'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 6 }}>
          {classNames.map(c => {
            const kids = current.filter(s => s.class === c);
            const n = kids.filter(ready).length;
            const on = activeClass === c;
            const done = kids.length > 0 && n === kids.length;
            return (
              <button key={c} type="button" onClick={() => pickClass(on ? '' : c)} aria-pressed={on}
                style={{ ...box, minHeight: 54, ...(on ? onBox : done ? greenBox : null) }}>
                <span style={{ fontWeight: 700, fontSize: 13, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c}</span>
                <span style={boxSub}>{n} of {kids.length} ready</span>
              </button>
            );
          })}
        </div>
      </div>

      {activeClass && (
        <>
          <div className="flex justify-between items-center" style={{ marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{activeClass}</div>
            <button className="btn btn-primary btn-sm" onClick={downloadReady} disabled={!!generating || !readyInClass.length}>
              <Download size={13} />{generating === 'all' ? 'Downloading…' : `Download all ready (${readyInClass.length})`}
            </button>
          </div>
          <div className="grid-2">
            {classStudents.map(s => {
              const ok = ready(s);
              return (
                <div key={s.id} className="card">
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{s.forename} {s.surname}</div>
                    <div className="text-muted text-sm">{s.class}</div>
                  </div>
                  <div className="box-row-3">
                    <button type="button" onClick={() => (ok ? openHistory(s) : writeReport(s))} style={{ ...box, ...(ok ? greenBox : null) }}
                      title={ok ? `See ${s.forename}'s report` : `Write ${s.forename}'s summary on Daily records`}>
                      <span style={{ fontWeight: 700, fontSize: 12.5 }}>{ok ? 'Ready' : 'Not written'}</span>
                      <span style={boxSub}>{ok ? `This ${unit}` : 'Write it →'}</span>
                    </button>
                    <button type="button" onClick={() => quickDownload(s)} disabled={!!generating} style={{ ...box, ...(ok ? onBox : null) }}
                      title={`Download this ${unit}'s report`}>
                      <span style={{ fontWeight: 700, fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>
                        {generating === s.id ? '…' : <><Download size={13} />PDF</>}
                      </span>
                      <span style={boxSub}>This {unit}</span>
                    </button>
                    <button type="button" onClick={() => openHistory(s)} style={box}>
                      <span style={{ fontWeight: 700, fontSize: 12.5 }}>History</span>
                      <span style={boxSub}>Older reports</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {classStudents.length === 0 && <div className="card text-muted text-sm">No children in {activeClass}.</div>}
        </>
      )}

      {/* A child's reports: year boxes → month (or term) boxes → that report's preview. */}
      {preview && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeHistory()}>
          <div className="modal" style={{ maxWidth: 760 }}>
            <div className="modal-header">
              <div>
                <div className="modal-title">{preview.forename} {preview.surname}</div>
                <div className="text-muted text-sm">{preview.class}</div>
              </div>
              <button className="btn btn-sm" onClick={closeHistory} aria-label="Close"><X size={14} /></button>
            </div>
            <div className="modal-body">
              {historyLoading ? <div className="text-muted text-sm">Loading…</div> : years.length === 0 ? (
                <div className="text-muted text-sm">No reports saved yet for {preview.forename} — write a summary on their Daily records page first.</div>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 6 }}>
                    {years.map(yr => (
                      <button key={yr} type="button" onClick={() => setOpenYear(yr)} style={{ ...box, ...(shownYear === yr ? onBox : null) }}>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>{yr}</span>
                        <span style={boxSub}>{reportsByYear[yr].length} report{reportsByYear[yr].length === 1 ? '' : 's'}</span>
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 6, marginTop: 8, paddingTop: 8, borderTop: '1px dashed #d5dae0' }}>
                    {(reportsByYear[shownYear] || []).map(r => (
                      <button key={r.month} type="button" onClick={() => generateAndPreview(preview, r)}
                        style={{ ...box, background: '#fafbfc', ...(activeMonth === r.month ? onBox : null) }}>
                        <span style={{ fontWeight: 600, fontSize: 12.5 }}>{r._p.kind === 'term' ? r._p.label.replace(/\s*\d{2}-\d{2}$/, '') : new Date(r._p.start + 'T12:00:00').toLocaleDateString('en-GB', { month: 'short' })}</span>
                        <span style={boxSub}>{r.behavior || 'Report'}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              {activeMonth !== undefined && (
                <div style={{ marginTop: 16, border: '1px solid #dfe3e8', borderRadius: 12, overflow: 'hidden' }}>
                  <div className="flex justify-between items-center" style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6', gap: 8 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{activeMonth ? periodForKey(activeMonth, terms).label : (period ? period.label : '')}</div>
                    <button className="btn btn-sm" disabled={!previewBytes} onClick={() => downloadBytes(previewBytes, reportName(preview))}><Download size={12} />Download</button>
                  </div>
                  {previewLoading ? (
                    <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>Making the report…</div>
                  ) : previewUrl ? (
                    <>
                      {/* Phones can't show a PDF inside the page — they get a button that
                          hands it to the phone's own PDF viewer instead. */}
                      <iframe title="Report preview" className="report-preview-embed" src={`${previewUrl}#toolbar=0&navpanes=0`} style={{ width: '100%', height: '70vh', border: 'none' }} />
                      <div className="report-preview-mobile-open" style={{ height: 160, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--text-muted)' }}>
                        <FileText size={30} style={{ opacity: .3 }} />
                        <button className="btn btn-primary btn-sm" disabled={!previewBytes} onClick={() => downloadBytes(previewBytes, reportName(preview))}>Open the report</button>
                      </div>
                    </>
                  ) : (
                    <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>Could not make the report.</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {toast&&<div className="toast"><FileText size={14}/> {toast}</div>}
    </Layout>
  );
}
