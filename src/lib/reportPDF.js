// lib/reportPDF.js — generates a student progress report PDF

export async function generateReportPDF(student, attendancePct, schoolName = "Baytul 'Ilm Madrasah") {
  const { jsPDF } = await import('jspdf');
  await import('jspdf-autotable');

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;
  const margin = 18;
  const contentW = W - margin * 2;
  let y = 0;

  // ── Header bar ──
  doc.setFillColor(26, 60, 94);
  doc.rect(0, 0, W, 36, 'F');

  doc.setTextColor(212, 175, 55);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(schoolName.toUpperCase(), W / 2, 13, { align: 'center' });

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Student Progress Report', W / 2, 20, { align: 'center' });

  const term = 'Term 2 — Academic Year 1446 AH';
  doc.text(term, W / 2, 27, { align: 'center' });

  y = 46;

  // ── Student info box ──
  doc.setDrawColor(221, 227, 236);
  doc.setFillColor(244, 246, 249);
  doc.roundedRect(margin, y, contentW, 32, 3, 3, 'FD');

  doc.setTextColor(26, 60, 94);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(student.name, margin + 8, y + 10);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(90, 111, 130);
  doc.text(`Student ID: ${student.id}`, margin + 8, y + 18);
  doc.text(`Class: ${student.class}`, margin + 8, y + 24);
  doc.text(`Level: ${student.level}`, margin + 80, y + 18);
  doc.text(`Enrolled: ${student.enrollDate}`, margin + 80, y + 24);
  doc.text(`Date of Birth: ${student.dob}`, margin + 140, y + 18);
  doc.text(`Gender: ${student.gender}`, margin + 140, y + 24);

  y += 40;

  // ── Section helper ──
  const section = (title) => {
    doc.setFillColor(26, 60, 94);
    doc.rect(margin, y, contentW, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(title.toUpperCase(), margin + 4, y + 5);
    y += 11;
  };

  // ── Academic Performance ──
  section('Academic Performance');

  const grades = [
    ['Hifz / Quran Memorisation', `${student.juzComplete} / ${student.juzTarget} Juz`, student.tajweedGrade],
    ['Tajweed (Quranic Recitation)', '—', student.tajweedGrade],
    ['Arabic Language', '—', student.arabicGrade],
    ['Islamic Studies', '—', student.islamicGrade],
    ['Fiqh (Islamic Jurisprudence)', '—', student.fiqhGrade],
  ];

  doc.autoTable({
    startY: y,
    head: [['Subject', 'Progress', 'Grade']],
    body: grades,
    margin: { left: margin, right: margin },
    headStyles: { fillColor: [232, 240, 248], textColor: [26, 60, 94], fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: [28, 43, 58] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 0: { cellWidth: 90 }, 1: { cellWidth: 55 }, 2: { cellWidth: 'auto' } },
    didParseCell: (data) => {
      if (data.column.index === 2 && data.section === 'body') {
        const g = data.cell.raw;
        if (g === 'A') { data.cell.styles.textColor = [14, 124, 101]; data.cell.styles.fontStyle = 'bold'; }
        else if (g === 'B') { data.cell.styles.textColor = [26, 60, 94]; data.cell.styles.fontStyle = 'bold'; }
        else if (g === 'C') { data.cell.styles.textColor = [200, 150, 12]; data.cell.styles.fontStyle = 'bold'; }
        else if (g === 'D') { data.cell.styles.textColor = [192, 57, 43]; data.cell.styles.fontStyle = 'bold'; }
      }
    },
  });
  y = doc.lastAutoTable.finalY + 10;

  // ── Attendance ──
  section('Attendance Summary');

  doc.setFillColor(227, 245, 240);
  doc.roundedRect(margin, y, contentW / 3 - 4, 18, 3, 3, 'F');
  doc.setTextColor(14, 124, 101);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(`${attendancePct}%`, margin + (contentW / 3 - 4) / 2, y + 12, { align: 'center' });

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(90, 111, 130);
  doc.text('Overall Attendance', margin + (contentW / 3 - 4) / 2, y + 17, { align: 'center' });

  const attStatus = attendancePct >= 90 ? 'Excellent' : attendancePct >= 75 ? 'Satisfactory' : 'Needs Improvement';
  doc.setTextColor(28, 43, 58);
  doc.setFontSize(9);
  doc.text(`Attendance status: ${attStatus}`, margin + contentW / 3 + 4, y + 8);
  if (attendancePct < 75) {
    doc.setTextColor(192, 57, 43);
    doc.text('Action required: Please contact the Madrasah.', margin + contentW / 3 + 4, y + 14);
  }

  y += 26;

  // ── Teacher Notes ──
  section("Teacher's Notes");

  doc.setTextColor(28, 43, 58);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'italic');
  const notes = doc.splitTextToSize(student.teacherNotes || 'No notes recorded.', contentW - 8);
  doc.text(notes, margin + 4, y);
  y += notes.length * 5 + 8;

  // ── Grade Key ──
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(90, 111, 130);
  doc.text('Grade key:  A = Excellent (90–100%)    B = Good (75–89%)    C = Satisfactory (60–74%)    D = Needs Improvement (below 60%)', margin, y);
  y += 10;

  // ── Signatures ──
  const sigY = Math.max(y + 10, 240);
  doc.setDrawColor(28, 43, 58);
  doc.line(margin, sigY, margin + 55, sigY);
  doc.line(margin + 90, sigY, margin + 145, sigY);

  doc.setFontSize(8);
  doc.setTextColor(90, 111, 130);
  doc.text('Class Teacher', margin, sigY + 5);
  doc.text('Principal / Head of Madrasah', margin + 90, sigY + 5);

  // ── Footer ──
  doc.setFillColor(26, 60, 94);
  doc.rect(0, 285, W, 12, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7.5);
  doc.text(schoolName + '  •  Confidential Student Record  •  Generated ' + new Date().toLocaleDateString('en-GB'), W / 2, 292, { align: 'center' });

  const filename = `Progress_Report_${student.name.replace(/\s+/g, '_')}_${student.id}.pdf`;
  doc.save(filename);
}
