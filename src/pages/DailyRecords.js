import React, { useState, useCallback, useRef } from 'react';
import Layout from '../components/Layout';
import { getStudents, getClassNames, getSettings, getStudentRecords, saveDailyRecord, deleteDailyRecord, avatarInitials, calcAttendanceCounts, currentSchoolYear } from '../lib/store';
import { Sparkles, ChevronDown, ChevronUp, Plus, ArrowLeft, Trash2 } from 'lucide-react';

function isoToday() { return new Date().toISOString().split('T')[0]; }
function fmtDate(iso) {
  try { return new Date(iso+'T12:00:00').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'}); }
  catch { return iso; }
}
function currentMonth() { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }

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

  return (
    <textarea
      ref={ref}
      defaultValue={initialValue}
      placeholder={placeholder}
      onChange={handleChange}
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
  return (
    <textarea
      ref={ref}
      defaultValue={initialValue}
      placeholder={placeholder}
      onChange={handleChange}
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

function StudentList({ students, activeClass, classNames, setActiveClass, onSelect }) {
  return (
    <div>
      <div className="class-tabs">
        {classNames.map(c=>(
          <button key={c} className={`class-tab ${activeClass===c?'active':''}`} onClick={()=>setActiveClass(c)}>{c}</button>
        ))}
      </div>
      <div className="grid-2">
        {students.filter(s=>s.class===activeClass).map(s=>{
          const counts=calcAttendanceCounts(s.id,currentSchoolYear());
          const records=getStudentRecords(s.id);
          const entryCount=Object.keys(records).length;
          return (
            <div key={s.id} className="card" style={{cursor:'pointer',borderLeft:'3px solid var(--border-strong)',transition:'box-shadow 0.15s'}}
              onClick={()=>onSelect(s)}
              onMouseEnter={e=>e.currentTarget.style.boxShadow='var(--shadow-md)'}
              onMouseLeave={e=>e.currentTarget.style.boxShadow=''}>
              <div className="flex items-center gap-3" style={{marginBottom:12}}>
                <div className="avatar" style={{width:40,height:40,fontSize:14}}>{avatarInitials(s.forename+' '+s.surname)}</div>
                <div>
                  <div style={{fontWeight:600,fontSize:14}}>{s.forename} {s.surname}</div>
                  <div className="text-muted text-sm">{s.class}</div>
                </div>
              </div>
              <div style={{display:'flex',gap:8,fontSize:12}}>
                <div style={{flex:1,background:'var(--green-light)',borderRadius:'var(--r-md)',padding:'6px 10px',textAlign:'center'}}>
                  <div style={{fontWeight:700,color:'var(--green)',fontSize:16}}>{counts.present}</div>
                  <div style={{color:'var(--green)',fontSize:11}}>Present</div>
                </div>
                <div style={{flex:1,background:'var(--amber-light)',borderRadius:'var(--r-md)',padding:'6px 10px',textAlign:'center'}}>
                  <div style={{fontWeight:700,color:'var(--amber)',fontSize:16}}>{counts.late}</div>
                  <div style={{color:'var(--amber)',fontSize:11}}>Late</div>
                </div>
                <div style={{flex:1,background:'var(--red-light)',borderRadius:'var(--r-md)',padding:'6px 10px',textAlign:'center'}}>
                  <div style={{fontWeight:700,color:'var(--red)',fontSize:16}}>{counts.absent}</div>
                  <div style={{color:'var(--red)',fontSize:11}}>Absent</div>
                </div>
              </div>
              <div style={{marginTop:10,fontSize:12,color:'var(--text-muted)',display:'flex',justifyContent:'space-between'}}>
                <span>{entryCount} {entryCount===1?'record':'records'}</span>
                <span style={{color:'var(--lime-dark)',fontWeight:500}}>View records →</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StudentRecords({ student, settings, onBack }) {
  const [records, setRecords] = useState(()=>getStudentRecords(student.id));
  const [expanded, setExpanded] = useState({[isoToday()]:true});
  const [newDate, setNewDate] = useState(isoToday());
  const [aiSummary, setAiSummary] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const [toast, setToast] = useState('');

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''),2000); }
  function refresh() { setRecords(getStudentRecords(student.id)); }

  // Stable field save — doesn't cause re-render of the textarea
  const saveField = useCallback((date, field, value) => {
    saveDailyRecord(student.id, date, {[field]:value});
    // Don't call refresh() here — it would unmount the textarea and lose focus
  }, [student.id]);

  function getEntry(date) { return records[date]||{comment:'',positive:'',negative:''}; }

  function addDay() {
    if (!newDate) return;
    const existing = getStudentRecords(student.id);
    if (!existing[newDate]) {
      saveDailyRecord(student.id, newDate, {comment:'',positive:'',negative:''});
    }
    refresh();
    setExpanded(e=>({...e,[newDate]:true}));
    showToast(`Entry added for ${fmtDate(newDate)}`);
  }

  function doDelete(date) {
    deleteDailyRecord(student.id, date);
    refresh();
    setConfirmDel(null);
    showToast('Record deleted');
  }

  async function summarise() {
    const month=currentMonth();
    const recs=getStudentRecords(student.id);
    const monthDates=Object.keys(recs).filter(d=>d.startsWith(month)).sort((a,b)=>b.localeCompare(a));
    if (!monthDates.length) {
      setAiSummary('No records found for this month. Add some daily entries first.');
      return;
    }
    const entries=monthDates.map(d=>{
      const e=recs[d]||{};
      return `${fmtDate(d)}:\n  Comment: ${e.comment||'None'}\n  Positives: ${e.positive||'None'}\n  Concerns: ${e.negative||'None'}`;
    }).join('\n\n');
    const counts=calcAttendanceCounts(student.id, currentSchoolYear());
    const prompt=`You are a helpful Madrasah assistant. Below are the daily records for ${student.forename} ${student.surname} at ${settings.schoolName} for ${new Date().toLocaleDateString('en-GB',{month:'long',year:'numeric'})}.\n\nAttendance this year: ${counts.present} present, ${counts.late} late, ${counts.absent} absent.\n\n${entries}\n\nWrite a warm, professional monthly progress summary for this student suitable for their report. Cover: overall attitude and behaviour, key positives, any recurring concerns, and a brief recommendation. Around 150-200 words, paragraph form only. Do not use bullet points.`;
    setAiLoading(true); setAiSummary('');
    try {
      const res = await fetch('/api/ai-summary', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ prompt })
      });
      if (!res.ok) throw new Error('API error');
      const data = await res.json();
      setAiSummary(data.summary || 'Unable to generate summary.');
    } catch {
      // Fallback: try Anthropic directly
      try {
        const res2 = await fetch('https://api.anthropic.com/v1/messages', {
          method:'POST',
          headers:{ 'Content-Type':'application/json', 'anthropic-version':'2023-06-01', 'x-api-key': '' },
          body: JSON.stringify({ model:'claude-sonnet-4-6', max_tokens:1000, messages:[{role:'user',content:prompt}] })
        });
        const data2 = await res2.json();
        if (data2.content?.[0]?.text) { setAiSummary(data2.content[0].text); }
        else { setAiSummary('AI summary is available when this app is connected to a server. For now, you can copy the daily records and paste them into Claude.ai for a summary.'); }
      } catch {
        setAiSummary('AI summary is available when this app is connected to a server. For now, copy the daily records and paste them into Claude.ai to generate a summary.');
      }
    }
    setAiLoading(false);
  }

  const dates = Object.keys(records).sort((a,b)=>b.localeCompare(a));
  const hasToday = records[isoToday()]!==undefined;

  function DayEntry({date, isToday}) {
    const entry = getEntry(date);
    const isOpen = expanded[date];
    const hasContent = entry.comment||entry.positive||entry.negative;
    return (
      <div className="card mb-4" style={{borderLeft:`3px solid ${isToday?'var(--lime)':'var(--border-strong)'}`}}>
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
            {isToday&&<span className="badge badge-lime">Today</span>}
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

  return (
    <div>
      <div className="flex items-center gap-3" style={{marginBottom:20}}>
        <button className="btn btn-sm" onClick={onBack}><ArrowLeft size={14}/> All students</button>
        <div className="avatar" style={{width:40,height:40,fontSize:14}}>{avatarInitials(student.forename+' '+student.surname)}</div>
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
            <div className="card mb-4" style={{borderLeft:'3px solid var(--lime)'}}>
              <div className="flex justify-between items-center" style={{marginBottom:10}}>
                <div style={{fontWeight:600,fontSize:13}}>Today — {fmtDate(isoToday())}</div>
                <span className="badge badge-lime">Today</span>
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
            <button className="btn btn-ai" style={{width:'100%',justifyContent:'center',padding:'10px',marginBottom:14}} onClick={summarise} disabled={aiLoading}>
              <Sparkles size={15}/>{aiLoading?'Generating…':'Summarise this month ↗'}
            </button>
            {aiLoading&&<div className="ai-summary-box"><div style={{color:'var(--lime-dark)',fontStyle:'italic',fontSize:13}}>Reading through {student.forename}'s records…</div></div>}
            {aiSummary&&!aiLoading&&(
              <div className="ai-summary-box">
                <div className="ai-summary-title"><Sparkles size={13}/>Summary — {new Date().toLocaleDateString('en-GB',{month:'long',year:'numeric'})}</div>
                <div className="ai-summary-text">{aiSummary}</div>
              </div>
            )}
            {!aiSummary&&!aiLoading&&(
              <div style={{textAlign:'center',padding:'16px 0',color:'var(--text-muted)',fontSize:13}}>
                <Sparkles size={24} style={{opacity:.2,marginBottom:8,display:'block',margin:'0 auto 8px'}}/>
                Add daily records then click above to generate a summary for {student.forename}.
              </div>
            )}
          </div>
          <div className="card" style={{marginTop:14}}>
            <div className="card-title" style={{marginBottom:12}}>This month</div>
            {(()=>{
              const month=currentMonth(), recs=getStudentRecords(student.id);
              const md=Object.keys(recs).filter(d=>d.startsWith(month));
              return [['Days recorded',md.length,undefined],['With comments',md.filter(d=>recs[d]?.comment).length,'var(--ink)'],['With positives',md.filter(d=>recs[d]?.positive).length,'var(--green)'],['With concerns',md.filter(d=>recs[d]?.negative).length,'var(--red)']].map(([l,v,col])=>(
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
  const students=getStudents();
  const classNames=getClassNames();
  const settings=getSettings();
  const [activeClass,setActiveClass]=useState(classNames[0]||'');
  const [selectedStudent,setSelectedStudent]=useState(null);
  return (
    <Layout title={selectedStudent?`${selectedStudent.forename} ${selectedStudent.surname}`:'Daily records'} subtitle={selectedStudent?'Daily comments, positives & concerns':'Select a student to view or add records'}>
      {selectedStudent
        ?<StudentRecords student={selectedStudent} settings={settings} onBack={()=>setSelectedStudent(null)}/>
        :<StudentList students={students} activeClass={activeClass} classNames={classNames} setActiveClass={setActiveClass} onSelect={setSelectedStudent}/>
      }
    </Layout>
  );
}
