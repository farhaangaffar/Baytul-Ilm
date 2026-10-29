import React, { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { HealthNote, HealthDot } from '../components/StudentDetails';
import Layout from '../components/Layout';
import ClassBar from '../components/ClassBar';
import { LoadingState, ErrorState } from '../components/DataState';
import { QuranEntryCard, QuranProgressCard } from '../components/QuranCards';
import { rangeLabel, upToLabel, effectiveQuranType } from '../lib/quran';
import { getClasses, getQuranProgress, getStudents, getSettings, getStudentRecords, getDailyRecords, saveDailyRecord, deleteDailyRecord, getStudentHomework, saveHomework, deleteHomework, attendanceCountsFrom, getAttendance, currentSchoolYear, formatDateGB, academicYearOfMonth, hasEnrolledBy, getCurrentSchoolMonth } from '../lib/store';
import { useBackToClose } from '../lib/useBackToClose';
import { Plus, ArrowLeft, Trash2, Check, X, Pencil } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import StudentExams from '../components/StudentExams';
import { YearBox } from '../components/HistoryBoxes';

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
  const { isDarulUloom } = useAuth();
  // Excludes anyone whose enrollDate is still in the future (hasn't started yet) and
  // anyone marked Inactive (has left) — a left student's history stays fully visible
  // via their card in the Students page's "students who have left" section instead.
  const classStudents = students.filter(s=>s.class===activeClass && s.status==='Active' && hasEnrolledBy(s, isoToday()));

  return (
    <div>
      <ClassBar classes={classNames} active={activeClass} onPick={setActiveClass} pills={['class-tabs', 'class-tab']}
        notes={Object.fromEntries(classNames.map(c => { const n = students.filter(s => s.class === c && s.status === 'Active').length; return [c, `${n} ${n === 1 ? 'student' : 'students'}`]; }))} />
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
                <div style={{fontWeight:600,fontSize:14}}>{s.forename} {s.surname}<HealthDot student={s}/></div>
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
      {classStudents.length === 0 && (
        <div className="card text-muted text-sm" style={{ textAlign: 'center', padding: 28 }}>
          {activeClass ? `No children in ${activeClass} yet — add them on the Students page.` : `No classes yet — add one on ${isDarulUloom ? 'Classes & Staff' : 'Classes & Teachers'}.`}
        </div>
      )}
    </div>
  );
}


function StudentRecords({ student, settings, classType, initialQuran, onQuranChanged, onBack, onRecordsChanged }) {
  // The AI monthly summary (and the report it feeds) is owner-only; teachers keep
  // the daily records themselves.
  const { isOwner, isDarulUloom } = useAuth();
  // Qur'aan progress, when the student's class tracks it (hifz / nazira / qaida / mixed).
  // Their level is their own if set, else their class's.
  const hasQuran = !!classType;
  // Starts from what the student list already loaded, so the page opens with the right
  // level and cards straight away (no flash of the class default), then refreshes.
  const [quran, setQuran] = useState(initialQuran || null);
  const quranType = quran ? effectiveQuranType(classType, quran.quranType) : null;
  // Which tab is showing — remembered between students (and visits) on this device.
  // A maktab writes its monthly/termly/yearly summary on the Reports page now; a Darul
  // Uloom's "Report" tab is its exam report cards (StudentExams), unchanged.
  const tabs = [hasQuran&&['quran',"Qur'aan"],['homework','Homework'],['day','Behaviour'],isOwner&&isDarulUloom&&['report','Report']].filter(Boolean);
  const [tabPick, setTabPick] = useState(()=>{ try { return localStorage.getItem('records_tab')||''; } catch { return ''; } });
  const tab = tabs.some(([k])=>k===tabPick) ? tabPick : tabs[0][0];
  function pickTab(k){ setTabPick(k); try { localStorage.setItem('records_tab',k); } catch { /* fine */ } }
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
  const [confirmDel, setConfirmDel] = useState(null);
  const [toast, setToast] = useState('');

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''),2000); }
  const refresh = useCallback(async () => {
    try { setRecords(await getStudentRecords(student.id)); }
    catch (err) { showToast(err.message || 'Could not load records'); }
  }, [student.id]);

  useEffect(() => {
    setLoadingRecords(true);
    refresh().finally(() => setLoadingRecords(false));
  }, [refresh]);

  // ── Homework — one child, one day, its own table and its own editor/history state,
  // entirely separate from Behaviour's so deleting a homework day can never touch
  // that day's behaviour comment, and vice versa.
  const [homework, setHomework] = useState({});
  const [loadingHomework, setLoadingHomework] = useState(true);
  const [hwOpenYear, setHwOpenYear] = useState(null);
  const [hwOpenMonth, setHwOpenMonth] = useState(null);
  const [hwOpenDay, setHwOpenDay] = useState(null);
  const [hwDayEditing, setHwDayEditing] = useState(false);
  const [hwEditorVersion, setHwEditorVersion] = useState(0);
  const [hwEditDate, setHwEditDate] = useState('');
  const hwEditDateInitRef = useRef(false);
  const [confirmDelHw, setConfirmDelHw] = useState(null);

  const refreshHomework = useCallback(async () => {
    try { setHomework(await getStudentHomework(student.id)); }
    catch (err) { showToast(err.message || 'Could not load homework'); }
  }, [student.id]);

  useEffect(() => {
    setLoadingHomework(true);
    refreshHomework().finally(() => setLoadingHomework(false));
  }, [refreshHomework]);

  useEffect(() => {
    if (loadingHomework || hwEditDateInitRef.current) return;
    hwEditDateInitRef.current = true;
    const today = isoToday();
    setHwEditDate(homework[today] !== undefined ? '' : today);
  }, [loadingHomework, homework]);

  const hwLastSave = useRef(Promise.resolve());
  const saveHwText = useCallback((date, value) => {
    const done = saveHomework(student.id, date, value).then(refreshHomework).catch(err => showToast(err.message || 'Could not save'));
    hwLastSave.current = done;
    return done;
  }, [student.id, refreshHomework]);

  async function finishHwCardEdit() {
    document.activeElement?.blur?.();
    setHwDayEditing(false);
    await hwLastSave.current;
    setHwEditorVersion(v => v + 1);
  }

  async function addHwDay() {
    if (!hwEditDate || homework[hwEditDate]) return;
    try {
      await saveHomework(student.id, hwEditDate, '');
      await refreshHomework();
      showToast(`Homework added for ${fmtDate(hwEditDate)}`);
    } catch (err) {
      showToast(err.message || 'Could not add homework');
    }
  }

  async function doDeleteHw(date) {
    try {
      await deleteHomework(student.id, date);
      await refreshHomework();
      setConfirmDelHw(null);
      showToast('Homework deleted');
    } catch (err) {
      showToast(err.message || 'Could not delete homework');
    }
  }

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

  // Same year > month grouping, for homework — its own dates/history, never merged with Behaviour's.
  const hwDates = Object.keys(homework).sort((a,b)=>a.localeCompare(b));
  const hwEditExists = hwEditDate!==''&&homework[hwEditDate]!==undefined;
  const hwEditIsToday = hwEditDate!==''&&hwEditDate===isoToday();
  const hwByYear = {};
  hwDates.forEach(d => {
    const monthKey = getCurrentSchoolMonth(d).start.slice(0,7);
    const yr = academicYearOfMonth(monthKey);
    (hwByYear[yr] = hwByYear[yr] || {});
    (hwByYear[yr][monthKey] = hwByYear[yr][monthKey] || []).push(d);
  });
  const hwYears = Object.keys(hwByYear).sort().reverse();

  // History boxes — the same box style as the rest of the app.
  const histBox = (on) => ({
    border: `1px solid ${on ? 'var(--ink)' : '#dfe3e8'}`, background: on ? 'var(--ink)' : '#f3f4f6', color: on ? '#fff' : 'var(--ink)',
    borderRadius: 8, padding: '7px 4px', minHeight: 46, cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'center',
    display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minWidth: 0,
  });
  const boxSub = { fontSize: 10.5, fontWeight: 500, opacity: 0.8, marginTop: 1 };

  if (loadingRecords || loadingHomework) return <LoadingState />;

  return (
    <div className="student-page">
      <div className="flex items-center gap-3" style={{marginBottom:20}}>
        <button className="btn btn-sm" onClick={onBack}><ArrowLeft size={14}/> All students</button>
        <div>
          <div style={{fontWeight:600,fontSize:16}}>{student.forename} {student.surname}</div>
          <div className="text-muted text-sm">{student.class}</div>
        </div>
      </div>
      <HealthNote student={student}/>

      {/* One thing at a time: Qur'aan | Behaviour | Report (heads only), each a
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
        {tab==='homework'&&(<>
          {/* Same fixed-position editor + history pattern as Behaviour, but a single
              field and its own independent state — never touches a Behaviour record. */}
          <div className="card">
            <div className="flex items-center gap-2" style={{marginBottom:12}}>
              <div className="card-title" style={{marginBottom:0,flex:1}}>{hwEditExists?'Edit day':'Add day'}</div>
              {hwEditIsToday&&<span className="badge badge-teal">Today</span>}
            </div>
            <div className="flex items-center gap-2" style={{marginBottom:14}}>
              <input type="date" value={hwEditDate} onChange={e=>setHwEditDate(e.target.value)}
                style={{flex:1,padding:'8px 14px',border:'1px solid var(--border)',borderRadius:'var(--r-md)',fontFamily:'var(--font)',fontSize:13}}/>
              {!hwEditExists&&<button className="btn btn-primary" onClick={addHwDay} disabled={!hwEditDate}><Plus size={14}/> Add day</button>}
              {hwEditExists&&(
                <button className="btn btn-icon btn-sm" style={{color:'var(--red)'}}
                  title="Delete this day" onClick={()=>setConfirmDelHw(hwEditDate)}><Trash2 size={13}/></button>
              )}
            </div>

            {hwEditExists?(
              <>
                {isDarulUloom && homework[hwEditDate]?.by && <div className="text-muted text-sm" style={{marginBottom:8}}>Last written by {homework[hwEditDate].by} — add to it rather than replace it.</div>}
                <div className="form-group">
                  <label>Homework set</label>
                  <StableTextarea
                    key={`${hwEditDate}-hw-${hwEditorVersion}`}
                    initialValue={homework[hwEditDate]?.text||''}
                    onSave={val=>saveHwText(hwEditDate,val)}
                    placeholder="What homework was set for this day?"
                  />
                </div>
                <button className="btn btn-sm" style={{width:'100%',justifyContent:'center',marginTop:12}}
                  onClick={()=>setHwEditDate('')}><Check size={13}/>Done</button>
              </>
            ):(
              <div style={{opacity:0.55}}>
                <div className="form-group">
                  <label>Homework set</label>
                  <div style={{border:'1px dashed var(--border)',borderRadius:'var(--r-md)',padding:'8px 10px',fontSize:13,color:'var(--text-soft)',minHeight:60}}>What homework was set for this day?</div>
                </div>
                <div style={{textAlign:'center',marginTop:12,fontSize:12,color:'var(--text-soft)'}}>Pick a date above to start a new entry, or click a day below to edit it</div>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-title" style={{marginBottom:10}}>Homework records</div>
            {hwDates.length===0&&(
              <div style={{textAlign:'center',padding:'12px 0',color:'var(--text-muted)',fontSize:13}}>No homework recorded yet. Use the form above to add one.</div>
            )}
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(110px, 1fr))',gap:6}}>
              {hwYears.map(yr=>{
                const n = Object.values(hwByYear[yr]).reduce((t,d)=>t+d.length,0);
                return (
                  <YearBox key={yr} label={yr} sub={`${n} day${n===1?'':'s'}`} open={hwOpenYear===yr} onClick={()=>setHwOpenYear(o=>o===yr?null:yr)}/>
                );
              })}
            </div>
            {hwOpenYear&&hwByYear[hwOpenYear]&&(
              <div style={{display:'grid',gridTemplateColumns:'repeat(4, minmax(0, 1fr))',gap:6,marginTop:8,paddingTop:8,borderTop:'1px dashed #d5dae0'}}>
                {Object.keys(hwByYear[hwOpenYear]).sort().map(monthKey=>{
                  const n = hwByYear[hwOpenYear][monthKey].length;
                  const d = new Date(monthKey+'-15T12:00:00');
                  return (
                    <button key={monthKey} type="button" onClick={()=>{ setHwOpenDay(null); setHwOpenMonth(monthKey); }} style={{...histBox(false),background:'#fafbfc',minHeight:42}}>
                      <span style={{fontWeight:600,fontSize:12.5}}>{d.toLocaleDateString('en-GB',{month:'short'})}</span>
                      <span style={boxSub}>{n} day{n===1?'':'s'}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {hwOpenMonth&&(()=>{
            const yr = academicYearOfMonth(hwOpenMonth);
            const days = [...(hwByYear[yr]?.[hwOpenMonth]||[])].sort();
            return (
              <div className="modal-overlay" onClick={e=>{ if (e.target===e.currentTarget) { finishHwCardEdit(); setHwOpenMonth(null); setHwOpenDay(null); } }}>
                <div className="modal" style={{maxWidth:480}}>
                  <div className="modal-header">
                    <div>
                      <div className="modal-title">{hwOpenDay ? fmtDate(hwOpenDay) : monthLabelFor(hwOpenMonth)}</div>
                      <div style={{fontSize:12,color:'var(--text-muted)'}}>{student.forename} · {hwOpenDay ? monthLabelFor(hwOpenMonth) : `${days.length} day${days.length===1?'':'s'} recorded — tap one to read it`}</div>
                    </div>
                    <button className="btn btn-icon" onClick={()=>{ finishHwCardEdit(); setHwOpenMonth(null); setHwOpenDay(null); }}><X size={16}/></button>
                  </div>
                  <div className="modal-body">
                    {hwOpenDay ? (()=>{
                      const r = homework[hwOpenDay]||{};
                      const back = (
                        <button className="btn" style={{flex:1,justifyContent:'center'}} onClick={()=>{ finishHwCardEdit(); setHwOpenDay(null); }}>
                          <ArrowLeft size={13}/> Back to {new Date(hwOpenMonth+'-15T12:00:00').toLocaleDateString('en-GB',{month:'long'})}
                        </button>
                      );
                      if (hwDayEditing) return (
                        <>
                          <div className="form-group" style={{marginBottom:10}}>
                            <label>Homework set</label>
                            <StableTextarea key={`${hwOpenDay}-hw-card`} initialValue={r.text||''}
                              onSave={val=>saveHwText(hwOpenDay,val)} placeholder="What homework was set for this day?"/>
                          </div>
                          <div style={{display:'flex',gap:8,marginTop:12}}>
                            {back}
                            <button className="btn btn-primary" style={{flex:1,justifyContent:'center'}} onClick={()=>{ finishHwCardEdit(); }}>
                              <Check size={13}/> Done
                            </button>
                          </div>
                        </>
                      );
                      return (
                        <>
                          <div style={{background:'#f3f4f6',borderRadius:8,padding:'10px 12px',marginBottom:8}}>
                            <div style={{fontSize:10.5,fontWeight:700,letterSpacing:'.04em',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:4}}>Homework set</div>
                            <div style={{fontSize:13,lineHeight:1.5,whiteSpace:'pre-wrap',color:r.text?'var(--ink)':'var(--text-soft)'}}>{r.text||'—'}</div>
                          </div>
                          {isDarulUloom && r.by && <div className="text-muted text-sm" style={{margin:'2px 0 8px'}}>Last written by {r.by}</div>}
                          <div style={{display:'flex',gap:8,marginTop:4}}>
                            {back}
                            <button className="btn btn-primary" style={{flex:1,justifyContent:'center'}} onClick={()=>setHwDayEditing(true)}>
                              <Pencil size={13}/> Edit
                            </button>
                          </div>
                        </>
                      );
                    })() : (
                      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(76px, 1fr))',gap:6}}>
                        {days.map(date=>{
                          const r = homework[date]||{};
                          const dt = new Date(date+'T12:00:00');
                          const isToday = date===isoToday();
                          return (
                            <button key={date} type="button" onClick={()=>{ setHwDayEditing(false); setHwOpenDay(date); }}
                              style={{...histBox(false), minHeight:58, boxShadow:isToday?'0 0 0 2px var(--blue)':'none'}}>
                              <span style={{fontSize:10.5,fontWeight:600,opacity:.75,textTransform:'uppercase'}}>{dt.toLocaleDateString('en-GB',{weekday:'short'})}</span>
                              <span style={{fontWeight:700,fontSize:14}}>{dt.toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</span>
                              <span style={{display:'flex',gap:3,marginTop:3,height:6}}>
                                {r.text&&<span title="Homework set" style={{width:6,height:6,borderRadius:'50%',background:'var(--text-soft)'}}/>}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
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
                {isDarulUloom && records[editDate]?.by && <div className="text-muted text-sm" style={{marginBottom:8}}>Last written by {records[editDate].by} — add to it rather than replace it.</div>}
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
            <div className="card-title" style={{marginBottom:10}}>Behaviour records</div>
            {dates.length===0&&(
              <div style={{textAlign:'center',padding:'12px 0',color:'var(--text-muted)',fontSize:13}}>No records yet. Use the form above to add one.</div>
            )}
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(110px, 1fr))',gap:6}}>
              {years.map(yr=>{
                const n = Object.values(byYear[yr]).reduce((t,d)=>t+d.length,0);
                return (
                  <YearBox key={yr} label={yr} sub={`${n} day${n===1?'':'s'}`} open={openYear===yr} onClick={()=>setOpenYear(o=>o===yr?null:yr)}/>
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
                          {isDarulUloom && r.by && <div className="text-muted text-sm" style={{margin:'2px 0 8px'}}>Last written by {r.by}</div>}
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
        </>)}
        {/* A Darul Uloom's report is its exam report card. A maktab writes its monthly/
            termly/yearly AI summary on the Reports page now, not here. */}
        {tab==='report'&&isDarulUloom&&<StudentExams student={student}/>}
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
      {confirmDelHw&&(
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setConfirmDelHw(null)}>
          <div className="modal" style={{maxWidth:400}}>
            <div className="modal-body" style={{textAlign:'center',paddingTop:28}}>
              <div style={{width:52,height:52,borderRadius:'50%',background:'var(--red-light)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px'}}><Trash2 size={24} color="var(--red)"/></div>
              <div style={{fontSize:16,fontWeight:600,marginBottom:6}}>Delete this homework?</div>
              <div style={{color:'var(--text-muted)',fontSize:13}}>{fmtDate(confirmDelHw)}<br/><span style={{fontSize:12}}>This cannot be undone.</span></div>
            </div>
            <div className="modal-footer" style={{justifyContent:'center'}}>
              <button className="btn" onClick={()=>setConfirmDelHw(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={()=>doDeleteHw(confirmDelHw)}><Trash2 size={13}/>Delete</button>
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
      // Qur'aan progress only matters when some class tracks it; never blocks the page.
      if (Object.keys(types).length) getQuranProgress().then(q => { setQuranAll(q); setQuranAllLoaded(true); }).catch(() => {});
      setActiveClass(prev => prev && classNamesData.includes(prev) ? prev : (classNamesData[0] || ''));
      // ?student=<id> opens that child straight away (a deep link from elsewhere).
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
    <Layout title={selectedStudent?`${selectedStudent.forename} ${selectedStudent.surname}`:'Daily records'} subtitle={selectedStudent?"Qur'aan, homework and behaviour":'Select a student to view or add records'}>
      {selectedStudent
        ?<StudentRecords student={selectedStudent} settings={settings} classType={classTypes[selectedStudent.class]}
          initialQuran={quranAll[selectedStudent.id] || (quranAllLoaded ? { entries: [], priorJuz: [], quranType: null } : null)} onQuranChanged={updateQuranFor}
          onBack={closeStudent} onRecordsChanged={refreshCounts}/>
        :<StudentList students={students} activeClass={activeClass} classNames={classNames} setActiveClass={setActiveClass} onSelect={openStudent} attendance={attendance} allRecords={allRecords} classTypes={classTypes} quranAll={quranAll}/>
      }
    </Layout>
  );
}
