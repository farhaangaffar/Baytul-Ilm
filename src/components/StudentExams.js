import React, { useCallback, useEffect, useState } from 'react';
import { getStudentExams } from '../lib/store';
import { CardModal } from '../pages/Exams';

// A Darul Uloom child's reports, on their Report tab in Daily records: one per exam (its report card —
// marks, the term's attendance, behaviour and comments). Each is a line; tap it to write the report
// ("Write it for me" drafts the comment) and get the PDF. Marks are entered on the Exams page.
export default function StudentExams({ student }) {
  const [cards, setCards] = useState(null);
  const [open, setOpen] = useState(null);
  const [toast, setToast] = useState('');
  const load = useCallback(() => getStudentExams(student.id).then(r => setCards(r.cards)).catch(() => setCards([])), [student.id]);
  useEffect(() => { load(); }, [load]);
  if (!cards) return null;

  const pct = v => (Number.isInteger(v) ? v : v.toFixed(1));
  const asCard = c => ({
    student, exam: { id: c.id, name: c.name, year: c.year, heldOn: c.heldOn }, papers: c.papers, result: c.result,
    teacherComment: c.teacherComment, headComment: c.headComment, behavior: c.behavior, attendance: c.attendance, teacherName: c.teacherName,
  });
  return (
    <div className="card">
      <div className="card-title" style={{ marginBottom: 2 }}>Reports</div>
      <div className="card-sub" style={{ marginBottom: 12 }}>
        {cards.length ? 'One per exam · tap one to write it and get the PDF' : 'Reports come with each exam — add one on the Exams page and enter its marks.'}
      </div>
      <div className="course-lines">
        {cards.map(c => {
          const r = c.result;
          const ready = r.complete && !!c.teacherComment;
          return (
            <button key={c.id} type="button" className="line-row" onClick={() => setOpen(c)}>
              <span className="course-kitaab-main">
                <span className="line-row-name">{c.name}</span>
                <span className="line-row-sub">
                  {[r.pct !== null && `${pct(r.pct)}%`, r.grade, r.complete && r.position && `${r.position} of ${r.of}`, r.result === 'Resit' ? `Resit: ${r.resits.join(', ')}` : r.result]
                    .filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className={`exam-tag ${ready ? (c.published ? 'green' : '') : 'amber'}`}>{!ready ? 'Not written' : c.published ? 'Published' : 'Ready'}</span>
            </button>
          );
        })}
      </div>
      {open && <CardModal card={asCard(open)} canTeacher canHead onClose={() => setOpen(null)}
        onSaved={async msg => { setOpen(null); await load(); setToast(msg); setTimeout(() => setToast(''), 3000); }} />}
      {toast && <div className="toast">✓ {toast}</div>}
    </div>
  );
}
