// pages/Reports.js
import React, { useState } from 'react';
import Layout from '../components/Layout';
import { getStudents, calcAttendanceCounts, calcAttendancePct, getStudentFees, avatarInitials, getSettings } from '../lib/store';
import { FileText, Download } from 'lucide-react';

async function generateReportPDF(student, counts, fees, schoolName) {
  const { jsPDF } = await import('jspdf');
  await import('jspdf-autotable');

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, margin = 18, contentW = W - margin * 2;
  let y = 0;

  // Header
  doc.setFillColor(26, 60, 94);
  doc.rect(0, 0, W, 36, 'F');
  doc.setTextColor(212, 175, 55);
  doc.setFontSize(15); doc.setFont('helvetica', 'bold');
  doc.text(schoolName.toUpperCase(), W / 2, 13, { align: 'center' });
  doc.setTextColor(255,255,255);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text('Student Progress Report', W / 2, 21, { align: 'center' });
  doc.text('Academic Year 2025–26', W / 2, 28, { align: 'center' });

  y = 46;

  // Student info box
  doc.setFillColor(244, 246, 249); doc.setDrawColor(221, 227, 236);
  doc.roundedRect(margin, y, contentW, 30, 3, 3, 'FD');
  doc.setTextColor(26, 60, 94); doc.setFontSize(13); doc.setFont('helvetica', 'bold');
  doc.text(`${student.forename} ${student.surname}`, margin + 8, y + 10);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(90, 111, 130);
  doc.text(`Class: ${student.class}`, margin + 8, y + 17);
  doc.text(`Date of birth: ${student.dob}`, margin + 8, y + 23);
  doc.text(`Enrolled: ${student.enrollDate}`, margin + 80, y + 17);
  doc.text(`Weekly fee: £${student.weeklyFee}/wk`, margin + 80, y + 23);

  y += 38;

  // Section title helper
  const section = (title) => {
    doc.setFillColor(26, 60, 94); doc.rect(margin, y, contentW, 7, 'F');
    doc.setTextColor(255,255,255); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text(title.toUpperCase(), margin + 4, y + 5);
    y += 11;
  };

  // Attendance
  section('Attendance Summary');
  const att = calcAttendancePct(student.id);
  const attStatus = att >= 90 ? 'Excellent' : att >= 75 ? 'Satisfactory' : 'Needs improvement';
  doc.autoTable({
    startY: y,
    head: [['Present', 'Late', 'Absent', 'Total days', 'Attendance %', 'Status']],
    body: [[counts.present, counts.late, counts.absent, counts.total, `${att}%`, attStatus]],
    margin: { left: margin, right: margin },
    headStyles: { fillColor: [232, 240, 248], textColor: [26, 60, 94], fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: [28, 43, 58] },
  });
  y = doc.lastAutoTable.finalY + 10;

  // Parent contacts
  section('Parent / Guardian Contacts');
  const contactRows = [[student.parent1Name || '—', student.parent1Phone || '—', 'Parent 1']];
  if (student.parent2Name || student.parent2Phone) {
    contactRows.push([student.parent2Name || '—', student.parent2Phone || '—', 'Parent 2']);
  }
  doc.autoTable({
    startY: y,
    head: [['Name', 'Phone', 'Relation']],
    body: contactRows,
    margin: { left: margin, right: margin },
    headStyles: { fillColor: [232, 240, 248], textColor: [26, 60, 94], fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: [28, 43, 58] },
  });
  y = doc.lastAutoTable.finalY + 10;

  // Fee summary
  if (fees.length > 0) {
    section('Fee History (last 10 weeks)');
    const feeRows = fees.slice(0, 10).map(f => [f.weekStarting, `£${Number(f.amount).toFixed(2)}`, f.status, f.paidDate || '—']);
    doc.autoTable({
      startY: y,
      head: [['Week starting', 'Amount', 'Status', 'Paid date']],
      body: feeRows,
      margin: { left: margin, right: margin },
      headStyles: { fillColor: [232, 240, 248], textColor: [26, 60, 94], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9, textColor: [28, 43, 58] },
      didParseCell: data => {
        if (data.column.index === 2 && data.section === 'body') {
          if (data.cell.raw === 'Paid') data.cell.styles.textColor = [14, 124, 101];
          else data.cell.styles.textColor = [192, 57, 43];
        }
      }
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  // Notes
  if (student.notes) {
    section("Notes");
    doc.setTextColor(28, 43, 58); doc.setFontSize(9); doc.setFont('helvetica', 'italic');
    const notes = doc.splitTextToSize(student.notes, contentW - 8);
    doc.text(notes, margin + 4, y);
    y += notes.length * 5 + 8;
  }

  // Signatures
  const sigY = Math.max(y + 10, 245);
  doc.setDrawColor(28, 43, 58);
  doc.line(margin, sigY, margin + 55, sigY);
  doc.line(margin + 90, sigY, margin + 145, sigY);
  doc.setFontSize(8); doc.setTextColor(90, 111, 130);
  doc.text('Class Teacher', margin, sigY + 5);
  doc.text('Head of Madrasah', margin + 90, sigY + 5);

  // Footer
  doc.setFillColor(26, 60, 94); doc.rect(0, 285, W, 12, 'F');
  doc.setTextColor(255,255,255); doc.setFontSize(7.5);
  doc.text(`${schoolName}  ·  Confidential  ·  Generated ${new Date().toLocaleDateString('en-GB')}`, W / 2, 292, { align: 'center' });

  doc.save(`Report_${student.forename}_${student.surname}_${student.id}.pdf`);
}

export default function Reports() {
  const students = getStudents();
  const settings = getSettings();
  const [selected, setSelected] = useState(null);
  const [generating, setGenerating] = useState('');
  const [toast, setToast] = useState('');

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000); }

  async function download(student) {
    setGenerating(student.id);
    try {
      const counts = calcAttendanceCounts(student.id);
      const fees = getStudentFees(student.id);
      await generateReportPDF(student, counts, fees, settings.schoolName);
      showToast(`Report downloaded for ${student.forename} ${student.surname}`);
    } catch (e) {
      showToast('Error generating PDF. Try again.');
    }
    setGenerating('');
  }

  const preview = selected ? students.find(s => s.id === selected) : null;

  return (
    <Layout title="Progress reports" subtitle="Generate and download student reports">
      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Select a student</div>
              <div className="card-sub">Click to preview · use button to download PDF</div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={async () => {
              setGenerating('all');
              for (const s of students) {
                const counts = calcAttendanceCounts(s.id);
                const fees = getStudentFees(s.id);
                await generateReportPDF(s, counts, fees, settings.schoolName);
              }
              setGenerating('');
              showToast(`${students.length} reports downloaded`);
            }}>
              {generating === 'all' ? 'Generating…' : <><Download size={13} />All reports</>}
            </button>
          </div>
          {students.map(s => {
            const att = calcAttendancePct(s.id);
            const isActive = selected === s.id;
            return (
              <div key={s.id} onClick={() => setSelected(s.id)} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '9px 12px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                background: isActive ? 'var(--navy-faint)' : 'transparent',
                border: isActive ? '1px solid var(--navy)' : '1px solid transparent',
                marginBottom: 3,
              }}>
                <div className="flex items-center gap-2">
                  <div className="avatar" style={{ width: 30, height: 30, fontSize: 10, background: isActive ? 'var(--navy)' : undefined, color: isActive ? '#fff' : undefined }}>
                    {avatarInitials(s.forename + ' ' + s.surname)}
                  </div>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{s.forename} {s.surname}</div>
                    <div className="text-muted text-sm">{s.class}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 12, fontWeight: 600, color: att >= 90 ? 'var(--teal)' : att >= 75 ? 'var(--gold)' : 'var(--red)' }}>{att}%</span>
                  <button className="btn btn-sm" onClick={e => { e.stopPropagation(); download(s); }} disabled={!!generating}>
                    {generating === s.id ? '…' : <Download size={12} />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div>
          {preview ? (
            <div>
              <div className="flex justify-between items-center mb-4">
                <div style={{ fontWeight: 600, fontSize: 14 }}>Preview — {preview.forename} {preview.surname}</div>
                <button className="btn btn-primary btn-sm" onClick={() => download(preview)} disabled={!!generating}>
                  <Download size={13} />{generating === preview.id ? 'Generating…' : 'Download PDF'}
                </button>
              </div>
              <ReportPreview student={preview} schoolName={settings.schoolName} />
            </div>
          ) : (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, color: 'var(--text-muted)' }}>
              <FileText size={40} style={{ marginBottom: 12, opacity: 0.3 }} />
              <div style={{ fontWeight: 500 }}>Select a student to preview</div>
              <div className="text-sm" style={{ marginTop: 4 }}>Reports include attendance, contacts and fee history</div>
            </div>
          )}
        </div>
      </div>
      {toast && <div className="toast"><FileText size={14} /> {toast}</div>}
    </Layout>
  );
}

function ReportPreview({ student, schoolName }) {
  const counts = calcAttendanceCounts(student.id);
  const att = calcAttendancePct(student.id);
  const fees = getStudentFees(student.id).slice(0, 8);
  const attStatus = att >= 90 ? 'Excellent' : att >= 75 ? 'Satisfactory' : 'Needs improvement';

  return (
    <div className="report-preview">
      <div className="report-header">
        <div className="report-arabic">بيت العلم</div>
        <div className="report-school">{schoolName}</div>
        <div className="report-sub">Student Progress Report · Academic Year 2025–26</div>
      </div>

      <div className="report-section">
        <div className="report-section-title">Student details</div>
        {[['Name', `${student.forename} ${student.surname}`], ['Class', student.class], ['Date of birth', student.dob], ['Enrolled', student.enrollDate], ['Weekly fee', `£${student.weeklyFee}/wk`]].map(([k,v]) => (
          <div key={k} className="report-row"><span className="report-key">{k}</span><span className="report-val">{v}</span></div>
        ))}
      </div>

      <div className="report-section">
        <div className="report-section-title">Attendance</div>
        {[['Present', counts.present], ['Late', counts.late], ['Absent', counts.absent], ['Total days', counts.total], ['Attendance %', `${att}%`], ['Status', attStatus]].map(([k,v]) => (
          <div key={k} className="report-row">
            <span className="report-key">{k}</span>
            <span className="report-val" style={{ color: k === 'Attendance %' ? (att >= 90 ? 'var(--teal)' : att >= 75 ? 'var(--gold)' : 'var(--red)') : undefined }}>{v}</span>
          </div>
        ))}
      </div>

      <div className="report-section">
        <div className="report-section-title">Parent contacts</div>
        <div className="report-row"><span className="report-key">Parent 1</span><span className="report-val">{student.parent1Name} · {student.parent1Phone}</span></div>
        {student.parent2Name && <div className="report-row"><span className="report-key">Parent 2</span><span className="report-val">{student.parent2Name} · {student.parent2Phone}</span></div>}
      </div>

      {fees.length > 0 && (
        <div className="report-section">
          <div className="report-section-title">Recent fees</div>
          {fees.map(f => (
            <div key={f.id} className="report-row">
              <span className="report-key">w/c {f.weekStarting}</span>
              <span className="report-val">£{Number(f.amount).toFixed(2)} — <span style={{ color: f.status === 'Paid' ? 'var(--teal)' : 'var(--red)' }}>{f.status}</span></span>
            </div>
          ))}
        </div>
      )}

      {student.notes && (
        <div className="report-section">
          <div className="report-section-title">Notes</div>
          <p style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--text-muted)' }}>"{student.notes}"</p>
        </div>
      )}

      <div className="report-sig-row">
        <div className="report-sig"><div className="report-sig-line" /><div className="report-sig-label">Class teacher</div></div>
        <div className="report-sig"><div className="report-sig-line" /><div className="report-sig-label">Head of Madrasah</div></div>
      </div>
      <div className="report-footer">{schoolName} · Confidential · {new Date().toLocaleDateString('en-GB')}</div>
    </div>
  );
}
