import React, { useState, useEffect, useCallback, useRef } from 'react';
import Layout from '../components/Layout';
import { LoadingState, ErrorState } from '../components/DataState';
import ClassBar from '../components/ClassBar';
import { getStudents, getClassNames, getClasses, getSettings, getAttendance, getFees, getStudentRecords, getQuranProgress, currentSchoolYear, getAcademicYears, academicYearStartISO, getAiSummariesForMonth, getAiSummaries, saveAiSummary, getTerms, attendanceCountsFrom, attendanceCountsForMonth, formatDateGB } from '../lib/store';
import { useBackToClose } from '../lib/useBackToClose';
import { shortPeriodLabel } from '../components/HistoryBoxes';
import { reportPeriodSetting, currentReportPeriod, periodForKey } from '../lib/reportPeriods';
import { buildReportBytes, downloadPdfBytes as downloadBytes } from '../lib/reportPdf';
import { effectiveQuranType } from '../lib/quran';
import { quranFactsForReport } from '../components/QuranCards';
import { checkSummaryFit } from '../lib/summaryFit';
import { FileText, Download, X, Sparkles } from 'lucide-react';

function isoToday() { return new Date().toISOString().split('T')[0]; }
function fmtDate(iso) {
  try { return `${new Date(iso+'T12:00:00').toLocaleDateString('en-GB',{weekday:'long'})} ${formatDateGB(iso)}`; }
  catch { return iso; }
}

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


// (A Darul Uloom has no Reports page — its reports are on Exams & reports.)
export default function Reports() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [students, setStudents] = useState([]);
  const [classNames, setClassNames] = useState([]);
  const [classTypes, setClassTypes] = useState({}); // class name → 'hifz' | 'nazira' | 'qaida', for the AI prompt's Qur'aan facts
  const [settings, setSettings] = useState(null);
  const [activeClass, setActiveClass] = useState(() => { try { return localStorage.getItem('reports_class') || ''; } catch { return ''; } });
  // Attendance + fees per academic year, fetched as needed — a termly report (or an
  // older saved report) can belong to a different year than the current one.
  const yearData = useRef({});
  const [currentYear, setCurrentYear] = useState('');
  const [academicYears, setAcademicYears] = useState([]);
  const [browseYear, setBrowseYear] = useState('');
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
  // Writing a new summary, inside the same history/preview modal — its own state,
  // reset every time the modal opens for a (possibly different) child.
  const [writing, setWriting] = useState(false);
  const [aiSummary, setAiSummary] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiInstructions, setAiInstructions] = useState('');
  const [behavior, setBehavior] = useState('');
  const [savingSummary, setSavingSummary] = useState(false);
  const [summaryFit, setSummaryFit] = useState(null);

  useEffect(() => {
    if (!aiSummary) { setSummaryFit(null); return; }
    let cancelled = false;
    checkSummaryFit(aiSummary).then(res => { if (!cancelled) setSummaryFit(res); });
    return () => { cancelled = true; };
  }, [aiSummary]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const y = await currentSchoolYear();
      const termsData = reportPeriodSetting() === 'termly' ? await getTerms() : [];
      const p = currentReportPeriod(termsData);
      const [studentsData, classNamesData, classesData, settingsData, attendanceData, feesData, savedSummaries, yearsData] = await Promise.all([
        getStudents(), getClassNames(), getClasses(), getSettings(), getAttendance(y), getFees(y), p ? getAiSummariesForMonth(p.key).catch(()=>[]) : Promise.resolve([]), getAcademicYears(),
      ]);
      yearData.current = { [y]: { attendance: attendanceData, fees: feesData } };
      setCurrentYear(y); setBrowseYear(y); setAcademicYears(yearsData); setTerms(termsData); setPeriod(p);
      setStudents(studentsData); setClassNames(classNamesData); setSettings(settingsData);
      setClassTypes(Object.fromEntries(classesData.filter(c => c.quranType).map(c => [c.name, c.quranType])));
      // The class last opened on this device, or the first one.
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

  function pickClass(c) {
    setActiveClass(c);
    try { localStorage.setItem('reports_class', c); } catch { /* fine */ }
  }

  // Switch which academic year's "ready" grid is shown — the current year's period as
  // of today, or a past year's first period (its own History still reaches every year).
  // Attendance/fees for that year are only fetched lazily, when a report is generated.
  async function switchYear(y) {
    setBrowseYear(y);
    const referenceDate = y === currentYear ? isoToday() : academicYearStartISO(y);
    const p = currentReportPeriod(terms, referenceDate);
    setPeriod(p);
    try {
      const savedSummaries = p ? await getAiSummariesForMonth(p.key).catch(() => []) : [];
      const map = {};
      savedSummaries.forEach(s => { map[s.studentId] = { summary: s.summary, behavior: s.behavior }; });
      setCurrentSummaries(map);
    } catch (err) {
      showToast(err.message || 'Could not load that year');
    }
  }

  // A child's report history, in a pop-up (the phone's back button closes it).
  // `startWriting` opens straight into the compose form — used for "Not written".
  async function openHistory(student, startWriting) {
    setSelected(student.id); setOpenYear(null); setActiveMonth(undefined); setPreview('', null);
    setStudentReports([]); setHistoryLoading(true);
    setWriting(!!startWriting); setAiSummary(''); setAiInstructions(''); setBehavior('');
    try { setStudentReports(await getAiSummaries(student.id)); } catch { /* shows "no reports" */ }
    setHistoryLoading(false);
  }
  const closeHistory = useBackToClose(!!selected, () => { setSelected(null); setPreview('', null); });

  // Writes this child's AI summary for the current period — the same prompt and
  // AI call Daily records used to make, just fetched here on demand rather than
  // kept loaded for every student all the time.
  async function summarise() {
    const student = students.find(s => s.id === selected);
    if (!student) return;
    setAiLoading(true); setAiSummary('');
    try {
      if (!period) { setAiSummary('Add your term dates in Settings → Terms first.'); setAiLoading(false); return; }
      const freshRecords = await getStudentRecords(student.id);
      const inThisPeriod = d => d >= period.start && d < period.endExclusive;
      const monthDates = Object.keys(freshRecords).filter(inThisPeriod).sort((a, b) => b.localeCompare(a));
      const classType = classTypes[student.class];
      const hasQuran = !!classType;
      if (!monthDates.length && !hasQuran) {
        setAiSummary(`No records found for this ${unit}. Add some lesson notes or behaviour records first.`);
        setAiLoading(false);
        return;
      }
      const entries = monthDates.map(d => {
        const e = freshRecords[d] || {};
        return `${fmtDate(d)}:\n  Comment: ${e.comment || 'None'}\n  Positives: ${e.positive || 'None'}\n  Concerns: ${e.negative || 'None'}`;
      }).join('\n\n');
      const termly = period.kind === 'term';
      const yearly = period.kind === 'year';
      const yr = termly || yearly ? period.yearLabel : currentYear;
      const attendanceForYear = await getAttendance(yr);
      const counts = termly || yearly ? attendanceCountsForMonth(attendanceForYear, student.id, period) : attendanceCountsFrom(attendanceForYear, student.id);
      const quranProgress = hasQuran ? await getQuranProgress(student.id).catch(() => null) : null;
      const quranType = hasQuran ? effectiveQuranType(classType, quranProgress?.quranType) : null;
      const quranFacts = quranType ? quranFactsForReport(quranType, quranProgress, period) : '';
      const prompt = `You are a helpful Madrasah assistant. Below are the records for ${student.forename} ${student.surname} at ${settings.schoolName} for ${period.label}.\n\nAttendance ${termly ? 'this term' : 'this year'}: ${counts.present} present, ${counts.late} late, ${counts.absent} absent.${quranFacts ? `\n\nQUR'AN PROGRESS AND LESSON NOTES (the main source for this report):\n${quranFacts}` : ''}${entries ? `\n\nBEHAVIOUR RECORDS:\n${entries}` : ''}\n\nWrite a warm, professional ${termly ? 'end-of-term' : yearly ? 'end-of-year' : 'monthly'} progress summary for this student suitable for their report. Base it mainly on the teacher's lesson notes and Qur'aan progress, and use the behaviour records for attitude and conduct. Cover: ${quranFacts ? "their Qur'aan progress (quote the figures above accurately, and draw on what the lesson notes say), " : ''}overall attitude and behaviour, key positives, any recurring concerns, and a brief recommendation. Keep it under 1000 characters (including spaces) so it fits the report's summary box — this is a hard limit, not a target to aim near. Plain prose in paragraph form only. Do not use bullet points, headings, titles, or any Markdown formatting — output plain text only.${aiInstructions ? `\n\nThe teacher has given these additional instructions for this summary — follow them: ${aiInstructions}` : ''}`;
      const res = await fetch('/api/ai-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, studentId: student.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'API error');
      setAiSummary(data.summary || 'Unable to generate summary.');
    } catch (err) {
      setAiSummary(err.message || 'Could not generate a summary. Please try again.');
    }
    setAiLoading(false);
  }

  // Only picks the rating — it's saved with the summary on "Add to report". (Saving it on its
  // own used to save whatever was in the summary box with it: an empty box wiped a report that
  // was already added, and an unchecked draft became visible to parents.)
  function setBehaviorRating(val) {
    setBehavior(b => (b === val ? '' : val)); // click again to clear
  }

  async function addToReport() {
    const student = students.find(s => s.id === selected);
    if (!student || !period) return;
    setSavingSummary(true);
    try {
      await saveAiSummary(student.id, period.key, { summary: aiSummary, instructions: aiInstructions, behavior });
      setCurrentSummaries(m => ({ ...m, [student.id]: { summary: aiSummary, behavior } }));
      setAiSummary(''); setAiInstructions(''); setBehavior('');
      setWriting(false);
      showToast('Added to report');
      setStudentReports(await getAiSummaries(student.id).catch(() => []));
    } catch (err) {
      showToast(err.message || 'Could not save summary');
    }
    setSavingSummary(false);
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
  const unit = period?.kind === 'term' ? 'term' : period?.kind === 'year' ? 'year' : 'month';
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

  return (
    <Layout title="Reports" subtitle={period ? `${period.label} reports` : 'PDF progress reports'}>
      <div className="text-muted text-sm mb-4">
        {period ? `Reports ready for ${period.label}` : 'Add your term dates in Settings → Terms first.'}
        {browseYear !== currentYear && ` — browsing ${browseYear}`}
      </div>

      <ClassBar classes={classNames} active={activeClass} onPick={pickClass} years={academicYears} year={browseYear} onYear={switchYear}
        notes={Object.fromEntries(classNames.map(c => {
          const kids = current.filter(s => s.class === c);
          const n = kids.filter(ready).length;
          return [c, `${n} of ${kids.length} ready`];
        }))} />

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
                    <button type="button" onClick={() => openHistory(s, !ok)} style={{ ...box, ...(ok ? greenBox : null) }}
                      title={ok ? `See ${s.forename}'s report` : `Write ${s.forename}'s summary`}>
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
              <div className="flex items-center gap-2">
                {!writing && <button className="btn btn-sm" onClick={() => { setWriting(true); setAiSummary(''); setAiInstructions(''); setBehavior(''); }}>Write a report</button>}
                {writing && years.length > 0 && <button className="btn btn-sm" onClick={() => setWriting(false)}>View history</button>}
                <button className="btn btn-sm" onClick={closeHistory} aria-label="Close"><X size={14} /></button>
              </div>
            </div>
            <div className="modal-body">
              {writing ? (
                <>
                  <div className="card-sub" style={{ marginBottom: 14 }}>
                    {period ? <>AI report paragraph for {preview.forename} — {period.label}</> : 'Add your term dates in Settings → Terms to write reports.'}
                  </div>
                  {period && (<>
                    <div className="form-group" style={{ marginBottom: 14 }}>
                      <label>Class behaviour (for report)</label>
                      <div className="flex gap-2" style={{ marginTop: 4, flexWrap: 'wrap' }}>
                        {['Excellent', 'Good', 'Fair', 'Poor'].map(opt => {
                          const active = behavior === opt;
                          return (
                            <button key={opt} type="button" className="btn btn-sm" onClick={() => setBehaviorRating(opt)}
                              style={{ flex: '1 1 80px', minWidth: 0, justifyContent: 'center', background: active ? 'var(--ink)' : undefined, color: active ? '#fff' : undefined, borderColor: active ? 'var(--ink)' : undefined }}>
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="form-group" style={{ marginBottom: 12 }}>
                      <label>Instructions for the AI (optional)</label>
                      <textarea
                        value={aiInstructions}
                        onChange={e => setAiInstructions(e.target.value)}
                        placeholder="e.g. focus on his Qur'aan memorisation progress, keep it brief…"
                        rows={2}
                        style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '8px 10px', fontFamily: 'var(--font)', fontSize: 13, resize: 'vertical' }}
                      />
                    </div>
                    <button className="btn btn-ai" style={{ width: '100%', justifyContent: 'center', padding: '10px', marginBottom: 14 }} onClick={summarise} disabled={aiLoading}>
                      <Sparkles size={15} />{aiLoading ? 'Generating…' : (aiSummary ? 'Regenerate summary ↗' : `Summarise this ${unit} ↗`)}
                    </button>
                    {aiLoading && <div className="ai-summary-box"><div style={{ color: 'var(--teal-dark)', fontStyle: 'italic', fontSize: 13 }}>Reading through {preview.forename}'s records…</div></div>}
                    {aiSummary && !aiLoading && (
                      <div className="ai-summary-box">
                        <div className="ai-summary-title"><Sparkles size={13} />Summary — {period.label}</div>
                        <textarea
                          className="ai-summary-text"
                          value={aiSummary}
                          onChange={e => setAiSummary(e.target.value)}
                          rows={8}
                          style={{ width: '100%', border: 'none', background: 'transparent', resize: 'vertical', outline: 'none', padding: 0, fontFamily: 'inherit', fontSize: 'inherit', lineHeight: 'inherit', color: 'inherit' }}
                        />
                        {summaryFit && (
                          <div style={{ fontSize: 11, marginTop: 6, color: summaryFit.fits ? 'var(--text-muted)' : 'var(--red)' }}>
                            {summaryFit.fits
                              ? `Fits the report's summary box (${summaryFit.lines}/${summaryFit.maxLines} lines)`
                              : `Won't fit the summary box — ${summaryFit.overflowLines} line${summaryFit.overflowLines === 1 ? '' : 's'} will spill onto a second page`}
                          </div>
                        )}
                        <button className="btn btn-primary btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: 10 }} onClick={addToReport} disabled={savingSummary}>
                          {savingSummary ? 'Saving…' : 'Add to report'}
                        </button>
                      </div>
                    )}
                    {!aiSummary && !aiLoading && (
                      <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                        <Sparkles size={24} style={{ opacity: .2, marginBottom: 8, display: 'block', margin: '0 auto 8px' }} />
                        Add lesson notes or behaviour records on Daily records, then click above to write a summary for {preview.forename}.
                      </div>
                    )}
                  </>)}
                </>
              ) : historyLoading ? <div className="text-muted text-sm">Loading…</div> : years.length === 0 ? (
                <div className="text-muted text-sm">No reports saved yet for {preview.forename} — click "Write a report" above to add one.</div>
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
                        <span style={{ fontWeight: 600, fontSize: 12.5 }}>{shortPeriodLabel(r._p)}</span>
                        <span style={boxSub}>{r.behavior || 'Report'}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              {!writing && activeMonth !== undefined && (
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
