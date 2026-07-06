// pages/DailyRecords.js — per-student daily records with AI summary
import React, { useState } from 'react';
import Layout from '../components/Layout';
import { getStudents, getClassNames, getSettings, getStudentRecords, saveDailyRecord, avatarInitials, calcAttendanceCounts } from '../lib/store';
import { Sparkles, ChevronDown, ChevronUp, Plus, ArrowLeft, User } from 'lucide-react';

function isoToday() { return new Date().toISOString().split('T')[0]; }
function fmtDate(iso) { return new Date(iso+'T12:00:00').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'}); }
function currentMonth() { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }

// ── Student list view ──
function StudentList({ students, activeClass, classNames, setActiveClass, onSelect }) {
  return (
    <div>
      <div className="class-tabs">
        {classNames.map(c => (
          <button key={c} className={`class-tab ${activeClass===c?'active':''}`} onClick={() => setActiveClass(c)}>{c}</button>
        ))}
      </div>
      <div className="grid-2">
        {students.filter(s => s.class===activeClass).map(s => {
          const counts = calcAttendanceCounts(s.id);
          const records = getStudentRecords(s.id);
          const entryCount = Object.keys(records).length;
          return (
            <div
              key={s.id}
              className="card"
              style={{cursor:'pointer',transition:'box-shadow 0.15s',borderLeft:'3px solid var(--sand-dark)'}}
              onClick={() => onSelect(s)}
              onMouseEnter={e => e.currentTarget.style.boxShadow='0 4px 16px rgba(92,61,30,0.12)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow=''}
            >
              <div className="flex items-center gap-3" style={{marginBottom:12}}>
                <div className="avatar" style={{width:40,height:40,fontSize:14}}>{avatarInitials(s.forename+' '+s.surname)}</div>
                <div>
                  <div style={{fontWeight:600,fontSize:14}}>{s.forename} {s.surname}</div>
                  <div className="text-muted text-sm">{s.class}</div>
                </div>
              </div>
              <div style={{display:'flex',gap:8,fontSize:12}}>
                <div style={{flex:1,background:'var(--green-light)',borderRadius:6,padding:'6px 10px',textAlign:'center'}}>
                  <div style={{fontWeight:700,color:'#276749',fontSize:16}}>{counts.present}</div>
                  <div style={{color:'#276749',fontSize:11}}>Present</div>
                </div>
                <div style={{flex:1,background:'var(--gold-light)',borderRadius:6,padding:'6px 10px',textAlign:'center'}}>
                  <div style={{fontWeight:700,color:'var(--gold)',fontSize:16}}>{counts.late}</div>
                  <div style={{color:'var(--gold)',fontSize:11}}>Late</div>
                </div>
                <div style={{flex:1,background:'var(--red-light)',borderRadius:6,padding:'6px 10px',textAlign:'center'}}>
                  <div style={{fontWeight:700,color:'var(--red)',fontSize:16}}>{counts.absent}</div>
                  <div style={{color:'var(--red)',fontSize:11}}>Absent</div>
                </div>
              </div>
              <div style={{marginTop:10,fontSize:12,color:'var(--text-muted)',display:'flex',justifyContent:'space-between'}}>
                <span>{entryCount} daily {entryCount===1?'record':'records'}</span>
                <span style={{color:'var(--brown)',fontWeight:500}}>View records →</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Individual student record view ──
function StudentRecords({ student, settings, onBack }) {
  const [records, setRecords] = useState(() => getStudentRecords(student.id));
  const [expanded, setExpanded] = useState({ [isoToday()]: true });
  const [newDate, setNewDate] = useState(isoToday());
  const [aiSummary, setAiSummary] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [toast, setToast] = useState('');

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''), 2000); }

  function getEntry(date) { return records[date] || { comment:'', positive:'', negative:'' }; }

  function setField(date, field, value) {
    saveDailyRecord(student.id, date, { [field]: value });
    setRecords(getStudentRecords(student.id));
  }

  function addDay() {
    if (!newDate) return;
    saveDailyRecord(student.id, newDate, getEntry(newDate));
    setRecords(getStudentRecords(student.id));
    setExpanded(e => ({...e, [newDate]:true}));
    showToast(`Entry added for ${fmtDate(newDate)}`);
  }

  const dates = Object.keys(records).sort((a,b) => b.localeCompare(a));
  const hasToday = records[isoToday()] !== undefined;

  async function summarise() {
    const month = currentMonth();
    const monthDates = dates.filter(d => d.startsWith(month));
    if (!monthDates.length) { setAiSummary('No records for this month yet.'); return; }

    const entries = monthDates.map(d => {
      const e = getEntry(d);
      return `${fmtDate(d)}:\n  Comment: ${e.comment||'None'}\n  Positives: ${e.positive||'None'}\n  Concerns: ${e.negative||'None'}`;
    }).join('\n\n');

    const counts = calcAttendanceCounts(student.id);
    const attLine = `Attendance this year: ${counts.present} present, ${counts.late} late, ${counts.absent} absent.`;

    const prompt = `You are a helpful Madrasah management assistant. Below are the daily records for ${student.forename} ${student.surname} at ${settings.schoolName} for ${new Date().toLocaleDateString('en-GB',{month:'long',year:'numeric'})}.\n\n${attLine}\n\n${entries}\n\nPlease write a warm, professional monthly progress summary for this student suitable for their report. Cover: overall behaviour and attitude, key positives, any recurring concerns, and a brief recommendation. Around 150–200 words, in paragraph form.`;

    setAiLoading(true); setAiSummary('');
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ model:'claude-sonnet-4-6', max_tokens:1000, messages:[{role:'user',content:prompt}] })
      });
      const data = await res.json();
      setAiSummary(data.content?.map(c=>c.text||'').join('')||'Unable to generate summary.');
    } catch { setAiSummary('Connection error. Please try again.'); }
    setAiLoading(false);
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3" style={{marginBottom:20}}>
        <button className="btn btn-sm" onClick={onBack}><ArrowLeft size={14}/> All students</button>
        <div className="avatar" style={{width:40,height:40,fontSize:14}}>{avatarInitials(student.forename+' '+student.surname)}</div>
        <div>
          <div style={{fontWeight:600,fontSize:16}}>{student.forename} {student.surname}</div>
          <div className="text-muted text-sm">{student.class}</div>
        </div>
      </div>

      <div className="grid-2" style={{alignItems:'flex-start'}}>
        {/* Left — daily entries */}
        <div>
          {/* Add entry */}
          <div className="card mb-4">
            <div className="card-title" style={{marginBottom:12}}>Add record</div>
            <div className="flex items-center gap-2">
              <input type="date" value={newDate} onChange={e=>setNewDate(e.target.value)}
                style={{flex:1,padding:'8px 12px',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',fontFamily:'var(--font)',fontSize:13}} />
              <button className="btn btn-primary" onClick={addDay}><Plus size={14}/> Add day</button>
            </div>
          </div>

          {/* Today — if not yet in list */}
          {!hasToday && (
            <div className="card mb-4" style={{borderLeft:'3px solid var(--gold)'}}>
              <div className="flex justify-between items-center" style={{marginBottom:10}}>
                <div>
                  <div style={{fontWeight:600,fontSize:13}}>Today — {fmtDate(isoToday())}</div>
                </div>
                <span className="badge badge-gold">Today</span>
              </div>
              <div className="form-group" style={{marginBottom:10}}>
                <label>Daily comment</label>
                <textarea rows={2} placeholder="General note for today…" value={getEntry(isoToday()).comment}
                  onChange={e=>setField(isoToday(),'comment',e.target.value)}
                  style={{resize:'vertical',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',padding:'8px 10px',fontFamily:'var(--font)',fontSize:13,width:'100%'}} />
              </div>
              <div className="record-panels">
                <div className="record-panel record-panel-pos">
                  <div className="record-panel-label">⭐ Positives</div>
                  <textarea placeholder="What went well?" value={getEntry(isoToday()).positive} onChange={e=>setField(isoToday(),'positive',e.target.value)} />
                </div>
                <div className="record-panel record-panel-neg">
                  <div className="record-panel-label">⚑ Concerns</div>
                  <textarea placeholder="Any concerns?" value={getEntry(isoToday()).negative} onChange={e=>setField(isoToday(),'negative',e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {dates.length === 0 && !hasToday && (
            <div className="card" style={{textAlign:'center',padding:32,color:'var(--text-muted)'}}>
              No records yet. Use "Add day" above or fill in today's entry.
            </div>
          )}

          {dates.map(date => {
            const entry = getEntry(date);
            const isToday = date === isoToday();
            const isOpen = expanded[date];
            const hasContent = entry.comment||entry.positive||entry.negative;
            return (
              <div key={date} className="card mb-4" style={{borderLeft:`3px solid ${isToday?'var(--gold)':'var(--sand-dark)'}`}}>
                <div
                  style={{display:'flex',alignItems:'center',justifyContent:'space-between',cursor:'pointer',marginBottom:isOpen?12:0}}
                  onClick={() => setExpanded(e=>({...e,[date]:!e[date]}))}
                >
                  <div>
                    <div style={{fontWeight:600,fontSize:13}}>{fmtDate(date)}</div>
                    <div className="text-muted text-sm" style={{marginTop:2}}>
                      {hasContent
                        ? [entry.comment&&`💬 ${entry.comment.slice(0,35)}${entry.comment.length>35?'…':''}`, entry.positive&&`⭐`, entry.negative&&`⚑`].filter(Boolean).join('  ')
                        : 'No notes yet'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isToday && <span className="badge badge-gold">Today</span>}
                    {isOpen ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
                  </div>
                </div>
                {isOpen && (
                  <>
                    <div className="form-group" style={{marginBottom:10}}>
                      <label>Daily comment</label>
                      <textarea rows={2} placeholder="General note for this day…" value={entry.comment}
                        onChange={e=>setField(date,'comment',e.target.value)}
                        style={{resize:'vertical',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',padding:'8px 10px',fontFamily:'var(--font)',fontSize:13,width:'100%'}} />
                    </div>
                    <div className="record-panels">
                      <div className="record-panel record-panel-pos">
                        <div className="record-panel-label">⭐ Positives</div>
                        <textarea placeholder="What went well?" value={entry.positive} onChange={e=>setField(date,'positive',e.target.value)} />
                      </div>
                      <div className="record-panel record-panel-neg">
                        <div className="record-panel-label">⚑ Concerns</div>
                        <textarea placeholder="Any concerns?" value={entry.negative} onChange={e=>setField(date,'negative',e.target.value)} />
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Right — AI summary */}
        <div style={{position:'sticky',top:24}}>
          <div className="card">
            <div className="card-title" style={{marginBottom:4}}>Monthly summary</div>
            <div className="card-sub" style={{marginBottom:14}}>
              AI-generated report summary for {student.forename} — {new Date().toLocaleDateString('en-GB',{month:'long',year:'numeric'})}
            </div>
            <button className="btn btn-ai" style={{width:'100%',justifyContent:'center',padding:'10px',marginBottom:14}} onClick={summarise} disabled={aiLoading}>
              <Sparkles size={15}/>{aiLoading?'Generating…':'Summarise this month ↗'}
            </button>
            {aiLoading && (
              <div className="ai-summary-box">
                <div style={{color:'var(--text-muted)',fontStyle:'italic',fontSize:13}}>Reading through {student.forename}'s records…</div>
              </div>
            )}
            {aiSummary && !aiLoading && (
              <div className="ai-summary-box">
                <div className="ai-summary-title"><Sparkles size={13}/>AI summary — {new Date().toLocaleDateString('en-GB',{month:'long',year:'numeric'})}</div>
                <div className="ai-summary-text">{aiSummary}</div>
              </div>
            )}
            {!aiSummary && !aiLoading && (
              <div style={{textAlign:'center',padding:'16px 0',color:'var(--text-muted)',fontSize:13}}>
                <Sparkles size={24} style={{opacity:0.2,marginBottom:8}}/>
                <div>Add some daily records then click above to generate a report summary for {student.forename}.</div>
              </div>
            )}
          </div>

          {/* This month stats */}
          <div className="card" style={{marginTop:14}}>
            <div className="card-title" style={{marginBottom:12}}>This month</div>
            {(() => {
              const month = currentMonth();
              const monthDates = dates.filter(d=>d.startsWith(month));
              const withPos = monthDates.filter(d=>getEntry(d).positive).length;
              const withCon = monthDates.filter(d=>getEntry(d).negative).length;
              const withCom = monthDates.filter(d=>getEntry(d).comment).length;
              return [['Days recorded',monthDates.length,undefined],['With comments',withCom,'var(--brown)'],['With positives',withPos,'#276749'],['With concerns',withCon,'var(--red)']].map(([l,v,col])=>(
                <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid var(--border)',fontSize:13}}>
                  <span className="text-muted">{l}</span>
                  <span style={{fontWeight:600,color:col||'var(--text)'}}>{v}</span>
                </div>
              ));
            })()}
          </div>
        </div>
      </div>

      {toast && <div className="toast">✓ {toast}</div>}
    </div>
  );
}

export default function DailyRecords() {
  const students = getStudents();
  const classNames = getClassNames();
  const settings = getSettings();
  const [activeClass, setActiveClass] = useState(classNames[0]||'');
  const [selectedStudent, setSelectedStudent] = useState(null);

  return (
    <Layout
      title={selectedStudent ? `${selectedStudent.forename} ${selectedStudent.surname}` : 'Daily records'}
      subtitle={selectedStudent ? 'Daily comments, positives & concerns' : 'Select a student to view their records'}
    >
      {selectedStudent ? (
        <StudentRecords
          student={selectedStudent}
          settings={settings}
          onBack={() => setSelectedStudent(null)}
        />
      ) : (
        <StudentList
          students={students}
          activeClass={activeClass}
          classNames={classNames}
          setActiveClass={setActiveClass}
          onSelect={setSelectedStudent}
        />
      )}
    </Layout>
  );
}
