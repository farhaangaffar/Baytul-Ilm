import React, { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import Layout from '../components/Layout';
import { LoadingState, ErrorState } from '../components/DataState';
import { QuranEntryCard, QuranProgressCard, quranFactsForReport } from '../components/QuranCards';
import { rangeLabel, upToLabel, effectiveQuranType } from '../lib/quran';
import { getClasses, getQuranProgress, getStudents, getClassNames, getSettings, getStudentRecords, getDailyRecords, saveDailyRecord, deleteDailyRecord, attendanceCountsFrom, attendanceCountsForMonth, getAttendance, currentSchoolYear, getAiSummaries, saveAiSummary, formatDateGB, academicYearOfMonth, hasEnrolledBy, getCurrentSchoolMonth, getTerms, currentSchoolMonthKey as currentMonth } from '../lib/store';
import { reportPeriodSetting, currentReportPeriod, periodForKey } from '../lib/reportPeriods';
import { checkSummaryFit } from '../lib/summaryFit';
import { useBackToClose } from '../lib/useBackToClose';
import { Sparkles, ChevronDown, ChevronUp, Plus, ArrowLeft, Trash2, Check, X, Pencil } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';

function isoToday() { return new Date().toISOString().split('T')[0]; }
function fmtDate(iso) {
  try { return `${new Date(iso+'T12:00:00').toLocaleDateString('en-GB',{weekday:'long'})} ${formatDateGB(iso)}`; }
  catch { return iso; }
}
function monthLabelFor(ym) {
  const [y,m]=ym.split('-').map(Number);
  return new Date(y,m-1,1).toLocaleDateString('en-GB',{month:'long',year:'numeric'});
}

// Stable textarea that doesn't lose focus on mobile
// Key: do NOT re-render the textarea on every keystroke — use uncontrolled + ref-based save
// Saves what's been typed if the box disappears (switching tab) before its debounce
// or blur has fired.
function useFlushOnUnmount(ref, timer, onSave) {
  const save = useRef(onSave);
  save.current = onSave;
  useEffect(() => {
    const el = ref.current;
    return () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; if (el) save.current(el.value); } };
  }, [ref, timer]);
}

function StableTextarea({ initialValue, onSave, placeholder, style }) {
  const ref = useRef(null);
  const timer = useRef(null);
  useFlushOnUnmount(ref, timer, onSave);

  const handleChange = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      if (ref.current) onSave(ref.current.value);
    }, 400);
  };

  // Flush immediately when focus leaves — otherwise a click elsewhere (e.g.
  // "Add day") can fire before the debounce timer does, and the edit is
  // never saved before this field's data gets refreshed from the server.
  const handleBlur = () => {
    clearTimeout(timer.current); timer.current = null;
    if (ref.current) onSave(ref.current.value);
  };

  return (
    <textarea
      ref={ref}
      defaultValue={initialValue}
      placeholder={placeholder}
      onChange={handleChange}
      onBlur={handleBlur}
      style={{
        width:'100%', border:'none', background:'transparent', resize:'none',
        fontFamily:'var(--font)', fontSize:13, color:'var(--text)', outline:'none',
        minHeight:60, lineHeight:1.5, WebkitUserSelect:'text', userSelect:'text',
        ...style
      }}
    />
  );
}

function CommentBox({ initialValue, onSave, placeholder }) {
  const ref = useRef(null);
  const timer = useRef(null);
  useFlushOnUnmount(ref, timer, onSave);
  const handleChange = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; if(ref.current) onSave(ref.current.value); }, 400);
  };
  // Flush immediately when focus leaves — see StableTextarea for why.
  const handleBlur = () => {
    clearTimeout(timer.current); timer.current = null;
    if (ref.current) onSave(ref.current.value);
  };
  return (
    <textarea
      ref={ref}
      defaultValue={initialValue}
      placeholder={placeholder}
      onChange={handleChange}
      onBlur={handleBlur}
      rows={2}
      style={{
        resize:'vertical', border:'none', borderRadius:'var(--r-md)',
        padding:'8px 10px', fontFamily:'var(--font)', fontSize:13, width:'100%',
        color:'var(--text)', background:'#f9fafb', outline:'none',
        WebkitUserSelect:'text', userSelect:'text',
      }}
    />
  );
}

// "Hifdh Jadeed: Al-Mulk 1–15" / "Naazhirah: Ya-Sin 40" / "Qaa'idah: Lesson 12" — where a student is up to.
function quranUpTo(type, data) {
  const kind = { hifz: 'sabaq', nazira: 'reading', qaida: 'lesson' }[type];
  const last = (data?.entries || []).filter(e => e.kind === kind).sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!kind || !last) return '';
  if (kind === 'lesson') return `Qaa'idah: ${last.lesson}`;
  return kind === 'sabaq' ? `Hifdh Jadeed: ${rangeLabel(last)}` : `Naazhirah: ${upToLabel(last)}`;
}

function StudentList({ students, activeClass, classNames, setActiveClass, onSelect, attendance, allRecords, classTypes, quranAll }) {
  // Excludes anyone whose enrollDate is still in the future (hasn't started yet) and
  // anyone marked Inactive (has left) — a left student's history stays fully visible
  // via their card in the Students page's "students who have left" section instead.
  const classStudents = students.filter(s=>s.class===activeClass && s.status==='Active' && hasEnrolledBy(s, isoToday()));

  return (
    <div>
      <div className="class-tabs">
        {classNames.map(c=>(
          <button key={c} className={`class-tab ${activeClass===c?'active':''}`} onClick={()=>setActiveClass(c)}>{c}</button>
        ))}
      </div>
      <div className="grid-2">
        {classStudents.map(s=>{
          const counts=attendanceCountsFrom(attendance, s.id);
          const entryCount=Object.keys(allRecords[s.id]||{}).length;
          return (
            <div key={s.id} className="card" style={{cursor:'pointer',borderLeft:'3px solid var(--border-strong)',transition:'box-shadow 0.15s'}}
              onClick={()=>onSelect(s)}
              onMouseEnter={e=>e.currentTarget.style.boxShadow='var(--shadow-md)'}
              onMouseLeave={e=>e.currentTarget.style.boxShadow=''}>
              <div style={{marginBottom:12}}>
                <div style={{fontWeight:600,fontSize:14}}>{s.forename} {s.surname}</div>
                <div className="text-muted text-sm">{quranUpTo(effectiveQuranType(classTypes[s.class], quranAll[s.id]?.quranType), quranAll[s.id]) || s.class}</div>
              </div>
              {/* Neutral tile + colored corner dot — same language as the Fees week-pills
                  and Attendance mark buttons, rather than a solid-colored tile per stat. */}
              <div style={{display:'flex',gap:8,fontSize:12}}>
                <div style={{flex:1,background:'#f3f4f6',borderRadius:'var(--r-md)',padding:'8px 10px',textAlign:'center',position:'relative'}}>
                  <div style={{position:'absolute',top:7,right:7,width:7,height:7,borderRadius:'50%',background:'var(--green)'}}/>
                  <div style={{fontWeight:700,color:'var(--ink)',fontSize:16}}>{counts.present}</div>
                  <div style={{color:'var(--text-muted)',fontSize:11}}>Present</div>
                </div>
                <div style={{flex:1,background:'#f3f4f6',borderRadius:'var(--r-md)',padding:'8px 10px',textAlign:'center',position:'relative'}}>
                  <div style={{position:'absolute',top:7,right:7,width:7,height:7,borderRadius:'50%',background:'var(--amber)'}}/>
                  <div style={{fontWeight:700,color:'var(--ink)',fontSize:16}}>{counts.late}</div>
                  <div style={{color:'var(--text-muted)',fontSize:11}}>Late</div>
                </div>
                <div style={{flex:1,background:'#f3f4f6',borderRadius:'var(--r-md)',padding:'8px 10px',textAlign:'center',position:'relative'}}>
                  <div style={{position:'absolute',top:7,right:7,width:7,height:7,borderRadius:'50%',background:'var(--red)'}}/>
                  <div style={{fontWeight:700,color:'var(--ink)',fontSize:16}}>{counts.absent}</div>
                  <div style={{color:'var(--text-muted)',fontSize:11}}>Absent</div>
                </div>
              </div>
              <div style={{marginTop:10,fontSize:12,color:'var(--text-muted)',display:'flex',justifyContent:'space-between'}}>
                <span>{entryCount} {entryCount===1?'record':'records'}</span>
                <span style={{color:'var(--teal-dark)',fontWeight:500}}>View records →</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


function StudentRecords({ student, settings, classType, initialQuran, onQuranChanged, onBack, onRecordsChanged }) {
  // The AI monthly summary (and the report it feeds) is owner-only; teachers keep
  // the daily records themselves.
  const { isOwner } = useAuth();
  // Qur'an progress, when the student's class tracks it (hifz / nazira / qaida / mixed).
  // Their level is their own if set, else their class's.
  const hasQuran = !!classType;
  // Starts from what the student list already loaded, so the page opens with the right
  // level and cards straight away (no flash of the class default), then refreshes.
  const [quran, setQuran] = useState(initialQuran || null);
  const quranType = quran ? effectiveQuranType(classType, quran.quranType) : null;
  // Which tab is showing — remembered between students (and visits) on this device.
  const tabs = [hasQuran&&['quran',"Qur'an"],['day','Daily record'],isOwner&&['report','Report']].filter(Boolean);
  const [tabPick, setTabPick] = useState(()=>{ try { return localStorage.getItem('records_tab')||''; } catch { return ''; } });
  const tab = tabs.some(([k])=>k===tabPick) ? tabPick : tabs[0][0];
  function pickTab(k){ setTabPick(k); try { localStorage.setItem('records_tab',k); } catch { /* fine */ } }
  // Which previous summary is open (only its title shows otherwise).
  const [openSummary, setOpenSummary] = useState(null);
  const refreshQuran = useCallback(async () => {
    if (!hasQuran) return;
    try { const q = await getQuranProgress(student.id); setQuran(q); onQuranChanged?.(student.id, q); } catch { /* the rest of the page still works */ }
  }, [hasQuran, student.id, onQuranChanged]);
  useEffect(() => { refreshQuran(); }, [refreshQuran]);
  const [records, setRecords] = useState({});
  const [loadingRecords, setLoadingRecords] = useState(true);
  // Only the month/year grouping keys collapse — there's no per-day accordion any
  // more (see editDate below), so today's own date key never needs to be in here.
  // History: which academic year's months are showing, and which month's days are open
  // (in a pop-up card). Only the years show to begin with.
  const [openYear, setOpenYear] = useState(null);
  const [openMonth, setOpenMonth] = useState(null);
  const [openDay, setOpenDay] = useState(null); // a day's record shown inside the month card
  const [dayEditing, setDayEditing] = useState(false); // …and being changed there
  // Bumped after a day is changed in that card, so the editor above reloads its text.
  const [editorVersion, setEditorVersion] = useState(0);
  // The date currently loaded in the single "Edit day" card at the top of the page.
  // '' means idle — nothing is being edited, and the card shows a light, inert
  // placeholder rather than a live form. Editing only ever starts one of two ways:
  // picking a date here for a brand new day, or clicking an existing row below —
  // never by the editor just staying open on whatever was last touched.
  const [editDate, setEditDate] = useState('');
  // On first load, default straight into today only if today doesn't already have
  // a record — if it's already been added (this visit or an earlier one), that's
  // something you'd now open via its row below, same as any other day, rather than
  // the editor auto-loading it live.
  const editDateInitRef = useRef(false);
  useEffect(() => {
    if (loadingRecords || editDateInitRef.current) return;
    editDateInitRef.current = true;
    const today = isoToday();
    setEditDate(records[today] !== undefined ? '' : today);
  }, [loadingRecords, records]);
  // Reports are monthly (school month) or termly (Settings) — the summary below is
  // written for, and saved against, the current month or term.
  const termly = reportPeriodSetting() === 'termly';
  const [terms, setTerms] = useState([]);
  const [termsLoaded, setTermsLoaded] = useState(!termly);
  useEffect(() => {
    if (!termly) return;
    getTerms().then(setTerms).catch(() => {}).finally(() => setTermsLoaded(true));
  }, [termly]);
  const period = currentReportPeriod(terms);
  // A school month runs from its first Monday to the next month's (so 2 Oct can still be
  // September's), and a term between its dates — both carry start / endExclusive.
  const inPeriod = d => !!period && d >= period.start && d < period.endExclusive;
  const unitWord = termly ? 'term' : 'month';
  const termlyNoTerms = termly && termsLoaded && !period;
  const [aiSummary, setAiSummary] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiInstructions, setAiInstructions] = useState('');
  const [previousSummaries, setPreviousSummaries] = useState([]);
  const [savingSummary, setSavingSummary] = useState(false);
  const [behavior, setBehavior] = useState('');
  const [savingBehavior, setSavingBehavior] = useState('');
  const [summaryFit, setSummaryFit] = useState(null);

  useEffect(() => {
    if (!aiSummary) { setSummaryFit(null); return; }
    let cancelled = false;
    checkSummaryFit(aiSummary).then(res => { if (!cancelled) setSummaryFit(res); });
    return () => { cancelled = true; };
  }, [aiSummary]);
  const [confirmDel, setConfirmDel] = useState(null);
  const [toast, setToast] = useState('');

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''),2000); }
  const refresh = useCallback(async () => {
    try { setRecords(await getStudentRecords(student.id)); }
    catch (err) { showToast(err.message || 'Could not load records'); }
  }, [student.id]);

  // Deliberately doesn't restore the current month's saved summary/instructions/
  // behaviour into the compose box — once "Add to report" is clicked those are
  // saved to the DB and cleared locally (see addToReport), and should stay
  // cleared even after leaving and returning to this page. Nothing is ever
  // saved to the DB before that point, so there's no unsaved work to restore.
  // The saved result is still visible, read-only, in "Previous summaries" below.
  const refreshSummaries = useCallback(async () => {
    if (!isOwner) return;
    try {
      const all = await getAiSummaries(student.id);
      setPreviousSummaries(all);
    } catch { /* saved summaries are a bonus, not required to use the page */ }
  }, [student.id, isOwner]);

  useEffect(() => {
    setLoadingRecords(true);
    refresh().finally(() => setLoadingRecords(false));
    refreshSummaries();
  }, [refresh, refreshSummaries]);

  // Stable field save — doesn't cause re-render of the textarea
  const saveField = useCallback((date, field, value) => {
    // Refreshing here is safe (unlike naively doing it on every keystroke): this only
    // ever fires from a debounce timeout or blur, i.e. once typing has settled, and
    // the field being saved is keyed by date so React reuses the same DOM node rather
    // than remounting it — no risk of losing focus or clobbering what's being typed.
    // It matters because the "Done" tinted summary reads straight from `records`, so
    // that state has to actually reflect what was just saved.
    const done = saveDailyRecord(student.id, date, {[field]:value})
      .then(refresh)
      .catch(err => showToast(err.message || 'Could not save'));
    lastSave.current = done;
    return done;
  }, [student.id, refresh]);
  // The latest save, so leaving the day card's Edit can wait for it before the editor
  // above reloads that day's text.
  const lastSave = useRef(Promise.resolve());
  async function finishCardEdit() {
    document.activeElement?.blur?.(); // flushes the box being typed in (starts its save)
    setDayEditing(false);
    await lastSave.current;
    setEditorVersion(v => v + 1);
  }

  function getEntry(date) { return records[date]||{comment:'',positive:'',negative:''}; }


  async function addDay() {
    if (!editDate || records[editDate]) return;
    try {
      await saveDailyRecord(student.id, editDate, {comment:'',positive:'',negative:''});
      await refresh();
      showToast(`Entry added for ${fmtDate(editDate)}`);
      // Refresh the "N records" count on the student list right away, on the actual
      // action that changes it — not only when the user happens to navigate back to
      // that list, which depended on going through one particular back button/gesture
      // and evidently wasn't reliably catching every path back to it.
      onRecordsChanged?.();
    } catch (err) {
      showToast(err.message || 'Could not add entry');
    }
  }

  async function doDelete(date) {
    try {
      await deleteDailyRecord(student.id, date);
      await refresh();
      setConfirmDel(null);
      showToast('Record deleted');
      onRecordsChanged?.();
    } catch (err) {
      showToast(err.message || 'Could not delete record');
    }
  }

  async function summarise() {
    setAiLoading(true); setAiSummary('');
    try {
      // Fetch fresh rather than using local `records` — that state deliberately
      // isn't refreshed after every keystroke (to avoid losing textarea focus),
      // so it can be stale right after adding or editing an entry.
      if (!period) { setAiSummary('Add your term dates in Settings → Terms first.'); setAiLoading(false); return; }
      const freshRecords = await getStudentRecords(student.id);
      const monthDates=Object.keys(freshRecords).filter(inPeriod).sort((a,b)=>b.localeCompare(a));
      if (!monthDates.length && !hasQuran) {
        setAiSummary(`No records found for this ${unitWord}. Add some daily entries first.`);
        setAiLoading(false);
        return;
      }
      const entries=monthDates.map(d=>{
        const e=freshRecords[d]||{};
        return `${fmtDate(d)}:\n  Comment: ${e.comment||'None'}\n  Positives: ${e.positive||'None'}\n  Concerns: ${e.negative||'None'}`;
      }).join('\n\n');
      // Monthly: this year's attendance so far (as before). Termly: the term's own.
      const year = termly ? period.yearLabel : await currentSchoolYear();
      const attendanceForYear = await getAttendance(year);
      const counts = termly ? attendanceCountsForMonth(attendanceForYear, student.id, period) : attendanceCountsFrom(attendanceForYear, student.id);
      // Qur'an progress for the period, as exact figures the summary can quote.
      const quranFacts = quranType ? quranFactsForReport(quranType, await getQuranProgress(student.id).catch(() => null), period) : '';
      const prompt=`You are a helpful Madrasah assistant. Below are the daily records for ${student.forename} ${student.surname} at ${settings.schoolName} for ${period.label}.\n\nAttendance ${termly ? 'this term' : 'this year'}: ${counts.present} present, ${counts.late} late, ${counts.absent} absent.${quranFacts ? `\n\n${quranFacts}` : ''}\n\n${entries}\n\nWrite a warm, professional ${termly ? 'end-of-term' : 'monthly'} progress summary for this student suitable for their report. Cover: overall attitude and behaviour, ${quranFacts ? "their Qur'an progress (quote the figures above accurately), " : ''}key positives, any recurring concerns, and a brief recommendation. Keep it under 1000 characters (including spaces) so it fits the report's summary box — this is a hard limit, not a target to aim near. Plain prose in paragraph form only. Do not use bullet points, headings, titles, or any Markdown formatting — output plain text only.${aiInstructions?`\n\nThe teacher has given these additional instructions for this summary — follow them: ${aiInstructions}`:''}`;
      const res = await fetch('/api/ai-summary', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ prompt })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'API error');
      setAiSummary(data.summary || 'Unable to generate summary.');
    } catch (err) {
      setAiSummary(err.message || 'Could not generate a summary. Please try again.');
    }
    setAiLoading(false);
  }

  async function setBehaviorRating(val) {
    const next = behavior === val ? '' : val; // click again to clear
    setBehavior(next); setSavingBehavior(val);
    try {
      await saveAiSummary(student.id, period.key, { summary: aiSummary, instructions: aiInstructions, behavior: next });
    } catch (err) {
      showToast(err.message || 'Could not save behaviour rating');
      setBehavior(behavior); // revert on failure
    }
    setSavingBehavior('');
  }

  async function addToReport() {
    setSavingSummary(true);
    try {
      await saveAiSummary(student.id, period.key, { summary: aiSummary, instructions: aiInstructions, behavior });
      // Cleared rather than reloaded from what was just saved — once pushed,
      // this compose area is ready for the next report rather than sitting
      // there showing what was already submitted.
      setAiSummary(''); setAiInstructions(''); setBehavior('');
      showToast('Added to report');
    } catch (err) {
      showToast(err.message || 'Could not save summary');
    }
    setSavingSummary(false);
  }

  const dates = Object.keys(records).sort((a,b)=>a.localeCompare(b));
  const editEntry = getEntry(editDate);
  const editExists = editDate!==''&&records[editDate]!==undefined;
  const editIsToday = editDate!==''&&editDate===isoToday();

  // Academic year > month, each newest-first; days stay oldest-first within a month.
  // Month here is the school month (from its first Monday), not the date's calendar month.
  const byYear = {};
  dates.forEach(d => {
    const monthKey = getCurrentSchoolMonth(d).start.slice(0,7);
    const yr = academicYearOfMonth(monthKey);
    (byYear[yr] = byYear[yr] || {});
    (byYear[yr][monthKey] = byYear[yr][monthKey] || []).push(d);
  });
  const years = Object.keys(byYear).sort().reverse();

  // History boxes — the same box style as the rest of the app.
  const histBox = (on) => ({
    border: `1px solid ${on ? 'var(--ink)' : '#dfe3e8'}`, background: on ? 'var(--ink)' : '#f3f4f6', color: on ? '#fff' : 'var(--ink)',
    borderRadius: 8, padding: '7px 4px', minHeight: 46, cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'center',
    display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minWidth: 0,
  });
  const boxSub = { fontSize: 10.5, fontWeight: 500, opacity: 0.8, marginTop: 1 };

  if (loadingRecords) return <LoadingState />;

  return (
    <div className="student-page">
      <div className="flex items-center gap-3" style={{marginBottom:20}}>
        <button className="btn btn-sm" onClick={onBack}><ArrowLeft size={14}/> All students</button>
        <div>
          <div style={{fontWeight:600,fontSize:16}}>{student.forename} {student.surname}</div>
          <div className="text-muted text-sm">{student.class}</div>
        </div>
      </div>

      {/* One thing at a time: Qur'an | Daily record | Report (heads only), each a
          single roomy column. */}
      {tabs.length>1&&(
        <div className="student-tabs" role="tablist">
          {tabs.map(([k,label])=>(
            <button key={k} type="button" role="tab" aria-selected={tab===k} className={tab===k?'active':''} onClick={()=>pickTab(k)}>{label}</button>
          ))}
        </div>
      )}
      <div className="student-tab">
        {tab==='quran'&&(<>
          <QuranEntryCard student={student} type={quranType} classType={classType} data={quran} onChanged={refreshQuran} />
          {quranType && <QuranProgressCard student={student} type={quranType} data={quran} onChanged={refreshQuran} canEditPrior canEdit />}
        </>)}
        {tab==='day'&&(<>
          {/* The one, fixed-position editor — every day, new or existing, is added and
              edited here rather than inline in the list below, so the list can stay a
              plain, calm, scannable history. Tapping a day in it (Records → month) just loads
              that date into this same card. */}
          <div className="card">
            <div className="flex items-center gap-2" style={{marginBottom:12}}>
              <div className="card-title" style={{marginBottom:0,flex:1}}>{editExists?'Edit day':'Add day'}</div>
              {editIsToday&&<span className="badge badge-teal">Today</span>}
            </div>
            <div className="flex items-center gap-2" style={{marginBottom:14}}>
              <input type="date" value={editDate} onChange={e=>setEditDate(e.target.value)}
                style={{flex:1,padding:'8px 14px',border:'1px solid var(--border)',borderRadius:'var(--r-md)',fontFamily:'var(--font)',fontSize:13}}/>
              {!editExists&&<button className="btn btn-primary" onClick={addDay} disabled={!editDate}><Plus size={14}/> Add day</button>}
              {editExists&&(
                <button className="btn btn-icon btn-sm" style={{color:'var(--red)'}}
                  title="Delete this day" onClick={()=>setConfirmDel(editDate)}><Trash2 size={13}/></button>
              )}
            </div>

            {editExists?(
              <>
                <div className="form-group" style={{marginBottom:10}}>
                  <label>Daily comment</label>
                  <CommentBox
                    key={`${editDate}-comment-${editorVersion}`}
                    initialValue={editEntry.comment}
                    onSave={val=>saveField(editDate,'comment',val)}
                    placeholder="General note for this day…"
                  />
                </div>
                <div className="record-panels">
                  <div className="record-panel record-panel-pos">
                    <div className="record-panel-label">⭐ Positives</div>
                    <StableTextarea
                      key={`${editDate}-positive-${editorVersion}`}
                      initialValue={editEntry.positive}
                      onSave={val=>saveField(editDate,'positive',val)}
                      placeholder="What went well?"
                    />
                  </div>
                  <div className="record-panel record-panel-neg">
                    <div className="record-panel-label">⚑ Concerns</div>
                    <StableTextarea
                      key={`${editDate}-negative-${editorVersion}`}
                      initialValue={editEntry.negative}
                      onSave={val=>saveField(editDate,'negative',val)}
                      placeholder="Any concerns?"
                    />
                  </div>
                </div>
                <button className="btn btn-sm" style={{width:'100%',justifyContent:'center',marginTop:12}}
                  onClick={()=>setEditDate('')}><Check size={13}/>Done</button>
              </>
            ):(
              // Idle template — greyed out on purpose. This is the resting state
              // whenever nothing is actively being edited: on first load if today
              // hasn't been added yet, and again after "Done" on any entry. Editing
              // only ever starts by picking a date here or clicking a row below.
              <div style={{opacity:0.55}}>
                <div className="form-group" style={{marginBottom:10}}>
                  <label>Daily comment</label>
                  <div style={{border:'1px dashed var(--border)',borderRadius:'var(--r-md)',padding:'8px 10px',fontSize:13,color:'var(--text-soft)',minHeight:44}}>General note for the day…</div>
                </div>
                <div className="record-panels">
                  <div className="record-panel record-panel-pos">
                    <div className="record-panel-label">⭐ Positives</div>
                    <div style={{fontSize:13,color:'var(--text-soft)',minHeight:60}}>What went well?</div>
                  </div>
                  <div className="record-panel record-panel-neg">
                    <div className="record-panel-label">⚑ Concerns</div>
                    <div style={{fontSize:13,color:'var(--text-soft)',minHeight:60}}>Any concerns?</div>
                  </div>
                </div>
                <div style={{textAlign:'center',marginTop:12,fontSize:12,color:'var(--text-soft)'}}>Pick a date above to start a new entry, or click a day below to edit it</div>
              </div>
            )}
          </div>
          {/* History: academic years as boxes → tap one for its months → tap a month for a
              card of its days → tap a day to read that day's record in the same card. */}
          <div className="card">
            <div className="card-title" style={{marginBottom:10}}>Records</div>
            {dates.length===0&&(
              <div style={{textAlign:'center',padding:'12px 0',color:'var(--text-muted)',fontSize:13}}>No records yet. Use the form above to add one.</div>
            )}
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(110px, 1fr))',gap:6}}>
              {years.map(yr=>{
                const n = Object.values(byYear[yr]).reduce((t,d)=>t+d.length,0);
                return (
                  <button key={yr} type="button" aria-expanded={openYear===yr} onClick={()=>setOpenYear(o=>o===yr?null:yr)} style={histBox(openYear===yr)}>
                    <span style={{fontWeight:700,fontSize:13,display:'flex',alignItems:'center',gap:3}}>
                      {openYear===yr?<ChevronUp size={13}/>:<ChevronDown size={13}/>}{yr}
                    </span>
                    <span style={boxSub}>{n} day{n===1?'':'s'}</span>
                  </button>
                );
              })}
            </div>
            {openYear&&byYear[openYear]&&(
              <div style={{display:'grid',gridTemplateColumns:'repeat(4, minmax(0, 1fr))',gap:6,marginTop:8,paddingTop:8,borderTop:'1px dashed #d5dae0'}}>
                {Object.keys(byYear[openYear]).sort().map(monthKey=>{
                  const n = byYear[openYear][monthKey].length;
                  const d = new Date(monthKey+'-15T12:00:00');
                  return (
                    <button key={monthKey} type="button" onClick={()=>{ setOpenDay(null); setOpenMonth(monthKey); }} style={{...histBox(false),background:'#fafbfc',minHeight:42}}>
                      <span style={{fontWeight:600,fontSize:12.5}}>{d.toLocaleDateString('en-GB',{month:'short'})}</span>
                      <span style={boxSub}>{n} day{n===1?'':'s'}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* A month's days as boxes; tap one to read its record here. */}
          {openMonth&&(()=>{
            const yr = academicYearOfMonth(openMonth);
            const days = [...(byYear[yr]?.[openMonth]||[])].sort();
            return (
              <div className="modal-overlay" onClick={e=>{ if (e.target===e.currentTarget) { finishCardEdit(); setOpenMonth(null); setOpenDay(null); } }}>
                <div className="modal" style={{maxWidth:480}}>
                  <div className="modal-header">
                    <div>
                      <div className="modal-title">{openDay ? fmtDate(openDay) : monthLabelFor(openMonth)}</div>
                      <div style={{fontSize:12,color:'var(--text-muted)'}}>{student.forename} · {openDay ? monthLabelFor(openMonth) : `${days.length} day${days.length===1?'':'s'} recorded — tap one to read it`}</div>
                    </div>
                    <button className="btn btn-icon" onClick={()=>{ finishCardEdit(); setOpenMonth(null); setOpenDay(null); }}><X size={16}/></button>
                  </div>
                  <div className="modal-body">
                    {openDay ? (()=>{
                      const r = records[openDay]||{};
                      const part = (label, text, bg, color) => (
                        <div style={{background:bg,borderRadius:8,padding:'10px 12px',marginBottom:8}}>
                          <div style={{fontSize:10.5,fontWeight:700,letterSpacing:'.04em',textTransform:'uppercase',color,marginBottom:4}}>{label}</div>
                          <div style={{fontSize:13,lineHeight:1.5,whiteSpace:'pre-wrap',color:text?'var(--ink)':'var(--text-soft)'}}>{text||'—'}</div>
                        </div>
                      );
                      const back = (
                        <button className="btn" style={{flex:1,justifyContent:'center'}} onClick={()=>{ finishCardEdit(); setOpenDay(null); }}>
                          <ArrowLeft size={13}/> Back to {new Date(openMonth+'-15T12:00:00').toLocaleDateString('en-GB',{month:'long'})}
                        </button>
                      );
                      // Edit: the same boxes as the day editor, saving as you type.
                      if (dayEditing) return (
                        <>
                          <div className="form-group" style={{marginBottom:10}}>
                            <label>Daily comment</label>
                            <CommentBox key={`${openDay}-comment-card`} initialValue={r.comment||''}
                              onSave={val=>saveField(openDay,'comment',val)} placeholder="General note for this day…"/>
                          </div>
                          <div className="record-panels">
                            <div className="record-panel record-panel-pos">
                              <div className="record-panel-label">⭐ Positives</div>
                              <StableTextarea key={`${openDay}-positive-card`} initialValue={r.positive||''}
                                onSave={val=>saveField(openDay,'positive',val)} placeholder="What went well?"/>
                            </div>
                            <div className="record-panel record-panel-neg">
                              <div className="record-panel-label">⚑ Concerns</div>
                              <StableTextarea key={`${openDay}-negative-card`} initialValue={r.negative||''}
                                onSave={val=>saveField(openDay,'negative',val)} placeholder="Any concerns?"/>
                            </div>
                          </div>
                          <div style={{display:'flex',gap:8,marginTop:12}}>
                            {back}
                            <button className="btn btn-primary" style={{flex:1,justifyContent:'center'}} onClick={()=>{ finishCardEdit(); }}>
                              <Check size={13}/> Done
                            </button>
                          </div>
                        </>
                      );
                      return (
                        <>
                          {part('Daily comment', r.comment, '#f3f4f6', 'var(--text-muted)')}
                          {part('⭐ Positives', r.positive, 'var(--green-light)', 'var(--green-text)')}
                          {part('⚑ Concerns', r.negative, 'var(--red-light)', 'var(--red-text)')}
                          <div style={{display:'flex',gap:8,marginTop:4}}>
                            {back}
                            <button className="btn btn-primary" style={{flex:1,justifyContent:'center'}} onClick={()=>setDayEditing(true)}>
                              <Pencil size={13}/> Edit
                            </button>
                          </div>
                        </>
                      );
                    })() : (<>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(76px, 1fr))',gap:6}}>
                      {days.map(date=>{
                        const r = records[date]||{};
                        const dt = new Date(date+'T12:00:00');
                        const isToday = date===isoToday();
                        return (
                          <button key={date} type="button" onClick={()=>{ setDayEditing(false); setOpenDay(date); }}
                            style={{...histBox(false), minHeight:58, boxShadow:isToday?'0 0 0 2px var(--blue)':'none'}}>
                            <span style={{fontSize:10.5,fontWeight:600,opacity:.75,textTransform:'uppercase'}}>{dt.toLocaleDateString('en-GB',{weekday:'short'})}</span>
                            <span style={{fontWeight:700,fontSize:14}}>{dt.toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</span>
                            <span style={{display:'flex',gap:3,marginTop:3,height:6}}>
                              {r.comment&&<span title="Comment" style={{width:6,height:6,borderRadius:'50%',background:'var(--text-soft)'}}/>}
                              {r.positive&&<span title="Positives" style={{width:6,height:6,borderRadius:'50%',background:'var(--green)'}}/>}
                              {r.negative&&<span title="Concerns" style={{width:6,height:6,borderRadius:'50%',background:'var(--red)'}}/>}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <div style={{display:'flex',gap:12,marginTop:12,fontSize:11.5,color:'var(--text-muted)',flexWrap:'wrap'}}>
                      <span><span style={{display:'inline-block',width:6,height:6,borderRadius:'50%',background:'var(--text-soft)',marginRight:4}}/>Comment</span>
                      <span><span style={{display:'inline-block',width:6,height:6,borderRadius:'50%',background:'var(--green)',marginRight:4}}/>Positives</span>
                      <span><span style={{display:'inline-block',width:6,height:6,borderRadius:'50%',background:'var(--red)',marginRight:4}}/>Concerns</span>
                    </div>
                    </>)}
                  </div>
                </div>
              </div>
            );
          })()}
          <div className="card">
            <div className="card-title" style={{marginBottom:12}}>This {unitWord}</div>
            {(()=>{
              const md=Object.keys(records).filter(inPeriod);
              return [['Days recorded',md.length,undefined],['With comments',md.filter(d=>records[d]?.comment).length,'var(--ink)'],['With positives',md.filter(d=>records[d]?.positive).length,'var(--green)'],['With concerns',md.filter(d=>records[d]?.negative).length,'var(--red)']].map(([l,v,col])=>(
                <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid var(--border)',fontSize:13}}>
                  <span className="text-muted">{l}</span><span style={{fontWeight:600,color:col||'var(--text)'}}>{v}</span>
                </div>
              ));
            })()}
          </div>
        </>)}
        {tab==='report'&&(<>
          <div className="card">
            <div className="card-title" style={{marginBottom:4}}>{termly ? 'Term summary' : 'Monthly summary'}</div>
            <div className="card-sub" style={{marginBottom:14}}>
              {period ? <>AI report paragraph for {student.forename} — {period.label}</> : (termlyNoTerms ? 'Add your term dates in Settings → Terms to write termly reports.' : 'Loading…')}
            </div>
            {period && (<>

            <div className="form-group" style={{marginBottom:14}}>
              <label>Class behaviour (for report)</label>
              <div className="flex gap-2" style={{marginTop:4,flexWrap:'wrap'}}>
                {['Excellent','Good','Fair','Poor'].map(opt=>{
                  const active = behavior===opt;
                  return (
                    <button key={opt} type="button" className="btn btn-sm" onClick={()=>setBehaviorRating(opt)}
                      disabled={!!savingBehavior}
                      style={{flex:'1 1 80px',minWidth:0,justifyContent:'center',background:active?'var(--ink)':undefined,color:active?'#fff':undefined,borderColor:active?'var(--ink)':undefined}}>
                      {savingBehavior===opt?'…':opt}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="form-group" style={{marginBottom:12}}>
              <label>Instructions for the AI (optional)</label>
              <textarea
                value={aiInstructions}
                onChange={e=>setAiInstructions(e.target.value)}
                placeholder="e.g. focus on his Qur'an memorisation progress, keep it brief…"
                rows={2}
                style={{width:'100%',border:'1px solid var(--border)',borderRadius:'var(--r-md)',padding:'8px 10px',fontFamily:'var(--font)',fontSize:13,resize:'vertical'}}
              />
            </div>

            <button className="btn btn-ai" style={{width:'100%',justifyContent:'center',padding:'10px',marginBottom:14}} onClick={summarise} disabled={aiLoading}>
              <Sparkles size={15}/>{aiLoading?'Generating…':(aiSummary?'Regenerate summary ↗':`Summarise this ${unitWord} ↗`)}
            </button>
            {aiLoading&&<div className="ai-summary-box"><div style={{color:'var(--teal-dark)',fontStyle:'italic',fontSize:13}}>Reading through {student.forename}'s records…</div></div>}
            {aiSummary&&!aiLoading&&(
              <div className="ai-summary-box">
                <div className="ai-summary-title"><Sparkles size={13}/>Summary — {period.label}</div>
                <textarea
                  className="ai-summary-text"
                  value={aiSummary}
                  onChange={e=>setAiSummary(e.target.value)}
                  rows={8}
                  style={{width:'100%',border:'none',background:'transparent',resize:'vertical',outline:'none',padding:0,fontFamily:'inherit',fontSize:'inherit',lineHeight:'inherit',color:'inherit'}}
                />
                {summaryFit&&(
                  <div style={{fontSize:11,marginTop:6,color:summaryFit.fits?'var(--text-muted)':'var(--red)'}}>
                    {summaryFit.fits
                      ? `Fits the report's summary box (${summaryFit.lines}/${summaryFit.maxLines} lines)`
                      : `Won't fit the summary box — ${summaryFit.overflowLines} line${summaryFit.overflowLines===1?'':'s'} will spill onto a second page`}
                  </div>
                )}
                <button className="btn btn-primary btn-sm" style={{width:'100%',justifyContent:'center',marginTop:10}} onClick={addToReport} disabled={savingSummary}>
                  {savingSummary?'Saving…':'Add to report'}
                </button>
              </div>
            )}
            {!aiSummary&&!aiLoading&&(
              <div style={{textAlign:'center',padding:'16px 0',color:'var(--text-muted)',fontSize:13}}>
                <Sparkles size={24} style={{opacity:.2,marginBottom:8,display:'block',margin:'0 auto 8px'}}/>
                Add daily records then click above to generate a summary for {student.forename}.
              </div>
            )}
            </>)}
          </div>
          {previousSummaries.length>0&&(
            <div className="card">
              <div className="card-title" style={{marginBottom:8}}>Previous summaries</div>
              {/* Just the month/term each was written for — tap one to read it. */}
              {previousSummaries.map(s=>{
                const open = openSummary===s.month;
                return (
                  <div key={s.month} style={{borderTop:'1px solid var(--border)'}}>
                    <button type="button" onClick={()=>setOpenSummary(open?null:s.month)} aria-expanded={open}
                      style={{display:'flex',alignItems:'center',gap:6,width:'100%',background:'none',border:'none',padding:'9px 0',cursor:'pointer',fontFamily:'var(--font)',fontWeight:600,fontSize:13,color:'var(--ink)',textAlign:'left'}}>
                      {open?<ChevronUp size={14}/>:<ChevronDown size={14}/>}
                      <span style={{flex:1}}>{periodForKey(s.month, terms).label}</span>
                      {s.behavior&&<span className="text-muted" style={{fontWeight:500,fontSize:12}}>{s.behavior}</span>}
                    </button>
                    {open&&<div style={{fontSize:12.5,color:'var(--text-muted)',lineHeight:1.6,whiteSpace:'pre-wrap',padding:'0 0 12px 20px'}}>{s.summary}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </>)}
      </div>

      {confirmDel&&(
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setConfirmDel(null)}>
          <div className="modal" style={{maxWidth:400}}>
            <div className="modal-body" style={{textAlign:'center',paddingTop:28}}>
              <div style={{width:52,height:52,borderRadius:'50%',background:'var(--red-light)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px'}}><Trash2 size={24} color="var(--red)"/></div>
              <div style={{fontSize:16,fontWeight:600,marginBottom:6}}>Delete this record?</div>
              <div style={{color:'var(--text-muted)',fontSize:13}}>{fmtDate(confirmDel)}<br/><span style={{fontSize:12}}>This cannot be undone.</span></div>
            </div>
            <div className="modal-footer" style={{justifyContent:'center'}}>
              <button className="btn" onClick={()=>setConfirmDel(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={()=>doDelete(confirmDel)}><Trash2 size={13}/>Delete</button>
            </div>
          </div>
        </div>
      )}
      {toast&&<div className="toast">✓ {toast}</div>}
    </div>
  );
}

export default function DailyRecords() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [students, setStudents] = useState([]);
  const [classNames, setClassNames] = useState([]);
  const [settings, setSettings] = useState(null);
  const [attendance, setAttendance] = useState({});
  const [allRecords, setAllRecords] = useState({});
  const [classTypes, setClassTypes] = useState({}); // class name → 'hifz' | 'nazira' | 'qaida'
  const [quranAll, setQuranAll] = useState({});     // studentId → { entries, priorJuz, quranType }
  const [quranAllLoaded, setQuranAllLoaded] = useState(false);
  // Keeps the list's copy current after changes made on a student's page.
  const updateQuranFor = useCallback((id, q) => setQuranAll(prev => ({ ...prev, [id]: q })), []);
  const [activeClass, setActiveClass] = useState('');
  const [selectedStudent, setSelectedStudent] = useState(null);
  // Opening a student's records used to leave the list scrolled back to the top on
  // return, no matter how far down it was when you clicked in — DailyRecords itself
  // never unmounts across that toggle, so the scroll position is just saved here and
  // restored once the list is back, rather than relying on the browser to remember it.
  const listScrollRef = useRef(0);
  function openStudent(s) {
    const mc = document.querySelector('.main-content');
    if (mc) listScrollRef.current = mc.scrollTop;
    setSelectedStudent(s);
  }
  useLayoutEffect(() => {
    if (selectedStudent) return;
    const mc = document.querySelector('.main-content');
    if (mc) mc.scrollTop = listScrollRef.current;
  }, [selectedStudent]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const year = await currentSchoolYear();
      const [studentsData, classesData, settingsData, attendanceData, recordsData] = await Promise.all([
        getStudents(), getClasses(), getSettings(), getAttendance(year), getDailyRecords(),
      ]);
      const classNamesData = classesData.map(c => c.name);
      const types = Object.fromEntries(classesData.filter(c => c.quranType).map(c => [c.name, c.quranType]));
      setStudents(studentsData); setClassNames(classNamesData); setSettings(settingsData);
      setAttendance(attendanceData); setAllRecords(recordsData); setClassTypes(types);
      // Qur'an progress only matters when some class tracks it; never blocks the page.
      if (Object.keys(types).length) getQuranProgress().then(q => { setQuranAll(q); setQuranAllLoaded(true); }).catch(() => {});
      setActiveClass(prev => prev && classNamesData.includes(prev) ? prev : (classNamesData[0] || ''));
      // ?student=<id> (from Reports' "Not written") opens that child straight away.
      const linked = new URLSearchParams(window.location.search).get('student');
      const s = linked && studentsData.find(x => x.id === linked);
      if (linked) window.history.replaceState(window.history.state, '', window.location.pathname);
      if (s) { setActiveClass(s.class); setSelectedStudent(s); }
    } catch (err) {
      setError(err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  // allRecords is only used here for each student card's "N records" count — it's
  // fetched once on load and StudentRecords keeps its own separate copy that it
  // refreshes itself, so writing a record there never touched this one. Refreshed
  // both the moment a record is actually added/deleted (via onRecordsChanged, passed
  // down to StudentRecords) and again as a fallback whenever the student view closes
  // — relying on the close path alone missed some route back to the list.
  const refreshCounts = useCallback(() => {
    getDailyRecords().then(setAllRecords).catch(() => {/* stale counts are a minor cosmetic issue, not worth surfacing an error for */});
    if (Object.keys(classTypes).length) getQuranProgress().then(q => { setQuranAll(q); setQuranAllLoaded(true); }).catch(() => {});
  }, [classTypes]);
  const closeStudent = useBackToClose(!!selectedStudent, () => {
    setSelectedStudent(null);
    refreshCounts();
  });

  if (loading) return <Layout title="Daily records"><LoadingState /></Layout>;
  if (error) return <Layout title="Daily records"><ErrorState error={error} onRetry={load} /></Layout>;

  return (
    <Layout title={selectedStudent?`${selectedStudent.forename} ${selectedStudent.surname}`:'Daily records'} subtitle={selectedStudent?'Daily comments, positives & concerns':'Select a student to view or add records'}>
      {selectedStudent
        ?<StudentRecords student={selectedStudent} settings={settings} classType={classTypes[selectedStudent.class]}
          initialQuran={quranAll[selectedStudent.id] || (quranAllLoaded ? { entries: [], priorJuz: [], quranType: null } : null)} onQuranChanged={updateQuranFor}
          onBack={closeStudent} onRecordsChanged={refreshCounts}/>
        :<StudentList students={students} activeClass={activeClass} classNames={classNames} setActiveClass={setActiveClass} onSelect={openStudent} attendance={attendance} allRecords={allRecords} classTypes={classTypes} quranAll={quranAll}/>
      }
    </Layout>
  );
}
