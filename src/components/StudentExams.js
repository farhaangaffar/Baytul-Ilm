import React, { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { getStudentExams } from '../lib/store';
import { buildReportCards } from '../lib/reportCardPdf';
import { downloadPdfBytes } from '../lib/reportPdf';

// A Darul Uloom child's exam report cards, on their Report tab in Daily records — each exam a line
// (result, and whether parents can see it yet), tap it for the report card PDF. Marks and comments are
// entered on the Exams page; this just keeps the child's reports together in one place.
export default function StudentExams({ student, teacherName = '' }) {
  const [cards, setCards] = useState(null);
  const [busy, setBusy] = useState('');
  useEffect(() => {
    let live = true;
    getStudentExams(student.id).then(r => { if (live) setCards(r.cards); }).catch(() => { if (live) setCards([]); });
    return () => { live = false; };
  }, [student.id]);
  if (!cards || !cards.length) return null;

  async function pdf(c) {
    setBusy(c.id);
    try {
      const bytes = await buildReportCards([{ student, exam: c, papers: c.papers, result: c.result, teacherComment: c.teacherComment, headComment: c.headComment, teacherName }]);
      downloadPdfBytes(bytes, `Report_card_${student.forename}_${student.surname}_${c.name}.pdf`.replace(/\s+/g, '_'));
    } catch { /* the button just stays */ }
    setBusy('');
  }
  const pct = v => (Number.isInteger(v) ? v : v.toFixed(1));
  return (
    <div className="card">
      <div className="card-title" style={{ marginBottom: 2 }}>Exam report cards</div>
      <div className="card-sub" style={{ marginBottom: 12 }}>Marks and comments are entered on the Exams page · tap one for its PDF</div>
      <div className="course-lines">
        {cards.map(c => {
          const r = c.result;
          return (
            <button key={c.id} type="button" className="line-row" disabled={!!busy} onClick={() => pdf(c)}>
              <span className="course-kitaab-main">
                <span className="line-row-name">{c.name}</span>
                <span className="line-row-sub">
                  {[r.pct !== null && `${pct(r.pct)}%`, r.grade, r.complete && r.position && `${r.position} of ${r.of}`, r.result === 'Resit' ? `Resit: ${r.resits.join(', ')}` : r.result]
                    .filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className={`exam-tag ${c.published ? 'green' : ''}`}>{c.published ? 'Published' : 'Not published'}</span>
              <Download size={15} style={{ flexShrink: 0, opacity: busy === c.id ? 0.4 : 1 }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
