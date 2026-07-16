import React, { useState, useEffect, useCallback, useRef } from 'react';
import Layout from '../components/Layout';
import { LoadingState, ErrorState } from '../components/DataState';
import { getStudents, getClassNames, getSettings, getStudentRecords, getDailyRecords, saveDailyRecord, deleteDailyRecord, attendanceCountsFrom, getAttendance, currentSchoolYear, getAiSummaries, saveAiSummary, formatDateGB } from '../lib/store';
import { checkSummaryFit } from '../lib/summaryFit';
import { Sparkles, ChevronDown, ChevronUp, Plus, ArrowLeft, Trash2 } from 'lucide-react';

function isoToday() { return new Date().toISOString().split('T')[0]; }
function fmtDate(iso) {
  try { return `${new Date(iso+'T12:00:00').toLocaleDateString('en-GB',{weekday:'long'})} ${formatDateGB(iso)}`; }
  catch { return iso; }
}
function currentMonth() { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
function monthLabelFor(ym) {
  const [y,m]=ym.split('-').map(Number);
  return new Date(y,m-1,1).toLocaleDateString('en-GB',{month:'long',year:'numeric'});
}

// Stable textarea that doesn't lose focus on mobile
// Key: do NOT re-render the textarea on every keystroke — use uncontrolled + ref-based save
function StableTextarea({ initialValue, onSave, placeholder, style }) {
  const ref = useRef(null);
  const timer = useRef(null);

  const handleChange = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (ref.current) onSave(ref.current.value);
    }, 400);
  };

  // Flush immediately when focus leaves — otherwise a click elsewhere (e.g.
  // "Add day") can fire before the debounce timer does, and the edit is
  // never saved before this field's data gets refreshed from the server.
  const handleBlur = () => {
    clearTimeout(timer.current);
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
  const handleChange = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { if(ref.current) onSave(ref.current.value); }, 400);
  };
  // Flush immediately when focus leaves — see StableTextarea for why.
  const handleBlur = () => {
    clearTimeout(timer.current);
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
        resize:'vertical', border:'1px solid var(--border)', borderRadius:'var(--r-md)',
        padding:'8px 10px', fontFamily:'var(--font)', fontSize:13, width:'100%',
        color:'var(--text)', background:'var(--surface)', outline:'none',
        WebkitUserSelect:'text', userSelect:'text',
      }}
    />
  );
}

function StudentList({ students, activeClass, classNames, setActiveClass, onSelect, attendance, allRecords }) {
  const classStudents = students.filter(s=>s.class===activeClass);

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
                <div className="text-muted text-sm">{s.class}</div>
              </div>
              <div style={{display:'flex',gap:8,fontSize:12}}>
                <div style={{flex:1,background:'var(--green-light)',borderRadius:'var(--r-md)',padding:'6px 10px',textAlign:'center'}}>
                  <div style={{fontWeight:700,color:'var(--green-text)',fontSize:16}}>{counts.present}</div>
                  <div style={{color:'var(--green-text)',fontSize:11}}>Present</div>
                </div>
                <div style={{flex:1,background:'var(--amber-light)',borderRadius:'var(--r-md)',padding:'6px 10px',textAlign:'center'}}>
                  <div style={{fontWeight:700,color:'var(--amber-text)',fontSize:16}}>{counts.late}</div>
                  <div style={{color:'var(--amber-text)',fontSize:11}}>Late</div>
                </div>
                <div style={{flex:1,background:'var(--red-light)',borderRadius:'var(--r-md)',padding:'6px 10px',textAlign:'center'}}>
                  <div style={{fontWeight:700,color:'var(--red-text)',fontSize:16}}>{counts.absent}</div>
                  <div style={{color:'var(--red-text)',fontSize:11}}>Absent</div>
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

function StudentRecords({ student, settings, onBack }) {
  const [records, setRecords] = useState({});
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [expanded, setExpanded] = useState({[isoToday()]:true});
  const [newDate, setNewDate] = useState(isoToday());
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
    try {
      const all = await getAiSummaries(student.id);
      setPreviousSummaries(all);
    } catch { /* saved summaries are a bonus, not required to use the page */ }
  }, [student.id]);

  useEffect(() => {
    setLoadingRecords(true);
    refresh().finally(() => setLoadingRecords(false));
    refreshSummaries();
  }, [refresh, refreshSummaries]);

  // Stable field save — doesn't cause re-render of the textarea
  const saveField = useCallback((date, field, value) => {
    saveDailyRecord(student.id, date, {[field]:value}).catch(err => showToast(err.message || 'Could not save'));
    // Don't call refresh() here — it would unmount the textarea and lose focus
  }, [student.id]);

  function getEntry(date) { return records[date]||{comment:'',positive:'',negative:''}; }

  async function addDay() {
    if (!newDate) return;
    try {
      if (!records[newDate]) {
        await saveDailyRecord(student.id, newDate, {comment:'',positive:'',negative:''});
      }
      await refresh();
      setExpanded(e=>({...e,[newDate]:true}));
      showToast(`Entry added for ${fmtDate(newDate)}`);
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
      const freshRecords = await getStudentRecords(student.id);
      const month=currentMonth();
      const monthDates=Object.keys(freshRecords).filter(d=>d.startsWith(month)).sort((a,b)=>b.localeCompare(a));
      if (!monthDates.length) {
        setAiSummary('No records found for this month. Add some daily entries first.');
        setAiLoading(false);
        return;
      }
      const entries=monthDates.map(d=>{
        const e=freshRecords[d]||{};
        return `${fmtDate(d)}:\n  Comment: ${e.comment||'None'}\n  Positives: ${e.positive||'None'}\n  Concerns: ${e.negative||'None'}`;
      }).join('\n\n');
      const year = await currentSchoolYear();
      const attendanceForYear = await getAttendance(year);
      const counts = attendanceCountsFrom(attendanceForYear, student.id);
      const prompt=`You are a helpful Madrasah assistant. Below are the daily records for ${student.forename} ${student.surname} at ${settings.schoolName} for ${new Date().toLocaleDateString('en-GB',{month:'long',year:'numeric'})}.\n\nAttendance this year: ${counts.present} present, ${counts.late} late, ${counts.absent} absent.\n\n${entries}\n\nWrite a warm, professional monthly progress summary for this student suitable for their report. Cover: overall attitude and behaviour, key positives, any recurring concerns, and a brief recommendation. Keep it under 1000 characters (including spaces) so it fits the report's summary box — this is a hard limit, not a target to aim near. Plain prose in paragraph form only. Do not use bullet points, headings, titles, or any Markdown formatting — output plain text only.${aiInstructions?`\n\nThe teacher has given these additional instructions for this summary — follow them: ${aiInstructions}`:''}`;
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
      await saveAiSummary(student.id, currentMonth(), { summary: aiSummary, instructions: aiInstructions, behavior: next });
    } catch (err) {
      showToast(err.message || 'Could not save behaviour rating');
      setBehavior(behavior); // revert on failure
    }
    setSavingBehavior('');
  }

  async function addToReport() {
    setSavingSummary(true);
    try {
      await saveAiSummary(student.id, currentMonth(), { summary: aiSummary, instructions: aiInstructions, behavior });
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
  const hasToday = records[isoToday()]!==undefined;

  function DayEntry({date, isToday}) {
    const entry = getEntry(date);
    const isOpen = expanded[date];
    const hasContent = entry.comment||entry.positive||entry.negative;
    return (
      <div className="card mb-4" style={{borderLeft:`3px solid ${isToday?'var(--teal)':'var(--border-strong)'}`}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',cursor:'pointer',marginBottom:isOpen?12:0}}
          onClick={()=>setExpanded(e=>({...e,[date]:!e[date]}))}>
          <div>
            <div style={{fontWeight:600,fontSize:13}}>{fmtDate(date)}</div>
            <div className="text-muted text-sm" style={{marginTop:2}}>
              {hasContent
                ?[entry.comment&&`💬 ${entry.comment.slice(0,40)}${entry.comment.length>40?'…':''}`,
                  entry.positive&&'⭐',entry.negative&&'⚑'].filter(Boolean).join('  ')
                :'No notes yet — tap to expand'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isToday&&<span className="badge badge-teal">Today</span>}
            <button className="btn btn-icon btn-sm" style={{color:'var(--red)'}}
              title="Delete" onClick={e=>{e.stopPropagation();setConfirmDel(date);}}><Trash2 size={13}/></button>
            {isOpen?<ChevronUp size={16}/>:<ChevronDown size={16}/>}
          </div>
        </div>
        {isOpen&&(
          <>
            <div className="form-group" style={{marginBottom:10}}>
              <label>Daily comment</label>
              <CommentBox
                key={`${date}-comment`}
                initialValue={entry.comment}
                onSave={val=>saveField(date,'comment',val)}
                placeholder="General note for this day…"
              />
            </div>
            <div className="record-panels">
              <div className="record-panel record-panel-pos">
                <div className="record-panel-label">⭐ Positives</div>
                <StableTextarea
                  key={`${date}-positive`}
                  initialValue={entry.positive}
                  onSave={val=>saveField(date,'positive',val)}
                  placeholder="What went well?"
                />
              </div>
              <div className="record-panel record-panel-neg">
                <div className="record-panel-label">⚑ Concerns</div>
                <StableTextarea
                  key={`${date}-negative`}
                  initialValue={entry.negative}
                  onSave={val=>saveField(date,'negative',val)}
                  placeholder="Any concerns?"
                />
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  if (loadingRecords) return <LoadingState />;

  return (
    <div>
      <div className="flex items-center gap-3" style={{marginBottom:20}}>
        <button className="btn btn-sm" onClick={onBack}><ArrowLeft size={14}/> All students</button>
        <div>
          <div style={{fontWeight:600,fontSize:16}}>{student.forename} {student.surname}</div>
          <div className="text-muted text-sm">{student.class}</div>
        </div>
      </div>

      <div className="grid-2" style={{alignItems:'flex-start'}}>
        <div>
          <div className="card mb-4">
            <div className="card-title" style={{marginBottom:12}}>Add record</div>
            <div className="flex items-center gap-2">
              <input type="date" value={newDate} onChange={e=>setNewDate(e.target.value)}
                style={{flex:1,padding:'8px 14px',border:'1px solid var(--border)',borderRadius:'var(--r-md)',fontFamily:'var(--font)',fontSize:13}}/>
              <button className="btn btn-primary" onClick={addDay}><Plus size={14}/> Add day</button>
            </div>
          </div>

          {!hasToday&&(
            <div className="card mb-4" style={{borderLeft:'3px solid var(--teal)'}}>
              <div className="flex justify-between items-center" style={{marginBottom:10}}>
                <div style={{fontWeight:600,fontSize:13}}>Today — {fmtDate(isoToday())}</div>
                <span className="badge badge-teal">Today</span>
              </div>
              <div className="form-group" style={{marginBottom:10}}>
                <label>Daily comment</label>
                <CommentBox key="today-comment" initialValue="" onSave={val=>saveField(isoToday(),'comment',val)} placeholder="General note for today…"/>
              </div>
              <div className="record-panels">
                <div className="record-panel record-panel-pos">
                  <div className="record-panel-label">⭐ Positives</div>
                  <StableTextarea key="today-pos" initialValue="" onSave={val=>saveField(isoToday(),'positive',val)} placeholder="What went well?"/>
                </div>
                <div className="record-panel record-panel-neg">
                  <div className="record-panel-label">⚑ Concerns</div>
                  <StableTextarea key="today-neg" initialValue="" onSave={val=>saveField(isoToday(),'negative',val)} placeholder="Any concerns?"/>
                </div>
              </div>
            </div>
          )}

          {dates.length===0&&!hasToday&&(
            <div className="card" style={{textAlign:'center',padding:32,color:'var(--text-muted)'}}>No records yet. Use "Add day" above or fill in today's entry.</div>
          )}
          {dates.map(date=><DayEntry key={date} date={date} isToday={date===isoToday()}/>)}
        </div>

        <div style={{position:'sticky',top:24}}>
          <div className="card">
            <div className="card-title" style={{marginBottom:4}}>Monthly summary</div>
            <div className="card-sub" style={{marginBottom:14}}>
              AI report paragraph for {student.forename} — {new Date().toLocaleDateString('en-GB',{month:'long',year:'numeric'})}
            </div>

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
              <Sparkles size={15}/>{aiLoading?'Generating…':(aiSummary?'Regenerate summary ↗':'Summarise this month ↗')}
            </button>
            {aiLoading&&<div className="ai-summary-box"><div style={{color:'var(--teal-dark)',fontStyle:'italic',fontSize:13}}>Reading through {student.forename}'s records…</div></div>}
            {aiSummary&&!aiLoading&&(
              <div className="ai-summary-box">
                <div className="ai-summary-title"><Sparkles size={13}/>Summary — {new Date().toLocaleDateString('en-GB',{month:'long',year:'numeric'})}</div>
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
          </div>
          {previousSummaries.length>0&&(
            <div className="card" style={{marginTop:14}}>
              <div className="card-title" style={{marginBottom:12}}>Previous summaries</div>
              {previousSummaries.map(s=>(
                <div key={s.month} style={{marginBottom:12,paddingBottom:12,borderBottom:'1px solid var(--border)'}}>
                  <div style={{fontWeight:600,fontSize:12,marginBottom:4}}>{monthLabelFor(s.month)}</div>
                  <div style={{fontSize:12,color:'var(--text-muted)',lineHeight:1.6,whiteSpace:'pre-wrap'}}>{s.summary}</div>
                </div>
              ))}
            </div>
          )}
          <div className="card" style={{marginTop:14}}>
            <div className="card-title" style={{marginBottom:12}}>This month</div>
            {(()=>{
              const month=currentMonth();
              const md=Object.keys(records).filter(d=>d.startsWith(month));
              return [['Days recorded',md.length,undefined],['With comments',md.filter(d=>records[d]?.comment).length,'var(--ink)'],['With positives',md.filter(d=>records[d]?.positive).length,'var(--green)'],['With concerns',md.filter(d=>records[d]?.negative).length,'var(--red)']].map(([l,v,col])=>(
                <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid var(--border)',fontSize:13}}>
                  <span className="text-muted">{l}</span><span style={{fontWeight:600,color:col||'var(--text)'}}>{v}</span>
                </div>
              ));
            })()}
          </div>
        </div>
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
  const [activeClass, setActiveClass] = useState('');
  const [selectedStudent, setSelectedStudent] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const year = await currentSchoolYear();
      const [studentsData, classNamesData, settingsData, attendanceData, recordsData] = await Promise.all([
        getStudents(), getClassNames(), getSettings(), getAttendance(year), getDailyRecords(),
      ]);
      setStudents(studentsData); setClassNames(classNamesData); setSettings(settingsData);
      setAttendance(attendanceData); setAllRecords(recordsData);
      setActiveClass(prev => prev && classNamesData.includes(prev) ? prev : (classNamesData[0] || ''));
    } catch (err) {
      setError(err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Layout title="Daily records"><LoadingState /></Layout>;
  if (error) return <Layout title="Daily records"><ErrorState error={error} onRetry={load} /></Layout>;

  return (
    <Layout title={selectedStudent?`${selectedStudent.forename} ${selectedStudent.surname}`:'Daily records'} subtitle={selectedStudent?'Daily comments, positives & concerns':'Select a student to view or add records'}>
      {selectedStudent
        ?<StudentRecords student={selectedStudent} settings={settings} onBack={()=>setSelectedStudent(null)}/>
        :<StudentList students={students} activeClass={activeClass} classNames={classNames} setActiveClass={setActiveClass} onSelect={setSelectedStudent} attendance={attendance} allRecords={allRecords}/>
      }
    </Layout>
  );
}
