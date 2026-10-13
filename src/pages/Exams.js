// pages/Exams.js — a Darul Uloom's exams and report cards (server/routes/exams.js). The head adds an
// exam (its name, marks out of and pass mark — each madrasah's own — and which classes sit it); each
// class's papers start as its books. Teachers enter marks for their papers; the class teacher and the
// head write each child's comments; results (%, grade, position, passed / resit) and report-card PDFs
// follow. "Publish to parents" puts the report cards in the parent portal.
import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import { LoadingState, ErrorState } from '../components/DataState';
import ClassBar from '../components/ClassBar';
import PickField from '../components/PickField';
import BoxRow from '../components/BoxRow';
import {
  getExams, getExam, saveExam, deleteExam, publishExam, saveExamPaper, deleteExamPaper, saveExamMarks, saveExamComment,
  currentSchoolYear,
} from '../lib/store';
import { downloadPdfBytes } from '../lib/reportPdf';
import { buildReportCards } from '../lib/reportCardPdf';
import { useAuth } from '../lib/AuthContext';
import { Plus, X, Save, Trash2, ChevronLeft, Pencil, Download, Send, Check, ClipboardList } from 'lucide-react';

const EXAM_NAMES = ['Monthly test', 'Mid-term exam', 'Half-yearly exam', 'Annual exam', 'End of year exam'];
const num = v => (Number.isInteger(Number(v)) ? String(Number(v)) : Number(v).toFixed(1));
const ordinal = n => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) || n % 10 > 3 ? 0 : n % 10]}`;
const monthYear = s => new Date(`${s}T12:00:00`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });

export default function Exams() {
  const { isOwner } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [list, setList] = useState(null);
  const [examId, setExamId] = useState('');
  const [detail, setDetail] = useState(null);
  const [className, setClassName] = useState('');
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const l = await getExams();
      setList(l);
      if (examId) {
        const d = await getExam(examId);
        setDetail(d);
        setClassName(prev => (d.classes.some(c => c.name === prev) ? prev : d.classes[0]?.name || ''));
      } else setDetail(null);
    } catch (err) { setError(err); }
    setLoading(false);
  }, [examId]);
  useEffect(() => { load(); }, [load]);

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000); }
  const after = async msg => { setModal(null); await load(); if (msg) showToast(msg); };

  const title = 'Exams';
  const subtitle = 'Marks, results and report cards';
  if (loading) return <Layout title={title} subtitle={subtitle}><LoadingState /></Layout>;
  if (error) return <Layout title={title} subtitle={subtitle}><ErrorState error={error} onRetry={load} /></Layout>;
  const { exams, classes, teachers } = list;
  const teacherName = id => teachers.find(t => t.id === id)?.name || '';

  // ── All exams ──
  if (!examId || !detail) {
    return (
      <Layout title={title} subtitle={subtitle}>
        <div className="course-page">
          <div className="card">
            <div className="card-title" style={{ marginBottom: 2 }}><ClipboardList size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />Exams</div>
            <div className="card-sub" style={{ marginBottom: 12 }}>{exams.length ? 'Newest first · tap an exam to enter marks and see results' : isOwner ? 'Add your first exam — its papers come from each year\'s books' : 'No exams yet.'}</div>
            <div className="course-lines">
              {exams.map(e => (
                <button key={e.id} type="button" className="line-row" onClick={() => { setLoading(true); setExamId(e.id); }}>
                  <span className="course-kitaab-main">
                    <span className="line-row-name">{e.name}</span>
                    <span className="line-row-sub">
                      {[e.heldOn && monthYear(e.heldOn), `${e.classIds.length} ${e.classIds.length === 1 ? 'class' : 'classes'}`,
                        isOwner ? `${e.marksIn} of ${e.marksExpected} marks in` : `${e.myPapers} ${e.myPapers === 1 ? 'paper' : 'papers'}`].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  {e.published && <span className="exam-tag green">Published</span>}
                </button>
              ))}
              {isOwner && (
                <button type="button" className="line-row add" onClick={async () => setModal({ kind: 'exam', exam: null, year: await currentSchoolYear().catch(() => list.currentYear) })}>
                  <Plus size={14} /> Add an exam
                </button>
              )}
            </div>
          </div>
        </div>
        {modal?.kind === 'exam' && <ExamModal initial={modal.exam} year={modal.year} classes={classes} onClose={() => setModal(null)}
          onSaved={async (msg, id) => { setModal(null); if (id) { setLoading(true); setExamId(id); } else await load(); showToast(msg); }} />}
        {toast && <div className="toast">✓ {toast}</div>}
      </Layout>
    );
  }

  // ── One exam ──
  const { exam, papers, students, marks, comments, results } = detail;
  const cls = detail.classes.find(c => c.name === className) || detail.classes[0];
  const classPapers = cls ? papers.filter(p => p.classId === cls.id) : [];
  const kids = cls ? students.filter(s => s.class === cls.name) : [];
  const markOf = (paperId, sid) => marks.find(m => m.paperId === paperId && m.studentId === sid);
  const entered = p => kids.filter(s => { const m = markOf(p.id, s.id); return m && (m.mark !== null || m.absent); }).length;
  const ranked = kids.slice().sort((a, b) => {
    const ra = results[a.id], rb = results[b.id];
    return (ra?.position ?? 999) - (rb?.position ?? 999) || (rb?.pct ?? -1) - (ra?.pct ?? -1);
  });
  const cardFor = s => {
    const cm = comments.find(c => c.studentId === s.id) || {};
    return {
      student: s, exam, result: results[s.id], teacherComment: cm.teacherComment || '', headComment: cm.headComment || '',
      teacherName: teacherName(classes.find(c => c.id === cls.id)?.teacherId),
      papers: classPapers.map(p => { const m = markOf(p.id, s.id); return { ...p, mark: m ? m.mark : null, absent: !!m?.absent }; }),
    };
  };
  async function downloadAll() {
    setBusy('all');
    try { downloadPdfBytes(await buildReportCards(ranked.map(cardFor)), `Report_cards_${cls.name}_${exam.name}.pdf`.replace(/\s+/g, '_')); }
    catch (err) { showToast(err.message || 'Could not make the PDF'); }
    setBusy('');
  }

  return (
    <Layout title={title} subtitle={subtitle}>
      <div className="course-page">
        <button type="button" className="line-row add" style={{ marginBottom: 14 }} onClick={() => { setExamId(''); setDetail(null); }}>
          <ChevronLeft size={15} /> All exams
        </button>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 2 }}>{exam.name}</div>
          <div className="card-sub" style={{ marginBottom: isOwner ? 12 : 0 }}>
            {[exam.heldOn && monthYear(exam.heldOn), `Marked out of ${exam.outOf}`, `pass mark ${num(exam.passMark)}`].filter(Boolean).join(' · ')}
          </div>
          {isOwner && (
            <div className="course-open-actions">
              <button type="button" className="line-row add" onClick={() => setModal({ kind: 'exam', exam })}><Pencil size={13} /> Edit exam</button>
              <button type="button" className={`line-row ${exam.published ? 'on' : 'add'}`}
                onClick={async () => { await publishExam(exam.id, !exam.published); after(exam.published ? 'Taken back from parents' : 'Published — parents can see the report cards'); }}>
                {exam.published ? <><Check size={14} /> Published to parents</> : <><Send size={13} /> Publish to parents</>}
              </button>
            </div>
          )}
        </div>

        {detail.classes.length > 0 && (
          <ClassBar classes={detail.classes.map(c => c.name)} active={cls?.name} onPick={setClassName}
            notes={Object.fromEntries(detail.classes.map(c => [c.name, `${papers.filter(p => p.classId === c.id).length} papers`]))} />
        )}

        {cls && (
          <div className="card">
            <div className="card-title" style={{ marginBottom: 2 }}>Papers — {cls.name}</div>
            <div className="card-sub" style={{ marginBottom: 12 }}>Tap a paper to enter its marks</div>
            <div className="course-lines">
              {classPapers.map(p => {
                const n = entered(p);
                return (
                  <button key={p.id} type="button" className="line-row course-kitaab" onClick={() => setModal({ kind: 'marks', paper: p })}>
                    <span className="course-kitaab-subject">{p.subject}</span>
                    <span className="course-kitaab-main">
                      <span className="line-row-name">{p.kitaab && p.kitaab !== p.subject ? p.kitaab : p.subject}</span>
                      <span className="line-row-sub">{[teacherName(p.teacherId), `out of ${p.outOf}`].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className={`exam-tag ${n === kids.length && kids.length ? 'green' : ''}`}>{n}/{kids.length}</span>
                  </button>
                );
              })}
              {!classPapers.length && <div className="card-sub">No papers yet{isOwner ? ' — add one below.' : '.'}</div>}
              {isOwner && (
                <button type="button" className="line-row add" onClick={() => setModal({ kind: 'paper', paper: { examId: exam.id, classId: cls.id, subject: '', kitaab: '', teacherId: '', outOf: exam.outOf } })}>
                  <Plus size={14} /> Add a paper
                </button>
              )}
            </div>
          </div>
        )}

        {cls?.results && (
          <div className="card">
            <div className="card-title" style={{ marginBottom: 2 }}>Results — {cls.name}</div>
            <div className="card-sub" style={{ marginBottom: 12 }}>Tap a child for their report card and comments</div>
            <div className="course-lines">
              {ranked.map(s => {
                const r = results[s.id];
                return (
                  <button key={s.id} type="button" className="line-row" onClick={() => setModal({ kind: 'card', student: s })}>
                    <span className="course-num">{r?.position ?? '–'}</span>
                    <span className="line-row-name">{s.forename} {s.surname}</span>
                    <span className="line-row-sub">{r?.pct === null || !r ? 'No marks yet' : `${num(r.pct)}% · ${r.grade}`}</span>
                    {r?.result && <span className={`exam-tag ${r.result === 'Passed' ? 'green' : r.result === 'Resit' ? 'red' : ''}`}>{r.result === 'Not finished' ? `${r.marked}/${r.papers}` : r.result}</span>}
                  </button>
                );
              })}
              {!kids.length && <div className="card-sub">No children in {cls.name}.</div>}
              {kids.length > 0 && (
                <button type="button" className="line-row add" disabled={!!busy} onClick={downloadAll}>
                  <Download size={14} /> {busy === 'all' ? 'Making the PDF…' : `Download all ${kids.length} report cards`}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {modal?.kind === 'exam' && <ExamModal initial={modal.exam} classes={classes} onClose={() => setModal(null)}
        onSaved={async (msg, id, deleted) => { setModal(null); if (deleted) { setExamId(''); setDetail(null); } await load(); showToast(msg); }} />}
      {modal?.kind === 'paper' && <PaperModal initial={modal.paper} teachers={teachers} onClose={() => setModal(null)} onSaved={after} />}
      {modal?.kind === 'marks' && <MarksModal paper={modal.paper} className={cls.name} kids={kids} markOf={markOf} onClose={() => setModal(null)} onSaved={after} />}
      {modal?.kind === 'card' && <CardModal card={cardFor(modal.student)} canTeacher={!!cls.results} canHead={isOwner}
        onClose={() => setModal(null)} onSaved={after} />}
      {toast && <div className="toast">✓ {toast}</div>}
    </Layout>
  );
}

function ModalShell({ title, sub, onClose, children, footer, width = 460 }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: width }}>
        <div className="modal-header">
          <div style={{ minWidth: 0 }}>
            <div className="modal-title">{title}</div>
            {sub && <div className="card-sub" style={{ marginTop: 2 }}>{sub}</div>}
          </div>
          <button className="btn btn-icon" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
const Err = ({ text }) => (text ? <div style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 10 }}>{text}</div> : null);

// Adds or changes an exam: name, date, marks out of, pass mark and the classes that sit it.
function ExamModal({ initial, year, classes, onClose, onSaved }) {
  const isNew = !initial;
  const [f, setF] = useState({
    name: initial?.name || '', heldOn: initial?.heldOn || '', outOf: String(initial?.outOf ?? 100), passMark: String(initial?.passMark ?? 35),
    classIds: initial?.classIds || classes.filter(c => c.courseOrder).map(c => c.id),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sure, setSure] = useState(false);
  const set = (k, v) => { setError(''); setF(prev => ({ ...prev, [k]: v })); };
  const toggle = id => set('classIds', f.classIds.includes(id) ? f.classIds.filter(x => x !== id) : [...f.classIds, id]);
  const dropped = initial ? initial.classIds.filter(id => !f.classIds.includes(id)) : [];
  async function run(fn) { setBusy(true); setError(''); try { await fn(); } catch (err) { setError(err.message || 'Something went wrong'); setBusy(false); } }
  const save = () => run(async () => {
    const r = await saveExam({ id: initial?.id, year: initial?.year || year, ...f, outOf: Number(f.outOf), passMark: Number(f.passMark) });
    await onSaved(isNew ? `${f.name.trim()} added — enter marks paper by paper` : 'Saved', isNew ? r.id : null);
  });
  const remove = () => run(async () => { await deleteExam(initial.id); await onSaved(`${initial.name} deleted`, null, true); });
  return (
    <ModalShell title={isNew ? 'Add an exam' : `Edit — ${initial.name}`} onClose={onClose} footer={<>
      {!isNew && (sure
        ? <button className="btn" style={{ marginRight: 'auto', background: 'var(--red)', color: '#fff' }} disabled={busy} onClick={remove}>Yes, delete it and its marks</button>
        : <button className="btn" style={{ marginRight: 'auto', color: 'var(--red)' }} disabled={busy} onClick={() => setSure(true)}><Trash2 size={13} /> Delete</button>)}
      <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
      <button className="btn btn-teal" disabled={busy || !f.name.trim() || !f.classIds.length} onClick={save}><Save size={13} /> {busy ? 'Saving…' : isNew ? 'Add exam' : 'Save'}</button>
    </>}>
      <div className="form-grid">
        <div className="form-group">
          <label>Name <span className="required">*</span></label>
          <PickField value={f.name} onChange={v => set('name', v)} options={EXAM_NAMES} placeholder="e.g. Half-yearly exam" autoFocus={isNew} />
        </div>
        <div className="form-group"><label>Date</label><input type="date" value={f.heldOn} onChange={e => set('heldOn', e.target.value)} /></div>
        <div className="tt-two">
          <div className="form-group"><label>Each paper out of</label><input type="number" inputMode="numeric" min="1" value={f.outOf} onChange={e => set('outOf', e.target.value)} /></div>
          <div className="form-group"><label>Pass mark</label><input type="number" inputMode="decimal" min="0" value={f.passMark} onChange={e => set('passMark', e.target.value)} /></div>
        </div>
        <div className="form-group">
          <label>Who sits it</label>
          <div className="exam-classes">
            {classes.map(c => (
              <button key={c.id} type="button" className={`tt-day ${f.classIds.includes(c.id) ? 'on' : ''}`} onClick={() => toggle(c.id)}>{c.name}</button>
            ))}
          </div>
        </div>
      </div>
      {isNew && <div className="tt-note blue">Each class's papers start as its books on the Aalim course page — add or change them after.</div>}
      {dropped.length > 0 && <div className="tt-note red">Taking a class out removes its papers and any marks entered for them.</div>}
      <Err text={error} />
    </ModalShell>
  );
}

function PaperModal({ initial, teachers, onClose, onSaved }) {
  const isNew = !initial.id;
  const [f, setF] = useState({ subject: initial.subject, kitaab: initial.kitaab, teacherId: initial.teacherId || '', outOf: String(initial.outOf) });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run(fn, msg) { setBusy(true); setError(''); try { await fn(); await onSaved(msg); } catch (err) { setError(err.message || 'Something went wrong'); setBusy(false); } }
  return (
    <ModalShell title={isNew ? 'Add a paper' : `Edit — ${initial.subject}`} onClose={onClose} footer={<>
      {!isNew && <button className="btn" style={{ marginRight: 'auto', color: 'var(--red)' }} disabled={busy} onClick={() => run(() => deleteExamPaper(initial.id), 'Paper removed')}><Trash2 size={13} /> Remove</button>}
      <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
      <button className="btn btn-teal" disabled={busy || !f.subject.trim()} onClick={() => run(() => saveExamPaper({ ...initial, ...f, outOf: Number(f.outOf) }), isNew ? 'Paper added' : 'Saved')}>
        <Save size={13} /> {busy ? 'Saving…' : 'Save'}
      </button>
    </>}>
      <div className="form-grid">
        <div className="form-group"><label>Subject <span className="required">*</span></label><input value={f.subject} onChange={e => setF({ ...f, subject: e.target.value })} placeholder="e.g. Hifdh, Tajweed, Nahw" autoFocus={isNew} /></div>
        <div className="form-group"><label>Book or part</label><input value={f.kitaab} onChange={e => setF({ ...f, kitaab: e.target.value })} placeholder="Optional, e.g. Juz 1–5" /></div>
        <div className="form-group">
          <label>Marked by</label>
          <select value={f.teacherId} onChange={e => setF({ ...f, teacherId: e.target.value })}>
            <option value="">— Not chosen yet —</option>
            {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="form-group"><label>Out of</label><input type="number" inputMode="numeric" min="1" value={f.outOf} onChange={e => setF({ ...f, outOf: e.target.value })} /></div>
      </div>
      <Err text={error} />
    </ModalShell>
  );
}

// One paper's marks for the whole class: a box per child, or Absent.
function MarksModal({ paper, className, kids, markOf, onClose, onSaved }) {
  const [rows, setRows] = useState(() => Object.fromEntries(kids.map(s => {
    const m = markOf(paper.id, s.id);
    return [s.id, { mark: m && m.mark !== null ? String(m.mark) : '', absent: !!m?.absent }];
  })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (id, v) => { setError(''); setRows(prev => ({ ...prev, [id]: { ...prev[id], ...v } })); };
  const bad = kids.filter(s => { const v = rows[s.id].mark; return v !== '' && !(Number(v) >= 0 && Number(v) <= paper.outOf); });
  const done = kids.filter(s => rows[s.id].absent || rows[s.id].mark !== '').length;
  async function save() {
    setBusy(true); setError('');
    try {
      await saveExamMarks(paper.id, kids.map(s => ({ studentId: s.id, mark: rows[s.id].absent || rows[s.id].mark === '' ? null : Number(rows[s.id].mark), absent: rows[s.id].absent })));
      await onSaved(`${paper.subject} marks saved`);
    } catch (err) { setError(err.message || 'Something went wrong'); setBusy(false); }
  }
  return (
    <ModalShell title={`${paper.subject}${paper.kitaab && paper.kitaab !== paper.subject ? ` · ${paper.kitaab}` : ''}`}
      sub={`${className} · out of ${paper.outOf} · pass ${num(paper.passMark)} · ${done} of ${kids.length} entered`} onClose={onClose} width={480} footer={<>
      <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
      <button className="btn btn-teal" disabled={busy || bad.length > 0} onClick={save}><Save size={13} /> {busy ? 'Saving…' : 'Save marks'}</button>
    </>}>
      <div className="course-lines">
        {kids.map(s => {
          const r = rows[s.id];
          const v = r.mark === '' ? null : Number(r.mark);
          const fail = !r.absent && v !== null && v < paper.passMark;
          return (
            <div key={s.id} className={`exam-mark-row ${bad.includes(s) ? 'bad' : ''}`}>
              <span className="line-row-name">{s.forename} {s.surname}</span>
              <input type="number" inputMode="decimal" min="0" max={paper.outOf} step="0.5" value={r.absent ? '' : r.mark} disabled={r.absent}
                className={fail ? 'fail' : ''} onChange={e => set(s.id, { mark: e.target.value })} placeholder="—" aria-label={`${s.forename}'s mark`} />
              <button type="button" className={`tt-day exam-absent ${r.absent ? 'on' : ''}`} onClick={() => set(s.id, { absent: !r.absent })}>Absent</button>
            </div>
          );
        })}
      </div>
      {bad.length > 0 && <div className="tt-note red">Marks must be between 0 and {paper.outOf}.</div>}
      <Err text={error} />
    </ModalShell>
  );
}

// One child's report card: their marks and result, the comments, and the PDF.
function CardModal({ card, canTeacher, canHead, onClose, onSaved }) {
  const { student: s, result: r, papers } = card;
  const [teacher, setTeacher] = useState(card.teacherComment);
  const [head, setHead] = useState(card.headComment);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const changed = teacher !== card.teacherComment || head !== card.headComment;
  async function save() {
    setBusy('save'); setError('');
    try {
      await saveExamComment({ examId: card.exam.id, studentId: s.id, teacherComment: teacher, ...(canHead ? { headComment: head } : {}) });
      await onSaved('Comments saved');
    } catch (err) { setError(err.message || 'Something went wrong'); setBusy(''); }
  }
  async function pdf() {
    setBusy('pdf');
    try { downloadPdfBytes(await buildReportCards([{ ...card, teacherComment: teacher, headComment: head }]), `Report_card_${s.forename}_${s.surname}_${card.exam.name}.pdf`.replace(/\s+/g, '_')); }
    catch (err) { setError(err.message || 'Could not make the PDF'); }
    setBusy('');
  }
  return (
    <ModalShell title={`${s.forename} ${s.surname}`} sub={`${card.exam.name} · ${s.class}`} onClose={onClose} width={520} footer={<>
      <button className="btn" style={{ marginRight: 'auto' }} disabled={!!busy} onClick={pdf}><Download size={13} /> {busy === 'pdf' ? 'Making…' : 'PDF'}</button>
      <button className="btn" onClick={onClose} disabled={!!busy}>Close</button>
      {(canTeacher || canHead) && <button className="btn btn-teal" disabled={!!busy || !changed} onClick={save}><Save size={13} /> {busy === 'save' ? 'Saving…' : 'Save comments'}</button>}
    </>}>
      <BoxRow columns="repeat(4, minmax(0, 1fr))" cells={[
        { label: true, text: r?.pct === null || !r ? '—' : `${num(r.pct)}%`, sub: 'Percentage' },
        { label: true, text: r?.grade || '—', sub: 'Grade' },
        { label: true, text: r?.position ? `${ordinal(r.position)} of ${r.of}` : '—', sub: 'Position' },
        { text: r?.result || '—', sub: 'Result', tone: r?.result === 'Passed' ? 'green' : r?.result === 'Resit' ? 'red' : undefined },
      ]} />
      <div className="course-lines" style={{ margin: '10px 0 14px' }}>
        {papers.map(p => {
          const done = p.absent || p.mark !== null;
          const pass = !p.absent && p.mark !== null && p.mark >= p.passMark;
          return (
            <div key={p.id} className="exam-card-row">
              <span className="course-kitaab-subject">{p.subject}</span>
              <span className="line-row-name" style={{ fontWeight: 500 }}>{p.kitaab && p.kitaab !== p.subject ? p.kitaab : ''}</span>
              <span className="exam-card-mark">{p.absent ? 'Absent' : done ? `${num(p.mark)} / ${p.outOf}` : '—'}</span>
              {done && <span className={`exam-tag ${pass ? 'green' : 'red'}`}>{pass ? 'Pass' : 'Resit'}</span>}
            </div>
          );
        })}
      </div>
      <div className="form-grid">
        <div className="form-group">
          <label>Class teacher's comment</label>
          {canTeacher ? <textarea rows={3} value={teacher} onChange={e => setTeacher(e.target.value)} placeholder="How they've done, and what to work on" />
            : <div className="card-sub">{teacher || '—'}</div>}
        </div>
        <div className="form-group">
          <label>Head's comment</label>
          {canHead ? <textarea rows={2} value={head} onChange={e => setHead(e.target.value)} placeholder="Optional" /> : <div className="card-sub">{head || '—'}</div>}
        </div>
      </div>
      <Err text={error} />
    </ModalShell>
  );
}
