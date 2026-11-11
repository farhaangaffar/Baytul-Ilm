import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import EnrollmentForm from '../components/EnrollmentForm';
import ImportStudents from '../components/ImportStudents';
import { LoadingState, ErrorState } from '../components/DataState';
import { getStudents, deleteStudent, updateStudent, reorderStudents, avatarInitials, getClassNames, attendanceCountsFrom, attendancePctFrom, getAttendance, getFees, getDuFees, currentSchoolYear, formatDateGB, getStudentTotals, cancelRemainingFees, getAiSummaries, getTerms, getStudiesSummary, getPupilLogins } from '../lib/store';
import { periodForKey, isTermKey } from '../lib/reportPeriods';
import { buildReportBytes, downloadPdfBytes } from '../lib/reportPdf';
import { useBackToClose } from '../lib/useBackToClose';
import ReorderableGrid from '../components/ReorderableGrid';
import ParentLogin from '../components/ParentLogin';
import { Plus, Search, Pencil, Trash2, X, Save, GripVertical, Clock, ArrowRight, Users, ChevronDown, ChevronUp, Download, FileSpreadsheet, UserRound, BookOpen, CalendarCheck, FileText, KeyRound, Phone, Home, GraduationCap, BedDouble, StickyNote, LogOut } from 'lucide-react';
import BoxRow from '../components/BoxRow';
import { detailRows } from '../lib/studentDetails';
import { money, currencySymbol } from '../lib/branding';
import { feeUnit, feePer, ownedFees } from '../lib/feePeriods';
import HistoryBoxes, { shortPeriodLabel } from '../components/HistoryBoxes';
import { DetailInputs, HealthNote, HealthDot, ChoiceBoxes, ParentInputs, GrowingText } from '../components/StudentDetails';
import { useAuth } from '../lib/AuthContext';
import { PupilSheet, yearLabel } from './Studies';
import SchoolYearLine from '../components/SchoolNewYear';
import BoarderRecord from '../components/BoarderRecord';
import { PupilLoginCard, PupilLoginsLine } from '../components/PupilLogins';

const WAITING_LIST = 'Waiting list';

function fmtDob(dob) { try { return formatDateGB(dob); } catch { return dob; } }

// A school (madaaris.kind 'school') calls them pupils and has no fees or registers: its class lines show each class's
// year group and how much of this year's Islamic Studies is achieved, and a pupil opens their surahs, du'aas and practicals.
// A child's card: a white card per section with a small tinted icon (the owner's pick).
function InfoCard({ icon: Icon, tone = '', title, children }) {
  return (
    <div className="sv-card">
      <div className="sv-title"><span className={`sv-icon ${tone}`}><Icon size={13}/></span>{title}</div>
      {children}
    </div>
  );
}
function InfoRows({ rows }) {
  return rows.map(([l, v]) => <div key={l} className="sv-row"><span>{l}</span><span>{v}</span></div>);
}

export default function Students() {
  const { isDarulUloom, isSchool, user } = useAuth();
  // A school's pupil logins (stage 4), shown on each pupil's card and the "Pupil logins" line.
  const [pupilLogins, setPupilLogins] = useState([]);
  const loadPupilLogins = useCallback(() => (isSchool ? getPupilLogins().then(setPupilLogins).catch(() => {}) : Promise.resolve()), [isSchool]);
  useEffect(() => { loadPupilLogins(); }, [loadPupilLogins]);
  const [studies, setStudies] = useState({}); // a school: each class's Islamic Studies this year, by class name
  const [studiesPupil, setStudiesPupil] = useState(null);
  const word = isSchool ? 'Pupils' : 'Students';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [students, setStudents] = useState([]);
  const [classNames, setClassNames] = useState([]);
  const [year, setYear] = useState('');
  const [fees, setFees] = useState([]);
  const [attendance, setAttendance] = useState({});

  const [showEnroll, setShowEnroll] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [view, setView] = useState(() => new URLSearchParams(window.location.search).get('view') === 'waiting' ? 'waiting' : 'roster');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [toast, setToast] = useState('');
  const [saving, setSaving] = useState(false);
  // "Students who have left" — collapsed by default, with an all-time (every academic
  // year, not just the currently-loaded one) attendance/fees/records summary per
  // student, so their whole history is readable right on the card instead of needing
  // to hunt for it across Attendance/Daily Records/Fees (which no longer show them).
  const [leftExpanded, setLeftExpanded] = useState(false);
  const [confirmLeft, setConfirmLeft] = useState(null);
  // Which class cards are open — remembered on this device between visits.
  const [openClasses, setOpenClasses] = useState(() => {
    try { return JSON.parse(localStorage.getItem('students_open_classes') || '[]'); } catch { return []; }
  });
  const toggleClass = c => setOpenClasses(prev => {
    const next = prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c];
    try { localStorage.setItem('students_open_classes', JSON.stringify(next)); } catch {}
    return next;
  });
  const [leftTotals, setLeftTotals] = useState({});
  const [confirmCancelFees, setConfirmCancelFees] = useState(null);
  // Saved report months for whichever left student's profile is currently open —
  // fetched on demand rather than for everyone in the left section, since it's only
  // needed once you've actually opened someone's card.
  const [selectedReports, setSelectedReports] = useState([]);
  const [reportYear, setReportYear] = useState(null);   // open year in a left child's Previous reports
  const [reportPick, setReportPick] = useState(null);   // the report chosen there
  const [reportTerms, setReportTerms] = useState([]); // term dates, for any termly reports in that list
  const [downloadingReport, setDownloadingReport] = useState(null);
  const [duFees, setDuFees] = useState(null); // a Darul Uloom: each child's fee for the year, by id

  const fetchData = useCallback(async () => {
    const y = await currentSchoolYear();
    const [studentsData, classNamesData, feesData, attendanceData, duData] = await Promise.all([
      getStudents(), getClassNames(), isDarulUloom || isSchool ? Promise.resolve([]) : getFees(y), isSchool ? Promise.resolve({}) : getAttendance(y),
      isDarulUloom ? getDuFees().catch(() => null) : Promise.resolve(null),
    ]);
    if (isSchool) getStudiesSummary().then(list => setStudies(Object.fromEntries(list.map(c => [c.class, c])))).catch(() => {});
    setYear(y); setStudents(studentsData); setClassNames(classNamesData); setFees(ownedFees(feesData)); setAttendance(attendanceData);
    // A Darul Uloom: each child's year (paid / still to pay) from its yearly fee in instalments (src/pages/DuFees.js).
    setDuFees(duData ? Object.fromEntries(duData.students.map(x => [x.id, x])) : null);
    const leftIds = studentsData.filter(s=>s.status==='Inactive').map(s=>s.id);
    if (leftIds.length) getStudentTotals(leftIds).then(setLeftTotals).catch(()=>{/* pills are a bonus, not required to use the page */});
    else setLeftTotals({});
  }, [isDarulUloom, isSchool]);

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
  const closeSelected = useBackToClose(!!selected, () => setSelected(null));
  // Opening an online application marks it as seen (no longer "new").
  function openStudent(s) {
    setSelected(s);
    if (s.appliedNew) {
      updateStudent(s.id, { appliedNew: false }).catch(() => {});
      setStudents(list => list.map(x => (x.id === s.id ? { ...x, appliedNew: false } : x)));
    }
  }

  // A left student's saved reports live on their profile here instead of Reports.js
  // (which no longer lists them) — fetched fresh whenever a different left student
  // is opened, and cleared for anyone still active (they have none to show here).
  useEffect(() => {
    setReportYear(null); setReportPick(null);
    if (!selected || selected.status!=='Inactive') { setSelectedReports([]); return; }
    let cancelled = false;
    getAiSummaries(selected.id).then(async r => {
      const terms = r.some(x => isTermKey(x.month)) ? await getTerms().catch(() => []) : [];
      if (!cancelled) { setReportTerms(terms); setSelectedReports(r); }
    }).catch(()=>{});
    return () => { cancelled = true; };
  }, [selected]);

  async function downloadReport(student, report) {
    setDownloadingReport(report.month);
    try {
      // The report's own academic year, not whichever year happens to be loaded —
      // a left student's saved reports can span years before the current one.
      const p = periodForKey(report.month, reportTerms);
      const reportYear = p.yearLabel;
      const [attendanceForYear, feesForYear] = await Promise.all([getAttendance(reportYear), getFees(reportYear)]);
      const bytes = await buildReportBytes(student, attendanceForYear, feesForYear, {
        summary: report.summary, behavior: report.behavior, reportDate: new Date(report.updatedAt), period: p,
      });
      downloadPdfBytes(bytes, `Report_${student.forename}_${student.surname}_${p.label.replace(/\s+/g, '_')}.pdf`);
    } catch (err) {
      showToast(err.message || 'Could not generate that report');
    }
    setDownloadingReport(null);
  }

  // A school pupil: into another class, or left / back (their Islamic Studies marks stay with them either way).
  async function moveSelected(className) {
    const s = selected;
    try { await updateStudent(s.id, { class: className }); setSelected({ ...s, class: className }); await silentRefresh(); showToast(`${s.forename} moved to ${className}`); }
    catch (err) { showToast(err.message || 'Could not move them'); }
  }
  async function setLeft(s, left) {
    try {
      await updateStudent(s.id, left ? { status: 'Inactive', leaveDate: new Date().toISOString().split('T')[0] } : { status: 'Active', leaveDate: null });
      closeSelected(); await silentRefresh();
      showToast(left ? `${s.forename} is now under Left` : `${s.forename} is back in ${s.class}`);
    } catch (err) { showToast(err.message || 'Could not save'); }
  }

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''),2500); }
  function startEdit(s) { setEditForm({...s}); setEditing(s.id); closeSelected(); }

  async function saveEdit() {
    setSaving(true);
    // Captured before load() overwrites `students` — this is the one moment we can
    // still tell whether this save is what just turned them Inactive, as opposed to
    // e.g. re-saving an already-left student's profile with no status change.
    const original = students.find(s=>s.id===editing);
    const becomingLeft = original && original.status!=='Inactive' && editForm.status==='Inactive';
    try {
      const patch = {...editForm, weeklyFee: Number(editForm.weeklyFee)};
      if (becomingLeft && !patch.leaveDate) patch.leaveDate = new Date().toISOString().split('T')[0];
      await updateStudent(editing, patch);
      await load();
      setEditing(null); setEditForm(null);
      showToast('Student updated');
      // If they still have unpaid future weeks sitting on their account from when
      // "Add month" ran for the whole class, offer to clear just those — already-paid
      // weeks are never touched, so this never rewrites what actually happened.
      if (becomingLeft) {
        const fromDate = patch.leaveDate;
        const toCancel = fees.filter(f=>f.studentId===editing && f.status==='Pending' && f.weekStarting>=fromDate);
        if (toCancel.length) {
          setConfirmCancelFees({
            studentId: editing,
            name: `${editForm.forename} ${editForm.surname}`,
            fromDate,
            count: toCancel.length,
            amount: toCancel.reduce((s,f)=>s+Number(f.amount),0),
          });
        }
      }
    } catch (err) {
      showToast(err.message || 'Could not save changes');
    }
    setSaving(false);
  }

  async function doCancelFees() {
    setSaving(true);
    try {
      await cancelRemainingFees(confirmCancelFees.studentId, confirmCancelFees.fromDate);
      await silentRefresh();
      showToast(`Remaining unpaid ${feeUnit()}s cancelled`);
      setConfirmCancelFees(null);
    } catch (err) {
      showToast(err.message || 'Could not cancel those weeks');
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

  // Several children into one class at once (the "Not in a class" card), a few at a time.
  async function moveMany(list, className) {
    const day = new Date().toISOString().split('T')[0];
    let done = 0;
    try {
      for (let i = 0; i < list.length; i += 6) {
        await Promise.all(list.slice(i, i + 6).map(st => updateStudent(st.id, st.enrollDate ? { class: className } : { class: className, enrollDate: day }).then(() => { done++; })));
      }
      showToast(`${done} student${done===1?'':'s'} moved to ${className}`);
    } catch (err) {
      showToast(done ? `${done} moved — ${err.message || 'the rest could not be moved'}` : (err.message || 'Could not move them'));
    }
    await silentRefresh();
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

  if (loading) return <Layout title={word}><LoadingState /></Layout>;
  if (error) return <Layout title={word}><ErrorState error={error} onRetry={load} /></Layout>;

  const activeCount = students.filter(s=>s.status==='Active' && s.class!==WAITING_LIST).length;
  // Left students skew a "current" stat if included — they're a historical record
  // now, not part of today's roster.
  const rosterStudents = students.filter(s=>s.class!==WAITING_LIST && s.status!=='Inactive');
  const avgAtt = rosterStudents.length ? Math.round(rosterStudents.reduce((s,st)=>s+attendancePctFrom(attendance, st.id),0)/rosterStudents.length) : 0;
  const duList = duFees ? Object.values(duFees) : null;
  const collected = duList ? duList.reduce((t,x)=>t+x.paid,0) : fees.filter(f=>f.status==='Paid').reduce((s,f)=>s+Number(f.amount),0);
  const owed = duList ? duList.reduce((t,x)=>t+x.overdue,0) : fees.filter(f=>f.status!=='Paid').reduce((s,f)=>s+Number(f.amount),0);
  // Oldest first — whoever has waited longest is at the top.
  const waitingStudents = students.filter(s=>s.class===WAITING_LIST)
    .sort((a,b)=>String(a.addedAt||'').localeCompare(String(b.addedAt||'')) || `${a.forename} ${a.surname}`.localeCompare(`${b.forename} ${b.surname}`));
  const leftStudents = students.filter(s=>s.status==='Inactive' && s.class!==WAITING_LIST);
  // Children in no class: just imported from a spreadsheet (imports never place anyone), or
  // their class no longer exists — shown in their own card so the head can put them into classes.
  const noClassStudents = students.filter(s=>s.status!=='Inactive' && s.class!==WAITING_LIST && !classNames.includes(s.class));

  return (
    <Layout title={word} subtitle={`${students.length} enrolled`}>
      {isSchool ? <>
        {/* The figures as one row of small white boxes, like Classes & Teachers. */}
        <BoxRow columns="repeat(4, minmax(0, 1fr))" cells={[
          { text: String(activeCount), sub: 'Pupils', className: 'ct-figure' },
          { text: String(classNames.length), sub: 'Classes', className: 'ct-figure' },
          noClassStudents.length ? { text: String(noClassStudents.length), sub: 'Not in a class', tone: 'amber' } : { text: '0', sub: 'Not in a class', className: 'ct-figure' },
          { text: String(leftStudents.length), sub: 'Left', className: 'ct-figure', onClick: () => { setLeftExpanded(true); setTimeout(()=>document.getElementById('left-card')?.scrollIntoView({behavior:'smooth'}),50); } },
        ]}/>
        <div style={{height:10}}/>
      </> : (
      <div className="stat-grid-v2">
        <div className="stat-card-v2"><div className="n">{activeCount}</div><div className="l">Active students</div></div>
        <div className="stat-card-v2"><div className="n">{avgAtt}%</div><div className="l">Avg attendance</div></div>
        <div className="stat-card-v2"><div className="n">{money(collected)}</div><div className="l">Fees collected</div></div>
        <div className="stat-card-v2"><div className="n">{money(owed)}</div><div className="l">{duList ? 'Overdue' : 'Outstanding'}</div></div>
      </div>
      )}

      <div className="students-toolbar flex items-center justify-between mb-5" style={{flexWrap:'wrap',gap:12}}>
        <div className="students-toolbar-search" style={{position:'relative',flex:1}}>
          <Search size={14} style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',color:'var(--text-muted)'}}/>
          <input
            style={{height:31,boxSizing:'border-box',padding:'0 14px 0 34px',width:'100%',borderRadius:'var(--r-btn)',border:'none',boxShadow:'var(--shadow-sm)',fontSize:13}}
            placeholder="Search by name…" value={search} onChange={e=>setSearch(e.target.value)}
          />
        </div>
        <div className="students-toolbar-tabs" style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          {/* A school has no waiting list (its pupils come from the school's own records). */}
          {(!isSchool || waitingStudents.length > 0) && <>
          <button className={`btn ${view==='roster'?'btn-primary':''}`} style={view==='roster'?{background:'var(--blue)'}:undefined} onClick={()=>setView('roster')}>
            <Users size={14}/> Classes
          </button>
          <button className={`btn ${view==='waiting'?'btn-primary':''}`} style={view==='waiting'?{background:'var(--blue)'}:undefined} onClick={()=>setView('waiting')}>
            <Clock size={14}/> Waiting list{waitingStudents.length>0?` (${waitingStudents.length})`:''}
          </button>
          </>}
          <button className="btn" onClick={()=>setShowImport(true)}><FileSpreadsheet size={14}/> Import</button>
          <button className="btn btn-primary" style={{background:'var(--blue)'}} onClick={()=>setShowEnroll(true)}><Plus size={14}/> {isSchool ? 'Add a pupil' : 'Enroll'}</button>
        </div>
      </div>

      {view==='waiting' ? (
        <div>
          <div className="student-column-header"><span>Waiting list</span><span className="text-muted" style={{fontWeight:500,fontSize:12}}>{waitingStudents.length}</span></div>
          <div className="student-compact-list">
            {waitingStudents.filter(s => `${s.forename} ${s.surname}`.toLowerCase().includes(search.toLowerCase())).map(s=>(
              <div className="student-compact-card" key={s.id} style={{flexWrap:'wrap',gap:10}} onClick={()=>openStudent(s)}>
                <div style={{minWidth:0}}>
                  <div className="student-compact-name">{s.forename} {s.surname}<HealthDot student={s}/></div>
                  <div className="student-compact-sub">
                    {fmtDob(s.dob)}{s.addedAt?` · added ${formatDateGB(String(s.addedAt).slice(0,10))}`:''}
                    {s.appliedOnline&&<span className={`applied-tag ${s.appliedNew?'new':''}`}>{s.appliedNew?'Applied online · new':'Applied online'}</span>}
                    {s.appliedOnline&&String(s.notes||'').startsWith('Possible duplicate')&&<span className="applied-tag check">Check: possible duplicate</span>}
                  </div>
                </div>
                <div className="waiting-move" onClick={e=>e.stopPropagation()}>
                  <select value="" onChange={e=>e.target.value&&moveToClass(s,e.target.value)} aria-label={`Move ${s.forename} into a class`}>
                    <option value="">Select class…</option>
                    {classNames.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
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
        <>
        {noClassStudents.length>0&&!search&&(
          <NotInClass students={noClassStudents} classNames={classNames} onOpen={openStudent} onMove={moveMany}/>
        )}
        {/* A school: one card of class lines, like Classes & Teachers — tap a class to see its pupils underneath. */}
        {isSchool && classNames.length>0 && (
          <div className="card">
            <div className="card-header"><div><div className="card-title">Classes</div><div className="card-sub">{classNames.length} {classNames.length===1?'class':'classes'}</div></div></div>
            <div className="course-lines">
              {classNames.map(c=>{
                const classStudents = students.filter(s=>s.class===c && s.status!=='Inactive');
                const filtered = classStudents.filter(s => `${s.forename} ${s.surname}`.toLowerCase().includes(search.toLowerCase()));
                if (search && filtered.length===0) return null;
                const on = !!search || openClasses.includes(c);
                const st = studies[c];
                const done = st ? (st.achieved || 0) + (st.withHelp || 0) + (st.incomplete || 0) : 0;
                const sub = [st && st.yearGroup !== null && st.yearGroup !== undefined ? yearLabel(st.yearGroup) : '', `${classStudents.length} ${classStudents.length===1?'pupil':'pupils'}`, done ? `${Math.round((st.achieved || 0) * 100 / done)}% achieved` : ''].filter(Boolean).join(' · ');
                return (
                  <React.Fragment key={c}>
                    <button type="button" className={`line-row ${on ? 'on' : ''}`} onClick={()=>!search && toggleClass(c)} aria-expanded={on}>
                      <span className="ct-two"><span className="line-row-name">{c}</span><span className="line-row-sub">{sub}</span></span>
                      {on ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
                    </button>
                    {on && (
                      <div className="course-open">
                        <div className="course-lines pupil-lines">
                          {/* A to Z by first name, then surname (the owner's ask). */}
                          {[...filtered].sort((x,y)=>`${x.forename} ${x.surname}`.localeCompare(`${y.forename} ${y.surname}`, undefined, {sensitivity:'base'})).map(s=>(
                            <button key={s.id} type="button" className="line-row" onClick={()=>setSelected(s)}>
                              <span className="ct-two"><span className="line-row-name">{s.forename} {s.surname}</span><span className="line-row-sub">{fmtDob(s.dob)}</span></span>
                            </button>
                          ))}
                          {filtered.length===0 && <div className="text-muted" style={{fontSize:13,padding:8,textAlign:'center'}}>No pupils in {c} yet.</div>}
                        </div>
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        )}
        {/* One full-width card per class, closed by default so a madrasah with many classes
            isn't one long scroll. Searching opens every class with a match. */}
        {!isSchool && classNames.map(c=>{
          const classStudents = students.filter(s=>s.class===c && s.status!=='Inactive');
          const filtered = classStudents.filter(s => `${s.forename} ${s.surname}`.toLowerCase().includes(search.toLowerCase()));
          if (search && filtered.length===0) return null;
          const isOpen = !!search || openClasses.includes(c);
          const classAtt = classStudents.length ? Math.round(classStudents.reduce((t,st)=>t+attendancePctFrom(attendance, st.id),0)/classStudents.length) : 0;
          const ids = new Set(classStudents.map(s=>s.id));
          const classOwed = duList ? duList.filter(x=>ids.has(x.id)).reduce((t,x)=>t+x.overdue,0) : fees.filter(f=>ids.has(f.studentId) && f.status!=='Paid').reduce((t,f)=>t+Number(f.amount),0);
          return (
            <div key={c} className="card class-card">
              <button type="button" className="class-card-head" onClick={()=>!search && toggleClass(c)} aria-expanded={isOpen}>
                {isOpen?<ChevronUp size={16}/>:<ChevronDown size={16}/>}
                <span className="class-card-name">{c}</span>
                <span className="class-card-stats">
                  <span><strong>{classStudents.length}</strong> {isSchool ? (classStudents.length===1?'pupil':'pupils') : `student${classStudents.length===1?'':'s'}`}</span>
                  {/* Always all three, so every class's line has the same shape (on phones, three boxes). */}
                  {isSchool ? (() => { const st = studies[c]; return <>
                  <span><strong>{st && st.yearGroup !== null ? yearLabel(st.yearGroup) : '—'}</strong> year group</span>
                  {(() => { const done = st ? (st.achieved || 0) + (st.withHelp || 0) + (st.incomplete || 0) : 0; return <span><strong>{done ? `${Math.round((st.achieved || 0) * 100 / done)}%` : '—'}</strong> achieved</span>; })()}
                  </>; })() : <>
                  <span><strong>{classStudents.length>0 ? `${classAtt}%` : '—'}</strong> attendance</span>
                  <span style={classOwed>0 ? {color:'var(--red-text)'} : undefined}><strong>{money(classOwed)}</strong> owed</span>
                  </>}
                </span>
              </button>
              {isOpen && (
                <div style={{marginTop:14}}>
                  <ReorderableGrid
                    items={filtered}
                    getId={s=>s.id}
                    className="class-card-students"
                    onReordered={async ids => { try { await reorderStudents(ids); await silentRefresh(); } catch (err) { showToast(err.message || 'Could not save the new order'); } }}
                    renderItem={(s, {isDragging, handleProps, cardAttrs}) => (
                      <div className={`student-compact-card ${isDragging?'is-dragging':''}`} key={s.id} onClick={()=>setSelected(s)} {...cardAttrs}>
                        <div style={{minWidth:0}}>
                          <div className="student-compact-name">{s.forename} {s.surname}</div>
                          <div className="student-compact-sub">{isSchool ? '' : <>{duFees ? (duFees[s.id] ? `${money(duFees[s.id].paid, 0)} of ${money(duFees[s.id].expected, 0)} paid` : 'Fee not set') : `${money(s.weeklyFee)}${feePer()}`} · </>}{fmtDob(s.dob)}</div>
                        </div>
                        {!search && <div className="drag-handle" {...handleProps} onClick={e=>e.stopPropagation()} title="Drag to reorder"><GripVertical size={15}/></div>}
                      </div>
                    )}
                  />
                  {filtered.length===0&&(
                    <div style={{textAlign:'center',padding:12,color:'var(--text-muted)',fontSize:13}}>No students in {c} yet.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {search && !classNames.some(c=>students.some(s=>s.class===c && s.status!=='Inactive' && `${s.forename} ${s.surname}`.toLowerCase().includes(search.toLowerCase()))) && (
          <div className="card" style={{textAlign:'center',padding:20,color:'var(--text-muted)',fontSize:13}}>No {isSchool?'pupils':'students'} match your search.</div>
        )}
        {classNames.length===0 && (
          <div className="card" style={{textAlign:'center',padding:24,color:'var(--text-muted)',fontSize:13}}>
            No classes yet — add your classes on the {isDarulUloom ? 'Classes & Staff' : 'Classes & Teachers'} page, then enroll students into them, or tap Import to add a whole spreadsheet.
          </div>
        )}

        {isSchool && <SchoolYearLine onDone={silentRefresh}/>}
        {isSchool && <PupilLoginsLine students={students} logins={pupilLogins} demo={!!user?.demo} onChanged={loadPupilLogins}/>}
        {(leftStudents.length>0 || isSchool)&&(
          <div className="card" id="left-card" style={{marginTop:20}}>
            <div onClick={()=>setLeftExpanded(e=>!e)}
              style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontWeight:700,fontSize:13}}>
              {leftExpanded?<ChevronUp size={14}/>:<ChevronDown size={14}/>}
              {word} who have left ({leftStudents.length})
            </div>
            {leftExpanded&&isSchool&&!leftStudents.length&&<div className="text-muted" style={{fontSize:13,marginTop:10}}>No one yet. Open a pupil and tap "Mark as left the school".</div>}
            {leftExpanded&&(
              <div className="grid-2" style={{marginTop:16}}>
                {leftStudents.map(s=>{
                  const t = leftTotals[s.id] || {present:0,late:0,absent:0,paid:0,owed:0,recordsCount:0};
                  if (isSchool) return (
                    <button key={s.id} type="button" className="line-row" onClick={()=>setSelected(s)}>
                      <span style={{flex:1,minWidth:0}}>
                        <span className="line-row-name" style={{display:'block'}}>{s.forename} {s.surname}</span>
                        <span className="line-row-sub" style={{display:'block'}}>{s.class}{s.leaveDate?` · Left ${formatDateGB(s.leaveDate)}`:''}</span>
                      </span>
                    </button>
                  );
                  return (
                    <div key={s.id} className="card" style={{cursor:'pointer'}} onClick={()=>setSelected(s)}>
                      <div style={{marginBottom:10}}>
                        <div style={{fontWeight:600,fontSize:14}}>{s.forename} {s.surname}</div>
                        <div className="text-muted text-sm">{s.class}{s.leaveDate?` · Left ${formatDateGB(s.leaveDate)}`:''}</div>
                      </div>
                      {!isSchool && <>
                      {/* Attendance — same neutral-tile + colored-dot language as the
                          Daily Records / Attendance / Fees cards. */}
                      <div style={{display:'flex',gap:8,fontSize:12,marginBottom:8}}>
                        {[['Present',t.present,'var(--green)'],['Late',t.late,'var(--amber)'],['Absent',t.absent,'var(--red)']].map(([l,v,dot])=>(
                          <div key={l} style={{flex:1,background:'#f3f4f6',borderRadius:'var(--r-md)',padding:'8px 10px',textAlign:'center',position:'relative'}}>
                            <div style={{position:'absolute',top:7,right:7,width:7,height:7,borderRadius:'50%',background:dot}}/>
                            <div style={{fontWeight:700,color:'var(--ink)',fontSize:15}}>{v}</div>
                            <div style={{color:'var(--text-muted)',fontSize:10}}>{l}</div>
                          </div>
                        ))}
                      </div>
                      {/* Fees + records — all-time totals, spanning every academic year */}
                      <div style={{display:'flex',gap:8,fontSize:12}}>
                        <div style={{flex:1,background:'var(--green-light)',borderRadius:'var(--r-md)',padding:'6px 10px',textAlign:'center'}}>
                          <div style={{fontWeight:700,color:'var(--green-text)',fontSize:14}}>{money(t.paid)}</div>
                          <div style={{color:'var(--green-text)',fontSize:10}}>Paid</div>
                        </div>
                        <div style={{flex:1,background:'var(--red-light)',borderRadius:'var(--r-md)',padding:'6px 10px',textAlign:'center'}}>
                          <div style={{fontWeight:700,color:'var(--red-text)',fontSize:14}}>{money(t.owed)}</div>
                          <div style={{color:'var(--red-text)',fontSize:10}}>Owed</div>
                        </div>
                        <div style={{flex:1,background:'#f3f4f6',borderRadius:'var(--r-md)',padding:'6px 10px',textAlign:'center'}}>
                          <div style={{fontWeight:700,color:'var(--ink)',fontSize:14}}>{t.recordsCount}</div>
                          <div style={{color:'var(--text-muted)',fontSize:10}}>Records</div>
                        </div>
                      </div>
                      </>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        </>
      )}

      {/* View modal */}
      {selected&&(
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&closeSelected()}>
          <div className="modal sv-modal">
            <div className="modal-header">
              <div className="flex items-center gap-3">
                <div className="avatar" style={{width:40,height:40}}>{avatarInitials(selected.forename+' '+selected.surname)}</div>
                <div><div className="modal-title">{selected.forename} {selected.surname}</div><div className="text-muted text-sm">{selected.class}</div></div>
              </div>
              <button className="btn btn-icon" onClick={closeSelected}><X size={16}/></button>
            </div>
            <div className="modal-body sv-body">
              <HealthNote student={selected}/>
              {/* A card per section; two columns on computers (the owner's pick). */}
              <div className="sv-grid">
                <div className="sv-col">
                  <InfoCard icon={UserRound} tone="blue" title="About">
                    <InfoRows rows={[
                    ['Date of birth',formatDateGB(selected.dob)],
                    ...(selected.gender?[['Gender',selected.gender]]:[]),
                    ['Class',selected.class],
                    ['Enrolled',selected.enrollDate?formatDateGB(selected.enrollDate):'Not yet'],
                    ...(isSchool ? [] : duFees ? (duFees[selected.id] ? [['Fees this year',`${money(duFees[selected.id].paid)} of ${money(duFees[selected.id].expected)} paid`]] : []) : [[`Fee per ${feeUnit()}`,`${money(selected.weeklyFee)}${feePer()}`]]),
                    ['Status',selected.status],
                    ...(selected.appliedOnline?[['Applied online',selected.addedAt?formatDateGB(String(selected.addedAt).slice(0,10)):'Yes']]:[]),
                    ...(selected.parentUpdatedAt?[['Updated by parent',formatDateGB(String(selected.parentUpdatedAt).slice(0,10))]]:[]),
                    // Extra history rows only for a left student — their attendance/fees
                    // totals below are already all-time, so the fuller picture (paid,
                    // owed, daily records) lives here too rather than only as pills.
                    ...(selected.status==='Inactive' && isSchool ? [['Left',selected.leaveDate?formatDateGB(selected.leaveDate):'—']] : []),
                    ...(selected.status==='Inactive' && !isSchool?[
                      ['Left',selected.leaveDate?formatDateGB(selected.leaveDate):'—'],
                      ['Fees paid (all time)',`${money((leftTotals[selected.id]?.paid||0))}`],
                      ['Fees owed (all time)',`${money((leftTotals[selected.id]?.owed||0))}`],
                      ['Daily records',leftTotals[selected.id]?.recordsCount||0],
                    ]:[]),
                    ]}/>
                  </InfoCard>
                  {isSchool ? (
                    <InfoCard icon={BookOpen} tone="green" title="Islamic Studies">
                  <button type="button" className="line-row" onClick={()=>setStudiesPupil(selected.id)}>
                    <span className="line-row-name">Surahs, du'aas &amp; practicals</span><span className="line-row-sub">Open</span>
                  </button>
                  {/* Moving class or leaving: their marks always stay with them. */}
                  <div className="sv-sub">Class</div>
                  {selected.status==='Inactive' ? (
                    <button type="button" className="line-row" onClick={()=>setLeft(selected,false)}>
                      <span className="line-row-name">Back at the school</span><span className="line-row-sub">Put back in {selected.class}</span>
                    </button>
                  ) : <div style={{display:'grid',gap:6}}>
                    <div className="waiting-move">
                      <select value="" onChange={e=>e.target.value&&moveSelected(e.target.value)} aria-label="Move to another class">
                        <option value="">Move to another class…</option>
                        {classNames.filter(c=>c!==selected.class).map(c=><option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    {/* Red, and asks first (the owner's ask). */}
                    <button type="button" className="line-row line-row-red" onClick={()=>setConfirmLeft(selected)}>
                      <span className="line-row-name"><LogOut size={14} style={{verticalAlign:'-2px',marginRight:6}}/>Mark as left the school</span>
                    </button>
                  </div>}
                    </InfoCard>
                  ) : (
                    <InfoCard icon={CalendarCheck} tone="green" title={`Attendance${selected.status==='Inactive'?' (all time)':''}`}>
                      {(()=>{
                        const c = selected.status==='Inactive'
                          ? (()=>{ const t=leftTotals[selected.id]||{present:0,late:0,absent:0}; return {...t, total:t.present+t.late+t.absent}; })()
                          : attendanceCountsFrom(attendance, selected.id);
                        return <BoxRow cells={[
                          {text:c.present, sub:'Present', tone:'green'}, {text:c.late, sub:'Late', tone:'amber'}, {text:c.absent, sub:'Absent', tone:'red'},
                          {text:c.total?`${Math.round((c.present+c.late)*100/c.total)}%`:'—', sub:'Attended', label:true},
                        ]}/>;
                      })()}
                    </InfoCard>
                  )}
                  {(()=>{ const r=detailRows(selected,isDarulUloom,['du']); return r.length ? (
                    <InfoCard icon={GraduationCap} tone="blue" title="Darul Uloom"><InfoRows rows={r}/></InfoCard>
                  ) : null; })()}
                  {isSchool && selected.status!=='Inactive' && (
                    <InfoCard icon={KeyRound} tone="blue" title="Pupil login">
                      <PupilLoginCard key={selected.id} student={selected} login={pupilLogins.find(l=>l.studentId===selected.id)} demo={!!user?.demo} onChanged={loadPupilLogins}/>
                    </InfoCard>
                  )}
                  {selected.status==='Inactive'&&!isSchool&&(
                    <InfoCard icon={FileText} title="Previous reports">
                      <div>
                    {selectedReports.length===0?(
                      <div className="text-muted text-sm">No reports were saved for {selected.forename}.</div>
                    ):(()=>{
                      // Year boxes (oldest to newest) → month or term boxes → that report.
                      const byYear = {};
                      selectedReports.forEach(r => { const p=periodForKey(r.month, reportTerms); const yr=p.yearLabel||'—'; (byYear[yr]=byYear[yr]||[]).push({...r,_p:p}); });
                      const years = Object.keys(byYear).sort();
                      years.forEach(y => byYear[y].sort((a,b)=>a._p.start.localeCompare(b._p.start)));
                      const shown = reportYear && (byYear[reportYear]||[]).find(r=>r.month===reportPick);
                      return (<>
                        <HistoryBoxes
                          years={years.map(y=>({ key:y, label:y, sub:`${byYear[y].length} report${byYear[y].length===1?'':'s'}` }))}
                          open={reportYear} onToggle={y=>{ setReportYear(o=>o===y?null:y); setReportPick(null); }}
                          items={(byYear[reportYear]||[]).map(r=>({ key:r.month, label:shortPeriodLabel(r._p), sub:r.behavior||'Report' }))}
                          active={reportPick} onPick={k=>setReportPick(o=>o===k?null:k)}/>
                        {shown&&(
                          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,marginTop:10,padding:'8px 12px',borderRadius:'var(--r-md)',background:'#f9fafb',fontSize:13}}>
                            <span style={{fontWeight:600}}>{shown._p.label}</span>
                            <button className="btn btn-sm" onClick={()=>downloadReport(selected,shown)} disabled={downloadingReport===shown.month}>
                              {downloadingReport===shown.month?'…':<><Download size={12}/>Download</>}
                            </button>
                          </div>
                        )}
                      </>);
                    })()}
                  </div>
                    </InfoCard>
                  )}
                </div>
                <div className="sv-col">
                  <InfoCard icon={Phone} tone="amber" title="Contacts">
                    {[1,2].filter(n=>n===1||selected.parent2Name||selected.parent2Phone).map(n=>(
                      <div key={n} className="sv-contact">
                        <div><strong>{selected[`parent${n}Name`]||`Contact ${n}`}</strong>
                          {selected[`parent${n}Relation`]&&<span> · {selected[`parent${n}Relation`]}</span>}
                          {selected.mainContact===`Contact ${n}`&&<span className="sv-first"> · contact first</span>}
                        </div>
                        <div>{selected[`parent${n}Phone`]||'—'}</div>
                        {selected[`parent${n}Email`]&&<div className="text-muted" style={{overflowWrap:'anywhere'}}>{selected[`parent${n}Email`]}</div>}
                      </div>
                    ))}
                    {(()=>{ const e=[selected.emergencyName&&`${selected.emergencyName}${selected.emergencyRelation?` (${selected.emergencyRelation})`:''}`, selected.emergencyPhone].filter(Boolean).join(' · ');
                      return e ? <InfoRows rows={[['Emergency', e]]}/> : null; })()}
                  </InfoCard>
                  {(()=>{ const r=detailRows(selected,isDarulUloom,['family','home'],['mainContact']); return r.length ? (
                    <InfoCard icon={Home} tone="purple" title="Home & going home"><InfoRows rows={r}/></InfoCard>
                  ) : null; })()}
                  {isDarulUloom && selected.boarding==='Boarder' && selected.status==='Active' && (
                    <InfoCard icon={BedDouble} tone="purple" title="Boarding"><BoarderRecord studentId={selected.id} bare/></InfoCard>
                  )}
                  {selected.notes&&<InfoCard icon={StickyNote} title="Notes"><div className="text-muted" style={{fontSize:13,fontStyle:'italic'}}>"{selected.notes}"</div></InfoCard>}
                  <InfoCard icon={KeyRound} title="Parent login"><ParentLogin student={selected} students={students} bare/></InfoCard>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-danger" onClick={()=>{const s=selected;closeSelected();setConfirmDelete(s);}}><Trash2 size={13}/>Delete</button>
              <button className="btn btn-primary" style={{background:'var(--blue)'}} onClick={()=>startEdit(selected)}><Pencil size={13}/>Edit</button>
              <button className="btn" onClick={closeSelected}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* A school pupil's surahs, du'aas & practicals — on top of their card, which is there again on closing */}
      {studiesPupil && <PupilSheet id={studiesPupil} onClose={()=>setStudiesPupil(null)} />}

      {/* Edit modal */}
      {editing&&editForm&&(
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setEditing(null)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">Edit — {editForm.forename} {editForm.surname}</div>
              <button className="btn btn-icon" onClick={()=>setEditing(null)}><X size={16}/></button>
            </div>
            <div className="modal-body">
              <div className="form-section-title" style={{marginBottom:12}}>{isSchool ? 'Pupil details' : 'Student details'}</div>
              <div className="form-grid form-grid-2 mb-5">
                {[['Forename','forename'],['Surname','surname']].map(([l,k])=>(
                  <div className="form-group" key={k}><label>{l}</label><input value={editForm[k]} onChange={e=>setEditForm({...editForm,[k]:e.target.value})}/></div>
                ))}
                <div className="form-group"><label>Date of birth</label><input type="date" value={editForm.dob} onChange={e=>setEditForm({...editForm,dob:e.target.value})}/></div>
                <div className="form-group"><label>Gender</label><ChoiceBoxes options={['Boy','Girl']} value={editForm.gender||''} onChange={v=>setEditForm(f=>({...f,gender:v}))}/></div>
                {!isSchool && <div className="form-group"><label>Enrolment date</label><input type="date" value={editForm.enrollDate||''} onChange={e=>setEditForm({...editForm,enrollDate:e.target.value})}/></div>}
                <div className="form-group"><label>Status</label>
                  <select value={editForm.status} onChange={e=>{
                    const status = e.target.value;
                    // Pre-fill today as a convenient default the moment someone's marked
                    // as having left — still fully editable before saving.
                    const leaveDate = status==='Inactive' && !editForm.leaveDate ? new Date().toISOString().split('T')[0] : editForm.leaveDate;
                    setEditForm({...editForm,status,leaveDate});
                  }}>
                    <option value="Active">Active</option>
                    <option value="Inactive">{isSchool ? 'Left the school' : 'Inactive'}</option>
                    {!isSchool && <option value="Waiting list">Waiting list</option>}
                  </select>
                </div>
                {editForm.status==='Inactive'&&(
                  <div className="form-group"><label>Leave date</label><input type="date" value={editForm.leaveDate||''} onChange={e=>setEditForm({...editForm,leaveDate:e.target.value})}/></div>
                )}
              </div>
              <ParentInputs form={editForm} set={(k,v)=>setEditForm(f=>({...f,[k]:v}))}/>
              {/* A school keeps just the basics and contacts (it isn't the school's full record). */}
              {!isSchool && <DetailInputs form={editForm} set={(k,v)=>setEditForm(f=>({...f,[k]:v}))} isDarulUloom={isDarulUloom} only={['family','emergency','health','home','du']}/>}
              <div className="form-section-title" style={{marginBottom:12}}>{isSchool ? 'Class' : 'Class & fees'}</div>
              <div className="form-grid form-grid-2 mb-5">
                <div className="form-group"><label>Class</label>
                  <select value={editForm.class} onChange={e=>setEditForm({...editForm,class:e.target.value})}>
                    {classNames.map(c=><option key={c} value={c}>{c}</option>)}
                    <option value={WAITING_LIST}>{WAITING_LIST}</option>
                  </select>
                </div>
                {!isDarulUloom && !isSchool && <div className="form-group"><label>Fee per {feeUnit()} ({currencySymbol()})</label><input type="number" value={editForm.weeklyFee} onChange={e=>setEditForm({...editForm,weeklyFee:e.target.value})}/></div>}
              </div>
              <div className="form-group"><label>Notes</label><GrowingText minRows={2} value={editForm.notes||''} onChange={e=>setEditForm({...editForm,notes:e.target.value})}/></div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={()=>setEditing(null)}>Cancel</button>
              <button className="btn btn-primary" style={{background:'var(--blue)'}} onClick={saveEdit} disabled={saving}><Save size={13}/>{saving?'Saving…':'Save changes'}</button>
            </div>
          </div>
        </div>
      )}

      {/* A school pupil leaving: asks first, then they move to Left with their marks kept. */}
      {confirmLeft&&(
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setConfirmLeft(null)}>
          <div className="modal" style={{maxWidth:420}}>
            <div className="modal-body" style={{textAlign:'center',paddingTop:28}}>
              <div style={{width:52,height:52,borderRadius:'50%',background:'var(--red-light)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px'}}><LogOut size={24} color="var(--red-text)"/></div>
              <div style={{fontSize:16,fontWeight:600,marginBottom:6}}>Has {confirmLeft.forename} {confirmLeft.surname} left the school?</div>
              <div style={{color:'var(--text-muted)',fontSize:13}}>They'll move to the Left list. Their marks are kept, and you can put them back at any time.</div>
            </div>
            <div className="modal-footer" style={{justifyContent:'center'}}>
              <button className="btn" onClick={()=>setConfirmLeft(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={()=>{ const p=confirmLeft; setConfirmLeft(null); setLeft(p,true); }}><LogOut size={13}/>Yes, they've left</button>
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

      {/* Cancel remaining unpaid fees — offered right after marking someone as left,
          only when they actually have unpaid future weeks to clear. */}
      {confirmCancelFees&&(
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setConfirmCancelFees(null)}>
          <div className="modal" style={{maxWidth:420}}>
            <div className="modal-body" style={{textAlign:'center',paddingTop:28}}>
              <div style={{width:52,height:52,borderRadius:'50%',background:'var(--red-light)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px'}}><Trash2 size={24} color="var(--red-text)"/></div>
              <div style={{fontSize:16,fontWeight:600,marginBottom:6}}>Cancel remaining unpaid {feeUnit()}s?</div>
              <div style={{color:'var(--text-muted)',fontSize:13}}>
                {confirmCancelFees.name} has {confirmCancelFees.count} unpaid {feeUnit()}{confirmCancelFees.count!==1?'s':''} ({money(confirmCancelFees.amount)}) from {formatDateGB(confirmCancelFees.fromDate)} onward.
                <br/><span style={{fontSize:12}}>Already-paid weeks won't be touched. This cannot be undone.</span>
              </div>
            </div>
            <div className="modal-footer" style={{justifyContent:'center'}}>
              <button className="btn" onClick={()=>setConfirmCancelFees(null)}>Keep them</button>
              <button className="btn btn-danger" onClick={doCancelFees} disabled={saving}><Trash2 size={13}/>{saving?'Cancelling…':'Cancel these weeks'}</button>
            </div>
          </div>
        </div>
      )}

      {toast&&<div className="toast">✓ {toast}</div>}
      {showImport&&<ImportStudents classNames={classNames} students={students} onClose={()=>setShowImport(false)}
        onDone={msg=>{ setShowImport(false); showToast(msg); silentRefresh(); }}/>}
      {showEnroll&&<EnrollmentForm onClose={()=>setShowEnroll(false)} onSaved={silentRefresh}/>}
    </Layout>
  );
}


// Students → "Not in a class": children brought in from a spreadsheet (grouped by the class their
// sheet named) or whose class was deleted. Tick some — or a whole group — and move them together.
function NotInClass({ students, classNames, onOpen, onMove }) {
  const { isDarulUloom } = useAuth();
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);
  const groups = [];
  students.forEach(s => {
    const label = s.class ? `Was in ${s.class}` : s.sheetClass ? (s.sheetClass.startsWith('Last year: ') ? s.sheetClass : `On the spreadsheet: ${s.sheetClass}`) : 'No class given';
    let g = groups.find(x => x.label === label);
    if (!g) groups.push(g = { label, list: [] });
    g.list.push(s);
  });
  groups.forEach(g => g.list.sort((a, b) => `${a.forename} ${a.surname}`.localeCompare(`${b.forename} ${b.surname}`)));
  const ids = new Set(students.map(s => s.id));
  const chosen = picked.filter(id => ids.has(id));
  const toggle = id => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));
  const all = list => list.every(s => chosen.includes(s.id));
  const toggleAll = list => setPicked(p => (all(list) ? p.filter(id => !list.some(s => s.id === id)) : [...new Set([...p, ...list.map(s => s.id)])]));

  async function move(c) {
    if (!c || !chosen.length) return;
    setBusy(true);
    await onMove(students.filter(s => chosen.includes(s.id)), c);
    setPicked([]);
    setBusy(false);
  }

  return (
    <div className="card no-class-card">
      <div className="card-title">Not in a class ({students.length})</div>
      <div className="card-sub" style={{marginBottom:12}}>Tick the children for a class (or tick a group for all of them), then choose the class.</div>
      {groups.map(g => (
        <div key={g.label} className="no-class-group">
          <label className="no-class-head">
            <input type="checkbox" checked={all(g.list)} onChange={() => toggleAll(g.list)} />
            <span>{g.label}</span><span className="text-muted">{g.list.length}</span>
          </label>
          {g.list.map(s => (
            <div key={s.id} className={`no-class-row ${chosen.includes(s.id) ? 'on' : ''}`} onClick={() => toggle(s.id)}>
              <input type="checkbox" checked={chosen.includes(s.id)} onChange={() => toggle(s.id)} onClick={e => e.stopPropagation()} aria-label={`Select ${s.forename} ${s.surname}`} />
              <span className="no-class-name">{s.forename} {s.surname}<HealthDot student={s}/></span>
              <button type="button" className="btn btn-sm" onClick={e => { e.stopPropagation(); onOpen(s); }}>Details</button>
            </div>
          ))}
        </div>
      ))}
      <div className="no-class-move">
        <span>{busy ? 'Moving…' : chosen.length ? `${chosen.length} selected — move to:` : 'Tick children, then move them to:'}</span>
        {classNames.length ? (
          <div className="waiting-move">
            <select value="" disabled={busy || !chosen.length} onChange={e => move(e.target.value)} aria-label="Move the selected children to a class">
              <option value="">Select class…</option>
              {classNames.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        ) : <span className="text-muted">Add your classes on {isDarulUloom ? 'Classes & Staff' : 'Classes & Teachers'} first.</span>}
      </div>
    </div>
  );
}
