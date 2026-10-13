// A Darul Uloom exam report card (Exams page, parent portal): one A4 page per child — the school's
// name and logo, the child's details and position, each paper's mark and result, the percentage,
// grade and overall result, the class teacher's and head's comments, and places to sign. Drawn from
// scratch with pdf-lib (the monthly report uses a fixed template; this one has to fit any number of papers).
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { getBranding, APP_NAME, APP_URL } from './branding';
import { wrapText } from './reportPdf';

const W = 595.28, H = 841.89, M = 48;
const C = {
  ink: rgb(0.1, 0.1, 0.1), muted: rgb(0.42, 0.45, 0.5), line: rgb(0.87, 0.89, 0.91),
  band: rgb(0.953, 0.957, 0.965), head: rgb(0.914, 0.925, 0.941), green: rgb(0.22, 0.5, 0.14), red: rgb(0.76, 0.21, 0.16),
  greenBg: rgb(0.92, 0.96, 0.89), redBg: rgb(0.99, 0.92, 0.91), white: rgb(1, 1, 1),
};

async function bytesOf(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url}`);
  return res.arrayBuffer();
}
async function logoOf() {
  const res = await fetch('/api/settings?logo', { cache: 'no-cache' }).catch(() => null);
  if (!res || !res.ok) return null;
  return { bytes: await res.arrayBuffer(), type: res.headers.get('Content-Type') || '' };
}
// Text shortened with … to fit a width.
function fit(text, font, size, max) {
  let t = String(text ?? '');
  if (font.widthOfTextAtSize(t, size) <= max) return t;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, size) > max) t = t.slice(0, -1);
  return `${t}…`;
}
const ordinal = n => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) || n % 10 > 3 ? 0 : n % 10]}`;
const num = v => (Number.isInteger(Number(v)) ? String(Number(v)) : Number(v).toFixed(1));
const dmy = s => { const [y, m, d] = String(s).split('-'); return `${d}/${m}/${y}`; };
// Plain apostrophes and dashes for the PDF font.
const safe = s => String(s ?? '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"');

function drawCard(doc, f, logo, card) {
  const page = doc.addPage([W, H]);
  const Y = top => H - top; // top-down to pdf-lib's bottom-up
  const text = (t, x, top, size, font = f.reg, color = C.ink) => page.drawText(safe(t), { x, y: Y(top), size, font, color });
  const centre = (t, cx, top, size, font = f.reg, color = C.ink) => text(t, cx - font.widthOfTextAtSize(safe(t), size) / 2, top, size, font, color);
  const box = (x, top, w, h, color, border) => page.drawRectangle({ x, y: Y(top + h), width: w, height: h, color, borderColor: border, borderWidth: border ? 0.8 : 0 });
  const { student, exam, papers, result: r } = card;
  const school = getBranding().schoolName || '';

  // Masthead: logo and school name, then what this is.
  let top = 56;
  const nameSize = Math.min(20, (W - 2 * M - (logo ? 60 : 0)) / Math.max(1, f.bold.widthOfTextAtSize(school.toUpperCase(), 1)));
  const nameW = f.bold.widthOfTextAtSize(school.toUpperCase(), nameSize);
  const logoW = logo ? logo.width * (40 / logo.height) : 0;
  let x = W / 2 - (nameW + (logo ? logoW + 10 : 0)) / 2;
  if (logo) { page.drawImage(logo, { x, y: Y(top + 8), width: logoW, height: 40 }); x += logoW + 10; }
  text(school.toUpperCase(), x, top, nameSize, f.bold);
  top += 30;
  centre('Report card', W / 2, top, 14, f.bold);
  top += 17;
  centre(`${exam.name} · ${exam.year ? `20${exam.year.replace('-', '–20')}` : ''}${exam.heldOn ? ` · ${dmy(exam.heldOn)}` : ''}`, W / 2, top, 9.5, f.reg, C.muted);

  // Details: who, and the term at a glance — position, attendance, behaviour.
  top += 18;
  const third = (W - 2 * M) / 3;
  const cell = (label, value, i, ty) => {
    text(label, M + 14 + i * third, ty, 8, f.reg, C.muted);
    text(fit(value || '—', f.semi, 11, third - 24), M + 14 + i * third, ty + 14, 11, f.semi);
  };
  box(M, top, W - 2 * M, 44, C.band);
  cell('Name', `${student.forename} ${student.surname}`, 0, top + 12);
  cell('Class', student.class, 1, top + 12);
  cell('Class teacher', card.teacherName, 2, top + 12);
  top += 50;
  const a = card.attendance;
  const days = a ? a.present + a.late + a.absent : 0;
  box(M, top, W - 2 * M, 44, C.band);
  cell('Position in class', r.complete && r.position ? `${ordinal(r.position)} of ${r.of}` : '—', 0, top + 12);
  cell('Attendance this term', days ? `${Math.round(((a.present + a.late) / days) * 100)}% · ${a.present + a.late} of ${days} days` : '—', 1, top + 12);
  cell('Behaviour', card.behavior, 2, top + 12);
  top += 60;

  // Marks: subject, book, mark, out of, result.
  const cols = { subject: M + 10, book: M + 128, mark: M + 345, outOf: M + 395, result: M + 452 };
  box(M, top, W - 2 * M, 22, C.head);
  [['Subject', cols.subject], ['Book', cols.book], ['Mark', cols.mark], ['Out of', cols.outOf], ['Result', cols.result]]
    .forEach(([t, cx]) => text(t, cx, top + 15, 8.5, f.semi, C.muted));
  top += 22;
  const rowH = papers.length > 12 ? 19 : 22;
  papers.forEach((p, i) => {
    if (i % 2) box(M, top, W - 2 * M, rowH, rgb(0.985, 0.987, 0.99));
    const mid = top + rowH / 2 + 3.5;
    text(fit(p.subject, f.semi, 10, 112), cols.subject, mid, 10, f.semi);
    text(fit(p.kitaab && p.kitaab !== p.subject ? p.kitaab : '', f.reg, 9.5, 205), cols.book, mid, 9.5);
    const done = p.absent || (p.mark !== null && p.mark !== undefined);
    text(p.absent ? 'Absent' : done ? num(p.mark) : '—', cols.mark, mid, 10, f.semi, p.absent ? C.red : C.ink);
    text(String(p.outOf), cols.outOf, mid, 10, f.reg, C.muted);
    if (done) {
      const pass = !p.absent && Number(p.mark) >= Number(p.passMark);
      text(pass ? 'Pass' : 'Resit', cols.result, mid, 10, f.semi, pass ? C.green : C.red);
    }
    page.drawLine({ start: { x: M, y: Y(top + rowH) }, end: { x: W - M, y: Y(top + rowH) }, thickness: 0.6, color: C.line });
    top += rowH;
  });
  box(M, top, W - 2 * M, 24, C.band);
  text('Total', cols.subject, top + 16, 10.5, f.bold);
  text(num(r.total), cols.mark, top + 16, 10.5, f.bold);
  text(String(r.outOf || '—'), cols.outOf, top + 16, 10.5, f.bold);
  top += 36;

  // Percentage · grade · result.
  const bw = (W - 2 * M - 20) / 3;
  const passed = r.result === 'Passed';
  [['Percentage', r.pct === null ? '—' : `${num(r.pct)}%`, C.band, C.ink],
   ['Grade', r.grade || '—', C.band, C.ink],
   ['Result', r.result === 'Resit' ? 'Resit' : r.result || '—', passed ? C.greenBg : r.result === 'Resit' ? C.redBg : C.band, passed ? C.green : r.result === 'Resit' ? C.red : C.ink]]
    .forEach(([label, value, bg, color], i) => {
      const bx = M + i * (bw + 10);
      box(bx, top, bw, 50, bg);
      const t = fit(value, f.bold, 17, bw - 16);
      text(t, bx + bw / 2 - f.bold.widthOfTextAtSize(t, 17) / 2, top + 25, 17, f.bold, color);
      text(label, bx + bw / 2 - f.reg.widthOfTextAtSize(label, 8.5) / 2, top + 41, 8.5, f.reg, C.muted);
    });
  top += 58;
  if (r.resits?.length) { text(fit(`To resit: ${r.resits.join(', ')}`, f.reg, 9.5, W - 2 * M), M, top + 6, 9.5, f.reg, C.red); top += 16; }
  top += 8;

  // Comments, each in its own box (shortened to fit the page if very long).
  const comment = (label, words, h) => {
    text(label, M, top, 9, f.semi, C.muted);
    box(M, top + 6, W - 2 * M, h, C.white, C.line);
    const lines = wrapText(safe(words || ''), f.reg, 10, W - 2 * M - 24);
    const max = Math.floor((h - 12) / 14);
    lines.slice(0, max).forEach((l, i) => text(i === max - 1 && lines.length > max ? `${l.replace(/\s*\S*$/, '')}…` : l, M + 12, top + 22 + i * 14, 10));
    top += h + 22;
  };
  const room = H - 120 - top;
  const ch = Math.max(46, Math.min(96, (room - 44) / 2));
  comment("Class teacher's comment", card.teacherComment, ch);
  comment("Head's comment", card.headComment, ch);

  // Signatures and the footer.
  const sigTop = Math.min(top + 18, H - 74);
  [["Class teacher's signature", M], ["Head's signature", W / 2 + 10]].forEach(([label, sx]) => {
    page.drawLine({ start: { x: sx, y: Y(sigTop) }, end: { x: sx + (W / 2 - M - 10), y: Y(sigTop) }, thickness: 0.6, color: C.muted });
    text(label, sx, sigTop + 12, 8, f.reg, C.muted);
  });
  const now = new Date();
  const foot = `${school} · ${dmy(now.toISOString().slice(0, 10))} · Made with ${APP_NAME} · ${APP_URL.replace(/^https?:\/\//, '')}`;
  centre(fit(foot, f.reg, 8, W - 2 * M), W / 2, H - 28, 8, f.reg, C.muted);
}

// cards: [{ student, exam, papers: [{subject, kitaab, outOf, passMark, mark, absent}], result, teacherComment, headComment, teacherName }]
export async function buildReportCards(cards) {
  const [reg, semi, bold, logoFile] = await Promise.all([
    bytesOf('/fonts/Comfortaa-Regular.ttf'), bytesOf('/fonts/Comfortaa-SemiBold.ttf'), bytesOf('/fonts/Comfortaa-Bold.ttf'), logoOf(),
  ]);
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const f = { reg: await doc.embedFont(reg, { subset: true }), semi: await doc.embedFont(semi, { subset: true }), bold: await doc.embedFont(bold, { subset: true }) };
  let logo = null;
  if (logoFile) {
    try { logo = logoFile.type.includes('jpeg') ? await doc.embedJpg(logoFile.bytes) : await doc.embedPng(logoFile.bytes); } catch { logo = null; }
  }
  for (const card of cards) drawCard(doc, f, logo, card);
  return doc.save();
}
