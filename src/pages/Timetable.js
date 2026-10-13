// pages/Timetable.js — a Darul Uloom's timetable (server/routes/timetable.js). The head sets the
// periods (names, times, breaks, which days) and fills each class's periods with a lesson — one of
// that year's books from the Aalim course page, or anything typed — and its teacher. It can be seen
// by class or by teacher, a day at a time or the whole week. Teachers see it too (read-only), opening
// on their own lessons today.
import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import { LoadingState, ErrorState } from '../components/DataState';
import { getTimetable, addStarterPeriods, savePeriod, deletePeriod, saveLesson, copyTimetableDay, schoolDays, getLessonLogs, saveLessonLog, getBookLogs, niceDate } from '../lib/store';
import { useAuth } from '../lib/AuthContext';
import { Plus, X, Save, Trash2, ChevronDown, Check, Copy, Clock, PenLine, CheckCircle2 } from 'lucide-react';

const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY3 = DAY.map(d => d.slice(0, 3));
const hm = t => (t || '').replace(/^0/, '');
// This week's date for a day number (Monday-first weeks).
const iso = dt => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
const TODAY = iso(new Date());
const dateOf = d => { const t = new Date(); t.setDate(t.getDate() - ((t.getDay() + 6) % 7) + ((d + 6) % 7)); return iso(t); };
const QURAN_SUBJECT = /^(hifdh|hifz|hifzh|naazhirah|nazira|nazirah|nazarah|qaa'?idah|qaida|qaidah)\b/i;
const runsOn = (p, d) => !p.days.length || p.days.includes(d);
const sameLesson = (a, b) => a && b && a.subject === b.subject && a.kitaab === b.kitaab && (a.teacherId || '') === (b.teacherId || '');
// "Every day", or the days in Monday-first order with runs joined: "Mon–Thu", "Mon, Wed, Fri".
const daysText = (days, all) => {
  if (!days.length || all.every(d => days.includes(d))) return 'Every day';
  const on = all.filter(d => days.includes(d));
  const runs = [];
  on.forEach(d => {
    const last = runs[runs.length - 1];
    if (last && all.indexOf(d) === all.indexOf(last[last.length - 1]) + 1) last.push(d); else runs.push([d]);
  });
  return runs.map(x => (x.length > 2 ? `${DAY3[x[0]]}–${DAY3[x[x.length - 1]]}` : x.map(d => DAY3[d]).join(', '))).join(', ');
};

export default function Timetable() {
  const { user, isOwner } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [view, setView] = useState(null);   // { kind: 'class' | 'teacher', id }
  const [day, setDay] = useState(() => {
    const today = new Date().getDay();
    const days = schoolDays();
    return days.includes(today) ? today : days[0] ?? 1;
  });                                         // a day number, or 'week'
  const [picking, setPicking] = useState(false);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');
  const [logs, setLogs] = useState([]);       // what this week's lessons covered (du_lesson_logs)
  const days = schoolDays().slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)); // Monday first

  const load = useCallback(async () => {
    setError(null);
    try {
      const [d, l] = await Promise.all([getTimetable(), getLessonLogs(dateOf(1), dateOf(0))]);
      setData(d); setLogs(l.logs);
      setView(prev => {
        if (prev && (prev.kind === 'class' ? d.classes : d.teachers).some(x => x.id === prev.id)) return prev;
        // Teachers open on their own lessons (or their class, for a class login); the head on the first year.
        if (user?.teacherId && d.teachers.some(t => t.id === user.teacherId)) return { kind: 'teacher', id: user.teacherId };
        if (user?.classId && d.classes.some(c => c.id === user.classId)) return { kind: 'class', id: user.classId };
        return d.classes[0] ? { kind: 'class', id: d.classes[0].id } : null;
      });
    } catch (err) { setError(err); }
    setLoading(false);
  }, [user]);
  useEffect(() => { load(); }, [load]);

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000); }
  const after = async msg => { setModal(null); await load(); if (msg) showToast(msg); };

  const title = 'Timetable';
  const subtitle = 'Periods, lessons and who teaches them';
  if (loading) return <Layout title={title} subtitle={subtitle}><LoadingState /></Layout>;
  if (error) return <Layout title={title} subtitle={subtitle}><ErrorState error={error} onRetry={load} /></Layout>;

  const { periods, lessons, classes, teachers } = data;
  const className = id => classes.find(c => c.id === id)?.name || '';
  const teacherName = id => teachers.find(t => t.id === id)?.name || '';
  const viewName = !view ? '' : view.kind === 'class' ? className(view.id) : teacherName(view.id);
  const weekCount = (kind, id) => lessons.filter(l => (kind === 'class' ? l.classId === id : l.teacherId === id)).length;

  // What's on in one period on one day, for the chosen class or teacher (a teacher's shared lesson is one entry).
  const slot = (p, d) => {
    if (!view) return [];
    return lessons.filter(l => l.periodId === p.id && l.day === d && (view.kind === 'class' ? l.classId === view.id : l.teacherId === view.id));
  };
  // Hifdh, Naazhirah and Qaa'idah are recorded child by child in Daily records, so there's no
  // "what the class covered" for them — a Qur'an class, or a lesson with one of those subjects.
  const individual = l => !!classes.find(c => c.id === l.classId)?.quranType || QURAN_SUBJECT.test(l.subject);
  // Who can fill in what a lesson covered: the head, the class's own login, or its teacher.
  const mayRecord = l => !individual(l) && (isOwner || (user?.classId ? user.classId === l.classId
    : !!user?.teacherId && (l.teacherId === user.teacherId || classes.find(c => c.id === l.classId)?.teacherId === user.teacherId)));
  const logOf = (l, date) => logs.find(x => x.classId === l.classId && x.date === date && x.subject === l.subject && x.kitaab === l.kitaab);
  // A lesson and any other class sharing it (same period and day, teacher, subject and book).
  const sharedWith = l => (l.teacherId ? lessons.filter(x => x.periodId === l.periodId && x.day === l.day && x.teacherId === l.teacherId
    && x.subject === l.subject && x.kitaab === l.kitaab) : [l]);
  const record = (found, d) => setModal({ kind: 'log', found, date: dateOf(d), log: logOf(found[0], dateOf(d)) });
  const open = (p, d, found) => {
    if (p.isBreak) return;
    // Teachers tap a lesson that's happened (today or earlier this week) to fill in what it covered.
    if (!isOwner) { if (found.length && dateOf(d) <= TODAY && mayRecord(found[0])) record(found, d); return; }
    const l = found[0];
    setModal({ kind: 'lesson', period: p, day: d, classId: l ? l.classId : view.kind === 'class' ? view.id : '', lesson: l || null,
      teacherId: l ? l.teacherId : view.kind === 'teacher' ? view.id : '' });
  };
  const lessonText = found => {
    if (!found.length) return null;
    const l = found[0];
    const who = view.kind === 'class'
      ? teacherName(l.teacherId)
      : found.map(x => className(x.classId)).join(' & ');
    return { main: l.subject, book: l.kitaab, who, room: l.room };
  };

  const dayCard = d => {
    const ps = periods.filter(p => runsOn(p, d));
    const taught = ps.filter(p => slot(p, d).length).length;
    return (
      <div className="card" key={d}>
        <div className="card-title" style={{ marginBottom: 2 }}>{viewName} — {DAY[d]} {niceDate(dateOf(d)).replace(/^\S+ /, '')}</div>
        <div className="card-sub" style={{ marginBottom: 12 }}>
          {ps.length ? `${hm(ps[0].starts)}–${hm(ps[ps.length - 1].ends)} · ${taught} ${taught === 1 ? 'lesson' : 'lessons'}` : 'No periods on this day'}
        </div>
        <div className="tt-lines">
          {ps.map(p => {
            if (p.isBreak) {
              return (
                <div key={p.id} className="tt-line break">
                  <span className="tt-time">{hm(p.starts)}<br />{hm(p.ends)}</span>
                  <span className="tt-body"><span className="tt-main">{p.name}</span></span>
                </div>
              );
            }
            const found = slot(p, d);
            const t = lessonText(found);
            const happened = t && dateOf(d) <= TODAY;
            const log = happened ? logOf(found[0], dateOf(d)) : null;
            const canRecord = happened && mayRecord(found[0]);
            const Row = isOwner || canRecord ? 'button' : 'div';
            return (
              <Row key={p.id} type={Row === 'button' ? 'button' : undefined} className={`tt-line ${t ? 'on' : 'free'}`} onClick={() => open(p, d, found)}>
                <span className="tt-time">{hm(p.starts)}<br />{hm(p.ends)}</span>
                <span className="tt-body">
                  {t ? <>
                    <span className="tt-main">{t.main}{t.book && t.book !== t.main ? <span className="tt-book"> · {t.book}</span> : null}</span>
                    <span className="tt-sub">{[t.who || (view.kind === 'class' ? 'No teacher yet' : ''), t.room].filter(Boolean).join(' · ')}{found.length > 1 ? ' · shared' : ''}</span>
                    {log && <span className="tt-covered"><CheckCircle2 size={12} /> {log.covered}</span>}
                  </> : <>
                    <span className="tt-main tt-free">{isOwner ? 'Free — tap to add a lesson' : 'Free'}</span>
                    <span className="tt-sub">{p.name}</span>
                  </>}
                </span>
                {isOwner && !t && <Plus size={15} className="tt-plus" />}
                {canRecord && !log && !isOwner && <span className="tt-record"><PenLine size={13} /> Record</span>}
              </Row>
            );
          })}
          {!ps.length && <div className="card-sub">Nothing on {DAY[d]}.</div>}
        </div>
      </div>
    );
  };

  // The whole week: periods down the side, days across (scrolls sideways inside the card on phones).
  const weekCard = () => (
    <div className="card">
      <div className="card-title" style={{ marginBottom: 2 }}>{viewName} — the whole week</div>
      <div className="card-sub" style={{ marginBottom: 12 }}>{isOwner ? 'Tap any lesson to change it' : 'Every period, every day'}</div>
      <div className="tt-week-wrap">
        <table className="tt-week">
          <thead><tr><th />{days.map(d => <th key={d}>{DAY3[d]}</th>)}</tr></thead>
          <tbody>
            {periods.map(p => (
              <tr key={p.id} className={p.isBreak ? 'break' : ''}>
                <th><span className="tt-week-name">{p.name}</span><span className="tt-week-time">{hm(p.starts)}–{hm(p.ends)}</span></th>
                {days.map(d => {
                  if (!runsOn(p, d)) return <td key={d} className="off" />;
                  if (p.isBreak) return <td key={d} className="off" />;
                  const found = slot(p, d);
                  const t = lessonText(found);
                  return (
                    <td key={d} className={t ? 'on' : ''} onClick={() => open(p, d, found)} style={{ cursor: isOwner ? 'pointer' : 'default' }}>
                      {t ? <><b>{t.main}</b><span>{t.who}</span></> : <span className="tt-free">{isOwner ? '+' : ''}</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <Layout title={title} subtitle={subtitle}>
      <div className="course-page">
        {!periods.length ? (
          isOwner ? (
            <div className="card">
              <div className="card-title" style={{ marginBottom: 6 }}><Clock size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />Set up your day first</div>
              <div className="card-sub" style={{ marginBottom: 14 }}>Your periods and breaks with their times — start from a typical day and change it, or add your own.</div>
              <div className="course-lines">
                <button type="button" className="line-row on" onClick={async () => { await addStarterPeriods(); after('A typical day added — change any time to suit you'); }}>
                  <span className="line-row-name">Use a typical day</span>
                  <span className="line-row-sub">7 periods, 8:00–15:00</span>
                </button>
                <button type="button" className="line-row add" onClick={() => setModal({ kind: 'period', period: null })}><Plus size={14} /> Add a period</button>
              </div>
            </div>
          ) : <div className="card"><div className="card-sub">The timetable hasn't been made yet.</div></div>
        ) : !view ? (
          <div className="card"><div className="card-sub">Add your classes first (Aalim course, or Classes & Teachers).</div></div>
        ) : (
          <>
            <div className="class-bar">
              <button type="button" className="class-bar-box" onClick={() => setPicking(true)}>
                <span className="class-bar-label">{view.kind === 'class' ? 'Class' : 'Teacher'}</span>
                <span className="class-bar-value">{viewName}<ChevronDown size={15} /></span>
              </button>
            </div>
            <div className="tt-days" style={{ gridTemplateColumns: `repeat(${days.length + 1}, minmax(0, 1fr))` }}>
              {days.map(d => (
                <button key={d} type="button" className={`tt-day ${day === d ? 'on' : ''}`} onClick={() => setDay(d)}>{DAY3[d]}</button>
              ))}
              <button type="button" className={`tt-day ${day === 'week' ? 'on' : ''}`} onClick={() => setDay('week')}>Week</button>
            </div>
            {day === 'week' ? <>
              <div className="tt-week-wide">{weekCard()}</div>
              {/* On phones the grid would be squashed — each day is its own card instead. */}
              <div className="tt-week-narrow">{days.map(d => dayCard(d))}</div>
            </> : dayCard(day)}
          </>
        )}

        {isOwner && periods.length > 0 && (
          <div className="card">
            <div className="card-title" style={{ marginBottom: 2 }}>Periods & times</div>
            <div className="card-sub" style={{ marginBottom: 12 }}>Your day in order · tap one to change it</div>
            <div className="course-lines">
              {periods.map(p => (
                <button key={p.id} type="button" className={`line-row ${p.isBreak ? 'tt-break-row' : ''}`} onClick={() => setModal({ kind: 'period', period: p })}>
                  <span className="tt-period-time">{hm(p.starts)}–{hm(p.ends)}</span>
                  <span className="line-row-name">{p.name}</span>
                  <span className="line-row-sub">{daysText(p.days, days)}</span>
                </button>
              ))}
              <button type="button" className="line-row add" onClick={() => setModal({ kind: 'period', period: null })}><Plus size={14} /> Add a period</button>
              {days.length > 1 && (
                <button type="button" className="line-row add" onClick={() => setModal({ kind: 'copy' })}><Copy size={13} /> Copy one day to other days</button>
              )}
            </div>
          </div>
        )}
      </div>

      {picking && (
        <ModalShell title="Show the timetable for" onClose={() => setPicking(false)} width={420}>
          <div className="tt-pick-head">Classes</div>
          <div className="course-lines">
            {classes.map(c => {
              const on = view?.kind === 'class' && view.id === c.id;
              return (
                <button key={c.id} type="button" className={`line-row ${on ? 'on' : ''}`} onClick={() => { setView({ kind: 'class', id: c.id }); setPicking(false); }}>
                  <span className="line-row-name">{c.name}</span>
                  <span className="line-row-sub">{weekCount('class', c.id)} a week</span>
                  {on && <Check size={15} />}
                </button>
              );
            })}
          </div>
          {teachers.length > 0 && <div className="tt-pick-head">Teachers</div>}
          <div className="course-lines">
            {teachers.map(t => {
              const on = view?.kind === 'teacher' && view.id === t.id;
              return (
                <button key={t.id} type="button" className={`line-row ${on ? 'on' : ''}`} onClick={() => { setView({ kind: 'teacher', id: t.id }); setPicking(false); }}>
                  <span className="line-row-name">{t.name}</span>
                  <span className="line-row-sub">{weekCount('teacher', t.id)} a week</span>
                  {on && <Check size={15} />}
                </button>
              );
            })}
          </div>
        </ModalShell>
      )}
      {modal?.kind === 'lesson' && (
        <LessonModal {...modal} data={data} days={days} className={className} teacherName={teacherName}
          date={dateOf(modal.day)} log={modal.lesson ? logOf(modal.lesson, dateOf(modal.day)) : null}
          canRecord={!!modal.lesson && mayRecord(modal.lesson)}
          onRecord={() => record(sharedWith(modal.lesson), modal.day)}
          onClose={() => setModal(null)} onSaved={after} />
      )}
      {modal?.kind === 'log' && (
        <LogModal {...modal} className={className} onClose={() => setModal(null)} onSaved={after} />
      )}
      {modal?.kind === 'period' && (
        <PeriodModal initial={modal.period} days={days} onClose={() => setModal(null)} onSaved={after}
          lessonCount={modal.period ? lessons.filter(l => l.periodId === modal.period.id).length : 0} />
      )}
      {modal?.kind === 'copy' && (
        <CopyModal days={days} from={day === 'week' ? days[0] : day} onClose={() => setModal(null)} onSaved={after} />
      )}
      {toast && <div className="toast">✓ {toast}</div>}
    </Layout>
  );
}

function ModalShell({ title, onClose, children, footer, width = 460 }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: width }}>
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button className="btn btn-icon" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

// Day boxes to tick — light blue when on.
function DayBoxes({ days, on, onToggle }) {
  return (
    <div className="tt-days" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`, marginBottom: 0 }}>
      {days.map(d => (
        <button key={d} type="button" className={`tt-day ${on.includes(d) ? 'on' : ''}`} onClick={() => onToggle(d)}>{DAY3[d]}</button>
      ))}
    </div>
  );
}

// One class's lesson in one period: pick one of that year's books (or type anything), its teacher,
// and the days it's on. Warns when the teacher is already teaching another class then — unless it's
// the same subject and book, which makes it one shared lesson.
function LessonModal({ period, day, classId: initialClass, lesson, teacherId: presetTeacher, data, days, className, teacherName, date, log, canRecord, onRecord, onClose, onSaved }) {
  const { lessons, subjects, classes, teachers } = data;
  const [classId, setClassId] = useState(initialClass);
  // The days this class already has the same lesson in this period — changed together.
  const sameDays = cid => (lesson ? lessons.filter(l => l.classId === cid && l.periodId === period.id && sameLesson(l, lesson)).map(l => l.day) : []);
  const [on, setOn] = useState(() => (lesson ? sameDays(initialClass) : [day]));
  const [f, setF] = useState({
    subjectId: lesson?.subjectId || '', subject: lesson?.subject || '', kitaab: lesson?.kitaab || '',
    teacherId: lesson?.teacherId || presetTeacher || '', room: lesson?.room || '',
  });
  const [other, setOther] = useState(!!lesson && !lesson.subjectId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const yearSubjects = subjects.filter(s => s.classId === classId);
  const toggle = d => setOn(prev => (prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]));
  const pick = s => { setOther(false); setError(''); setF(prev => ({ ...prev, subjectId: s.id, subject: s.subject, kitaab: s.kitaab, teacherId: s.teacherId || prev.teacherId })); };

  // Who else this teacher is with in this period on the chosen days.
  const notes = [];
  if (f.teacherId) {
    const shared = {}, clash = {};
    for (const d of on) {
      for (const l of lessons) {
        if (l.day !== d || l.periodId !== period.id || l.teacherId !== f.teacherId || l.classId === classId) continue;
        const same = l.subject === f.subject.trim() && l.kitaab === f.kitaab.trim();
        const key = same ? className(l.classId) : `${className(l.classId)} ${l.subject}`;
        (same ? shared : clash)[key] = [...((same ? shared : clash)[key] || []), DAY3[d]];
      }
    }
    Object.entries(shared).forEach(([k, ds]) => notes.push({ tone: 'blue', text: `Shared with ${k} (${ds.join(', ')}) — one lesson for both` }));
    Object.entries(clash).forEach(([k, ds]) => notes.push({ tone: 'red', text: `${teacherName(f.teacherId)} is already teaching ${k} then (${ds.join(', ')})` }));
  }

  async function run(body, msg) {
    setBusy(true); setError('');
    try { await saveLesson(body); await onSaved(msg); } catch (err) { setError(err.message || 'Something went wrong'); setBusy(false); }
  }
  const before = lesson ? sameDays(classId) : [];
  const save = () => run({
    classId, periodId: period.id, days: on, clearDays: before.filter(d => !on.includes(d)),
    subjectId: other ? '' : f.subjectId, subject: f.subject, kitaab: f.kitaab, teacherId: f.teacherId, room: f.room,
  }, 'Saved');
  const remove = () => run({ classId, periodId: period.id, days: [], clearDays: on }, 'Lesson removed');

  return (
    <ModalShell title={`${period.name} · ${hm(period.starts)}–${hm(period.ends)}`} onClose={onClose} width={480} footer={<>
      {lesson && <button className="btn" style={{ marginRight: 'auto', color: 'var(--red)' }} disabled={busy || !on.length} onClick={remove}><Trash2 size={13} /> Remove</button>}
      <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
      <button className="btn btn-teal" disabled={busy || !classId || !f.subject.trim() || !on.length} onClick={save}><Save size={13} /> {busy ? 'Saving…' : 'Save'}</button>
    </>}>
      {canRecord && date <= TODAY && (
        <button type="button" className={`line-row ${log ? 'on' : ''}`} style={{ marginBottom: 14 }} onClick={onRecord}>
          <PenLine size={14} /><span className="line-row-name">{log ? `Covered: ${log.covered}` : 'Record what this lesson covered'}</span>
          <span className="line-row-sub">{niceDate(date)}</span>
        </button>
      )}
      <div className="form-grid">
        {!initialClass ? (
          <div className="form-group">
            <label>Class <span className="required">*</span></label>
            <select value={classId} onChange={e => { setClassId(e.target.value); setF(prev => ({ ...prev, subjectId: '' })); }}>
              <option value="">— Choose —</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        ) : <div className="card-sub" style={{ marginBottom: 2 }}>{className(classId)}</div>}

        {classId && yearSubjects.length > 0 && (
          <div className="form-group">
            <label>{className(classId)}'s books</label>
            <div className="course-lines">
              {yearSubjects.map(s => (
                <button key={s.id} type="button" className={`line-row course-kitaab ${!other && f.subjectId === s.id ? 'on' : ''}`} onClick={() => pick(s)}>
                  <span className="course-kitaab-subject">{s.subject}</span>
                  <span className="line-row-name">{s.kitaab || s.subject}</span>
                </button>
              ))}
              <button type="button" className={`line-row ${other ? 'on' : 'add'}`} onClick={() => { setOther(true); setF(prev => ({ ...prev, subjectId: '' })); }}>
                Something else (e.g. Tajweed, GCSE Maths)
              </button>
            </div>
          </div>
        )}
        {classId && (other || !yearSubjects.length) && <>
          <div className="form-group">
            <label>Subject <span className="required">*</span></label>
            <input value={f.subject} onChange={e => setF({ ...f, subject: e.target.value })} placeholder="e.g. Tajweed, GCSE Maths" />
          </div>
          <div className="form-group">
            <label>Book</label>
            <input value={f.kitaab} onChange={e => setF({ ...f, kitaab: e.target.value })} placeholder="Optional" />
          </div>
        </>}
        <div className="form-group">
          <label>Taught by</label>
          <select value={f.teacherId} onChange={e => setF({ ...f, teacherId: e.target.value })}>
            <option value="">— Not chosen yet —</option>
            {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Room</label>
          <input value={f.room} onChange={e => setF({ ...f, room: e.target.value })} placeholder="Optional, e.g. Room 3" />
        </div>
        <div className="form-group">
          <label>On these days</label>
          <DayBoxes days={days.filter(d => runsOn(period, d))} on={on} onToggle={toggle} />
        </div>
      </div>
      {notes.map((n, i) => (
        <div key={i} className={`tt-note ${n.tone}`}>{n.text}</div>
      ))}
      {error && <div style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 10 }}>{error}</div>}
    </ModalShell>
  );
}

function PeriodModal({ initial, days, lessonCount, onClose, onSaved }) {
  const [f, setF] = useState({
    name: initial?.name || '', starts: initial?.starts || '', ends: initial?.ends || '',
    isBreak: !!initial?.isBreak, days: initial?.days?.length ? initial.days : days,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sure, setSure] = useState(false);
  const set = (k, v) => { setError(''); setF(prev => ({ ...prev, [k]: v })); };
  const toggle = d => set('days', f.days.includes(d) ? f.days.filter(x => x !== d) : [...f.days, d]);

  async function run(fn, msg) {
    setBusy(true); setError('');
    try { await fn(); await onSaved(msg); } catch (err) { setError(err.message || 'Something went wrong'); setBusy(false); }
  }
  // Every day ticked is stored as "every day", so a school day added later is included too.
  const save = () => run(() => savePeriod({ id: initial?.id, ...f, days: days.every(d => f.days.includes(d)) ? [] : f.days }), initial ? 'Saved' : `${f.name.trim()} added`);
  const remove = () => run(() => deletePeriod(initial.id), `${initial.name} removed`);
  const losing = initial && !initial.isBreak && f.isBreak && lessonCount > 0;

  return (
    <ModalShell title={initial ? `Edit — ${initial.name}` : 'Add a period'} onClose={onClose} footer={<>
      {initial && (sure
        ? <button className="btn" style={{ marginRight: 'auto', background: 'var(--red)', color: '#fff' }} disabled={busy} onClick={remove}>Yes, remove it{lessonCount ? ` and its ${lessonCount} lessons` : ''}</button>
        : <button className="btn" style={{ marginRight: 'auto', color: 'var(--red)' }} disabled={busy} onClick={() => setSure(true)}><Trash2 size={13} /> Remove</button>)}
      <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
      <button className="btn btn-teal" disabled={busy || !f.name.trim() || !f.starts || !f.ends || !f.days.length} onClick={save}><Save size={13} /> {busy ? 'Saving…' : 'Save'}</button>
    </>}>
      <div className="form-grid">
        <div className="form-group">
          <label>Name <span className="required">*</span></label>
          <input value={f.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Period 1, Break, Lunch & Zuhr" autoFocus={!initial} />
        </div>
        <div className="tt-two">
          <div className="form-group"><label>Starts</label><input type="time" value={f.starts} onChange={e => set('starts', e.target.value)} /></div>
          <div className="form-group"><label>Ends</label><input type="time" value={f.ends} onChange={e => set('ends', e.target.value)} /></div>
        </div>
        <div className="form-group">
          <label>Is it</label>
          <div className="tt-days" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', marginBottom: 0 }}>
            <button type="button" className={`tt-day ${!f.isBreak ? 'on' : ''}`} onClick={() => set('isBreak', false)}>Lessons</button>
            <button type="button" className={`tt-day ${f.isBreak ? 'on' : ''}`} onClick={() => set('isBreak', true)}>A break</button>
          </div>
        </div>
        <div className="form-group">
          <label>On these days</label>
          <DayBoxes days={days} on={f.days} onToggle={toggle} />
        </div>
      </div>
      {losing && <div className="tt-note red">Making it a break takes off its {lessonCount} lessons.</div>}
      {error && <div style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 10 }}>{error}</div>}
    </ModalShell>
  );
}

// Copies every class's lessons on one day to other days (e.g. fill Monday, then copy it to the rest).
function CopyModal({ days, from: initialFrom, onClose, onSaved }) {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setBusy(true); setError('');
    try { const r = await copyTimetableDay(from, to); await onSaved(`${DAY[from]} copied · ${r.copied} lessons`); }
    catch (err) { setError(err.message || 'Something went wrong'); setBusy(false); }
  };
  return (
    <ModalShell title="Copy one day to other days" onClose={onClose} footer={<>
      <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
      <button className="btn btn-teal" disabled={busy || !to.length} onClick={save}><Copy size={13} /> {busy ? 'Copying…' : 'Copy'}</button>
    </>}>
      <div className="form-grid">
        <div className="form-group">
          <label>Copy</label>
          <DayBoxes days={days} on={[from]} onToggle={d => { setFrom(d); setTo(prev => prev.filter(x => x !== d)); }} />
        </div>
        <div className="form-group">
          <label>To</label>
          <DayBoxes days={days.filter(d => d !== from)} on={to} onToggle={d => setTo(prev => (prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]))} />
        </div>
      </div>
      <div className="tt-note red">Every class's lessons on {to.length ? to.map(d => DAY[d]).join(', ') : 'those days'} are replaced by {DAY[from]}'s.</div>
      {error && <div style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 10 }}>{error}</div>}
    </ModalShell>
  );
}

// What one lesson covered on one day — for the whole class (an Aalim year goes through its books
// together); a shared lesson is recorded for every class in it. Shows last time's, to carry on from.
function LogModal({ found, date, log, className, onClose, onSaved }) {
  const l = found[0];
  const [covered, setCovered] = useState(log?.covered || '');
  const [notes, setNotes] = useState(log?.notes || '');
  const [last, setLast] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    getBookLogs(l.classId, l.subject, l.kitaab).then(r => setLast(r.logs.find(x => x.date < date) || null)).catch(() => {});
  }, [l.classId, l.subject, l.kitaab, date]);
  async function run(c, msg) {
    setBusy(true); setError('');
    try {
      await saveLessonLog({ classIds: found.map(x => x.classId), date, subjectId: l.subjectId, subject: l.subject, kitaab: l.kitaab, covered: c, notes });
      await onSaved(msg);
    } catch (err) { setError(err.message || 'Something went wrong'); setBusy(false); }
  }
  return (
    <ModalShell title={`${l.subject}${l.kitaab && l.kitaab !== l.subject ? ` · ${l.kitaab}` : ''}`} onClose={onClose} footer={<>
      {log && <button className="btn" style={{ marginRight: 'auto', color: 'var(--red)' }} disabled={busy} onClick={() => run('', 'Cleared')}><Trash2 size={13} /> Clear</button>}
      <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
      <button className="btn btn-teal" disabled={busy || !covered.trim()} onClick={() => run(covered, 'Saved')}><Save size={13} /> {busy ? 'Saving…' : 'Save'}</button>
    </>}>
      <div className="card-sub" style={{ marginBottom: 12 }}>{found.map(x => className(x.classId)).join(' & ')} · {niceDate(date)}</div>
      {last && <div className="tt-note blue" style={{ marginTop: 0, marginBottom: 12 }}>Last time ({niceDate(last.date)}): {last.covered}</div>}
      <div className="form-grid">
        <div className="form-group">
          <label>What did the class cover? <span className="required">*</span></label>
          <input value={covered} onChange={e => setCovered(e.target.value)} placeholder="e.g. Pages 34–36, or Bab as-Salah" autoFocus />
        </div>
        <div className="form-group">
          <label>Notes for the head</label>
          <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional — e.g. went over last lesson again" />
        </div>
      </div>
      {error && <div style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 10 }}>{error}</div>}
    </ModalShell>
  );
}
