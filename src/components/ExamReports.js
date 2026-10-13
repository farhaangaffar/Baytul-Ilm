import React, { useState, useEffect, useCallback } from 'react';
import Layout from './Layout';
import { LoadingState, ErrorState } from './DataState';
import { getExams, getExam } from '../lib/store';
import { buildReportCards } from '../lib/reportCardPdf';
import { downloadPdfBytes } from '../lib/reportPdf';
import { CardModal } from '../pages/Exams';
import { ChevronDown, Check, X, Download } from 'lucide-react';

// The Reports page for a Darul Uloom: its reports are its exam report cards (no monthly summaries).
// Choose the exam and the class; each child is a line — Ready once every paper is marked and the
// class teacher has written their comment — tap one to write it (or "Write it for me") and get the PDF.
const num = v => (Number.isInteger(Number(v)) ? String(Number(v)) : Number(v).toFixed(1));
const monthYear = s => new Date(`${s}T12:00:00`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });

function Picker({ title, items, active, onPick, onClose }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button className="btn btn-icon" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body course-lines">
          {items.map(i => (
            <button key={i.key} type="button" className={`line-row ${i.key === active ? 'on' : ''}`} onClick={() => { onPick(i.key); onClose(); }}>
              <span className="line-row-name">{i.label}</span>
              {i.sub && <span className="line-row-sub">{i.sub}</span>}
              {i.key === active && <Check size={15} />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ExamReports() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exams, setExams] = useState([]);
  const [examId, setExamId] = useState('');
  const [detail, setDetail] = useState(null);
  const [className, setClassName] = useState('');
  const [picking, setPicking] = useState('');
  const [card, setCard] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const l = await getExams();
      setExams(l.exams);
      const today = new Date().toISOString().slice(0, 10);
      // Open on the latest exam that's been held (else the first).
      const id = examId && l.exams.some(e => e.id === examId) ? examId
        : (l.exams.find(e => e.heldOn && e.heldOn <= today) || l.exams[0])?.id || '';
      setExamId(id);
      if (id) {
        const d = await getExam(id);
        setDetail(d);
        setClassName(prev => (d.classes.some(c => c.name === prev) ? prev : d.classes[0]?.name || ''));
      } else setDetail(null);
    } catch (err) { setError(err); }
    setLoading(false);
  }, [examId]);
  useEffect(() => { load(); }, [load]);

  const title = 'Reports';
  const subtitle = 'One report per exam — marks, attendance, behaviour and comments';
  if (loading) return <Layout title={title} subtitle={subtitle}><LoadingState /></Layout>;
  if (error) return <Layout title={title} subtitle={subtitle}><ErrorState error={error} onRetry={load} /></Layout>;
  if (!detail) {
    return (
      <Layout title={title} subtitle={subtitle}>
        <div className="card"><div className="card-sub">Reports come with each exam. Add an exam on the Exams page, enter its marks, then write each child's report here.</div></div>
      </Layout>
    );
  }

  const { exam, papers, students, marks, comments, results, attendance } = detail;
  const cls = detail.classes.find(c => c.name === className) || detail.classes[0];
  const classPapers = cls ? papers.filter(p => p.classId === cls.id) : [];
  const kids = cls ? students.filter(s => s.class === cls.name) : [];
  const cm = id => comments.find(c => c.studentId === id) || {};
  const ready = s => results[s.id]?.complete && !!cm(s.id).teacherComment;
  const cardFor = s => ({
    student: s, exam, result: results[s.id], teacherComment: cm(s.id).teacherComment || '', headComment: cm(s.id).headComment || '', teacherName: cls.teacherName || '',
    behavior: cm(s.id).behavior || '', attendance: attendance[s.id] || { present: 0, late: 0, absent: 0 },
    papers: classPapers.map(p => { const m = marks.find(x => x.paperId === p.id && x.studentId === s.id); return { ...p, mark: m ? m.mark : null, absent: !!m?.absent }; }),
  });
  const done = kids.filter(ready).length;
  async function printAll() {
    setBusy(true);
    try { downloadPdfBytes(await buildReportCards(kids.map(cardFor)), `Reports_${cls.name}_${exam.name}.pdf`.replace(/\s+/g, '_')); }
    catch { setToast('Could not make the PDF'); setTimeout(() => setToast(''), 3000); }
    setBusy(false);
  }

  return (
    <Layout title={title} subtitle={subtitle}>
      <div className="course-page">
        <div className="class-bar two">
          <button type="button" className="class-bar-box" onClick={() => setPicking('exam')}>
            <span className="class-bar-label">Exam</span>
            <span className="class-bar-value">{exam.name}<ChevronDown size={15} /></span>
          </button>
          <button type="button" className="class-bar-box" onClick={() => setPicking('class')}>
            <span className="class-bar-label">Class</span>
            <span className="class-bar-value">{cls?.name || 'Choose'}<ChevronDown size={15} /></span>
          </button>
        </div>

        {cls && (
          <div className="card">
            <div className="card-title" style={{ marginBottom: 2 }}>{cls.name} — {done} of {kids.length} ready</div>
            <div className="card-sub" style={{ marginBottom: 12 }}>
              Ready once every paper is marked and the class teacher's comment is written · tap a child to write it
            </div>
            <div className="course-lines">
              {kids.map(s => {
                const r = results[s.id];
                const ok = ready(s);
                return (
                  <button key={s.id} type="button" className="line-row" onClick={() => setCard(cardFor(s))}>
                    <span className="course-kitaab-main">
                      <span className="line-row-name">{s.forename} {s.surname}</span>
                      <span className="line-row-sub">
                        {!r?.marked ? 'No marks yet' : [r.pct !== null && `${num(r.pct)}%`, r.grade, r.complete && r.position && `${r.position} of ${r.of}`].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className={`exam-tag ${ok ? 'green' : 'amber'}`}>{ok ? 'Ready' : !r?.complete ? 'Marks missing' : 'Not written'}</span>
                  </button>
                );
              })}
              {!kids.length && <div className="card-sub">No children in {cls.name}.</div>}
              {kids.length > 0 && (
                <button type="button" className="line-row add" disabled={busy} onClick={printAll}>
                  <Download size={14} /> {busy ? 'Making the PDF…' : `Print the whole class (one PDF of ${kids.length})`}
                </button>
              )}
            </div>
          </div>
        )}
        <div className="card-sub" style={{ textAlign: 'center' }}>
          {exam.published ? 'Published — each family sees their own child\'s report in the parent portal.' : 'Not published yet — publish it on the Exams page when the reports are ready.'}
        </div>
      </div>

      {picking === 'exam' && <Picker title="Choose an exam" active={examId} onClose={() => setPicking('')}
        items={exams.map(e => ({ key: e.id, label: e.name, sub: e.heldOn ? monthYear(e.heldOn) : '' }))}
        onPick={id => { setLoading(true); setExamId(id); }} />}
      {picking === 'class' && <Picker title="Choose a class" active={cls?.name} onClose={() => setPicking('')}
        items={detail.classes.filter(c => c.results).map(c => ({ key: c.name, label: c.name,
          sub: `${students.filter(s => s.class === c.name && results[s.id]?.complete && cm(s.id).teacherComment).length} of ${students.filter(s => s.class === c.name).length} ready` }))}
        onPick={setClassName} />}
      {card && <CardModal card={card} canTeacher canHead onClose={() => setCard(null)}
        onSaved={async msg => { setCard(null); await load(); setToast(msg); setTimeout(() => setToast(''), 3000); }} />}
      {toast && <div className="toast">✓ {toast}</div>}
    </Layout>
  );
}
