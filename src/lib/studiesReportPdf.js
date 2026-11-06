// A school's Islamic Studies report as a PDF (Reports page, parent portal): one A4 page per pupil — the school's name
// and logo, who and which assessment, effort, the four figures, progress since last time, then each list (surahs,
// du'aas, practicals) with every item's mark, and earlier years at a glance. Just the stats (the owner's choice).
// Drawn with pdf-lib like the Darul Uloom report card (src/lib/reportCardPdf.js).
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { getBranding, APP_NAME, APP_URL } from './branding';
import { LEVEL_NAME } from './studies';

const W = 595.28, H = 841.89, M = 48;
const C = {
  ink: rgb(0.1, 0.1, 0.1), muted: rgb(0.42, 0.45, 0.5), line: rgb(0.87, 0.89, 0.91), band: rgb(0.953, 0.957, 0.965),
  head: rgb(0.914, 0.925, 0.941), white: rgb(1, 1, 1),
  green: rgb(0.18, 0.42, 0.12), greenBg: rgb(0.83, 0.92, 0.74),
  amber: rgb(0.61, 0.48, 0.06), amberBg: rgb(1, 0.93, 0.68),
  red: rgb(0.55, 0.18, 0.13), redBg: rgb(0.95, 0.77, 0.74),
};
const TONE = { 3: [C.green, C.greenBg], 2: [C.amber, C.amberBg], 1: [C.red, C.redBg], 0: [C.muted, C.band] };

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
function fit(text, font, size, max) {
  let t = String(text ?? '');
  if (font.widthOfTextAtSize(t, size) <= max) return t;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, size) > max) t = t.slice(0, -1);
  return `${t}…`;
}
const dmy = s => { const [y, m, d] = String(s).split('-'); return `${d}/${m}/${y}`; };
const safe = s => String(s ?? '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"');

// one: { name, className, assessment: { name, year, takenAt }, effort, report: reportOf(…) }
function drawReport(doc, f, logo, one) {
  let page = doc.addPage([W, H]);
  const Y = top => H - top;
  const text = (t, x, top, size, font = f.reg, color = C.ink) => page.drawText(safe(t), { x, y: Y(top), size, font, color });
  const centre = (t, cx, top, size, font = f.reg, color = C.ink) => text(t, cx - font.widthOfTextAtSize(safe(t), size) / 2, top, size, font, color);
  const box = (x, top, w, h, color, border) => page.drawRectangle({ x, y: Y(top + h), width: w, height: h, color, borderColor: border, borderWidth: border ? 0.8 : 0 });
  const school = getBranding().schoolName || '';
  const { assessment: a, report: r } = one;
  const foot = () => centre(fit(`${school} · Islamic Studies · Made with ${APP_NAME} · ${APP_URL.replace(/^https?:\/\//, '')}`, f.reg, 8, W - 2 * M), W / 2, H - 28, 8, f.reg, C.muted);

  // Masthead.
  let top = 56;
  const nameSize = Math.min(20, (W - 2 * M - (logo ? 60 : 0)) / Math.max(1, f.bold.widthOfTextAtSize(school.toUpperCase(), 1)));
  const nameW = f.bold.widthOfTextAtSize(school.toUpperCase(), nameSize);
  const logoW = logo ? logo.width * (40 / logo.height) : 0;
  let x = W / 2 - (nameW + (logo ? logoW + 10 : 0)) / 2;
  if (logo) { page.drawImage(logo, { x, y: Y(top + 8), width: logoW, height: 40 }); x += logoW + 10; }
  text(school.toUpperCase(), x, top, nameSize, f.bold);
  top += 30;
  centre('Islamic Studies report', W / 2, top, 14, f.bold);
  top += 17;
  centre(`${a.name}${a.year ? ` · 20${a.year.replace('-', '–20')}` : ''}${a.takenAt ? ` · ${dmy(a.takenAt)}` : ''}`, W / 2, top, 9.5, f.reg, C.muted);

  // Who, and their effort.
  top += 18;
  const third = (W - 2 * M) / 3;
  const cell = (label, value, i, ty) => {
    text(label, M + 14 + i * third, ty, 8, f.reg, C.muted);
    text(fit(value || '—', f.semi, 11, third - 24), M + 14 + i * third, ty + 14, 11, f.semi);
  };
  box(M, top, W - 2 * M, 44, C.band);
  cell('Name', one.name, 0, top + 12);
  cell('Class', one.className, 1, top + 12);
  cell('Effort', one.effort, 2, top + 12);
  top += 58;

  // This year's figures (of what's been assessed, as the school's sheets work them out).
  const t = r.t;
  const bw = (W - 2 * M - 30) / 4;
  [[`${t.pctAchieved}%`, 'Achieved', ...TONE[3]], [`${t.pctWithHelp}%`, 'With help', ...TONE[2]], [`${t.pctIncomplete}%`, 'Incomplete', ...TONE[1]],
   [String(t.notAssessed), 'Not assessed yet', C.ink, C.band]].forEach(([v, label, color, bg], i) => {
    const bx = M + i * (bw + 10);
    box(bx, top, bw, 46, bg);
    text(v, bx + bw / 2 - f.bold.widthOfTextAtSize(v, 16) / 2, top + 23, 16, f.bold, color);
    text(label, bx + bw / 2 - f.reg.widthOfTextAtSize(label, 8.5) / 2, top + 38, 8.5, f.reg, color === C.ink ? C.muted : color);
  });
  top += 60;
  const notes = [
    r.gained !== null ? `${r.gained} more achieved since the last report` : '',
    r.earlier ? `Earlier years: ${r.earlier.achieved} of ${r.earlier.total} achieved` : '',
  ].filter(Boolean).join('   ·   ');
  if (notes) { text(fit(notes, f.semi, 9.5, W - 2 * M), M, top, 9.5, f.semi, C.muted); top += 18; }

  // Each list: a row per item with its mark.
  const rowH = 20;
  for (const k of r.kinds) {
    if (top + 26 + rowH > H - 60) { foot(); page = doc.addPage([W, H]); top = 56; }
    box(M, top, W - 2 * M, 22, C.head);
    text(k.label, M + 10, top + 15, 9.5, f.bold);
    top += 22;
    for (const it of k.list) {
      if (top + rowH > H - 60) { foot(); page = doc.addPage([W, H]); top = 56; }
      const mid = top + rowH / 2 + 3.5;
      text(fit(it.name, f.semi, 10, 300), M + 10, mid, 10, f.semi);
      const [color, bg] = TONE[it.level] || TONE[0];
      const label = LEVEL_NAME[it.level] || LEVEL_NAME[0];
      const lw = f.semi.widthOfTextAtSize(label, 9) + 16;
      box(W - M - 8 - lw, top + 3, lw, rowH - 6, bg);
      text(label, W - M - lw, mid - 0.5, 9, f.semi, color);
      page.drawLine({ start: { x: M, y: Y(top + rowH) }, end: { x: W - M, y: Y(top + rowH) }, thickness: 0.6, color: C.line });
      top += rowH;
    }
    top += 12;
  }
  foot();
}

// reports: [{ name, className, assessment, effort, report }]
export async function buildStudiesReports(reports) {
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
  for (const one of reports) drawReport(doc, f, logo, one);
  return doc.save();
}
