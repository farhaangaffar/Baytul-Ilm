import React, { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { getStudentExams } from '../lib/store';
import { buildReportCards } from '../lib/reportCardPdf';
import { downloadPdfBytes } from '../lib/reportPdf';

// A Darul Uloom child's reports, on their Report tab in Daily records: one per exam, to look at and
// download. They're written in one place only — Exams & reports — so nothing is edited here.
export default function StudentExams({ student }) {
  const [cards, setCards] = useState(null);
  const [busy, setBusy] = useState('');
  useEffect(() => {
    let live = true;
    getStudentExams(student.id).then(r => { if (live) setCards(r.cards); }).catch(() => { if (live) setCards([]); });
    return () => { live = false; };
  }, [student.id]);
  if (!cards) return null;

  async function pdf(c) {
    setBusy(c.id);
    try {
      const bytes = await buildReportCards([{ student, exam: { id: c.id, name: c.name, year: c.year, heldOn: c.heldOn }, papers: c.papers, result: c.result,
        teacherComment: c.teacherComment, headComment: c.headComment, behavior: c.behavior, attendance: c.attendance, teacherName: c.teacherName }]);
      downloadPdfBytes(bytes, `Report_${student.forename}_${student.surname}_${c.name}.pdf`.replace(/\s+/g, '_'));
    } catch { /* the line just stays */ }
    setBusy('');
  }
  const pct = v => (Number.isInteger(v) ? v : v.toFixed(1));
  return (
    <div className="card">
      <div className="card-title" style={{ marginBottom: 2 }}>Reports</div>
      <div className="card-sub" style={{ marginBottom: 12 }}>
        {cards.length ? 'One per exam · tap one to download it · written on Exams & reports' : 'One report per exam — written on Exams & reports once its marks are in.'}
      </div>
      <div className="course-lines">
        {cards.map(c => {
          const r = c.result;
          const ready = r.complete && !!c.teacherComment;
          return (
            <button key={c.id} type="button" className="line-row" disabled={!!busy} onClick={() => pdf(c)}>
              <span className="course-kitaab-main">
                <span className="line-row-name">{c.name}</span>
                <span className="line-row-sub">
                  {[r.pct !== null && `${pct(r.pct)}%`, r.grade, r.complete && r.position && `${r.position} of ${r.of}`, r.result].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className={`exam-tag ${!ready ? 'amber' : c.published ? 'green' : ''}`}>{!ready ? 'Not written' : c.published ? 'Published' : 'Ready'}</span>
              <Download size={15} style={{ flexShrink: 0, opacity: busy === c.id ? 0.4 : 1 }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
