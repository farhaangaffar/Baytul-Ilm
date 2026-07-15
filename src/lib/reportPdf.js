// Generates the student progress report PDF by overlaying dynamic content on
// top of public/report-template.pdf — the school's actual Canva-designed
// template, reused as-is rather than redrawn from scratch. Coordinates below
// were measured directly off that PDF (pdftotext -bbox-layout + pixel
// analysis of a rendered page) and are only valid for that exact file.
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

const PAGE_W = 595.5;
const PAGE_H = 842.25;
// The template's MediaBox is [0, 7.8299813, 595.5, 850.07996] — its origin
// is NOT (0,0), a Canva export quirk. Every drawn coordinate is in absolute
// PDF user space, so this offset must be added back in, or everything ends
// up rendered ~7.8pt too low (PAGE_H alone only captures the page's size).
const MEDIABOX_Y0 = 7.8299813;
const MEDIABOX_TOP = MEDIABOX_Y0 + PAGE_H;

// The "Report Summary" box's geometry (top-down, measured off the template)
// — shared with summaryFit.js so the live in-app fit check uses the exact
// same box a generated PDF will actually use, not a separate guess at it.
export const SUMMARY_BOX = {
  x: 52, maxWidth: 495, fontSize: 10, lineHeight: 15,
  startTop: 548.64 + 14, limitTop: 767,
};
// Mirrors drawFlowingText's own per-line "yTop + size > limit" cutoff exactly
// — this must stay derived from the same box, not just eyeballed, or the
// live checker and the actual PDF could disagree on where line 14 lands.
SUMMARY_BOX.maxLines = Math.floor((SUMMARY_BOX.limitTop - SUMMARY_BOX.startTop - SUMMARY_BOX.fontSize) / SUMMARY_BOX.lineHeight) + 1;

// Matches the app's own Dashboard donut rings exactly (src/index.css
// --green/--amber/--red/--blue, and the literal #eef0f4 used for the
// unfilled "Outstanding" segment) rather than colors picked to match the
// template — the whole point is these are the same charts as the Dashboard.
const COLORS = {
  ink: rgb(0.1, 0.1, 0.1),
  muted: rgb(51 / 255, 51 / 255, 51 / 255),
  green: rgb(151 / 255, 203 / 255, 97 / 255),
  amber: rgb(253 / 255, 221 / 255, 62 / 255),
  red: rgb(216 / 255, 80 / 255, 64 / 255),
  blue: rgb(47 / 255, 128 / 255, 237 / 255),
  track: rgb(238 / 255, 240 / 255, 244 / 255), // unfilled donut segment / empty-state ring
  textSoft: rgb(156 / 255, 163 / 255, 175 / 255), // Dashboard uses this (not `track`) for the Outstanding legend dot — #eef0f4 is too pale to read as a dot on white
  gray: rgb(217 / 255, 217 / 255, 217 / 255), // the template's own band fill (now uniform gray throughout)
  white: rgb(1, 1, 1),
  summaryBand: rgb(217 / 255, 217 / 255, 217 / 255), // matches the template's now-uniform gray bands
};

// Convert a top-down (pdftotext-style, origin top-left) y coordinate to
// pdf-lib's bottom-up, ABSOLUTE user-space page coordinate. `pageTop` is the
// absolute y of that specific page's visible top edge — MEDIABOX_TOP for the
// template page, PAGE_H for a freshly-created continuation page (whose
// MediaBox origin is a normal (0,0), unlike the template's).
function pdfY(yTopDown, pageTop = MEDIABOX_TOP) { return pageTop - yTopDown; }

async function fetchBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url}`);
  return res.arrayBuffer();
}

function centerText(page, text, font, size, cx, yTop, color, pageTop = MEDIABOX_TOP) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: cx - w / 2, y: pdfY(yTop, pageTop), size, font, color });
}

// Local-space donut wedge as an SVG path. drawSvgPath flips Y around the
// path's own origin and only THEN translates by {x,y} — so this must be
// built around (0,0) and anchored on the page via the draw call's {x,y}.
function wedgePath(rOuter, rInner, a0, a1, steps = 40) {
  const outer = [];
  const inner = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (a1 - a0) * (i / steps);
    outer.push([rOuter * Math.cos(a), -rOuter * Math.sin(a)]);
    inner.push([rInner * Math.cos(a), -rInner * Math.sin(a)]);
  }
  let d = `M ${outer[0][0]} ${outer[0][1]} `;
  for (const [x, y] of outer.slice(1)) d += `L ${x} ${y} `;
  for (const [x, y] of inner.reverse()) d += `L ${x} ${y} `;
  return d + 'Z';
}

// Ring geometry matches the Dashboard's own .ring/.ring-inner CSS proportions
// (132px outer / 14px inset -> rInner/rOuter ≈ 0.79) rather than a thicker
// donut, so this reads as the same chart, just on paper.
function drawRingWedges(page, cxTop, cyTop, rOuter, rInner, segments) {
  const cx = cxTop, cy = pdfY(cyTop);
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total <= 0) {
    page.drawEllipse({ x: cx, y: cy, xScale: rOuter, yScale: rOuter, color: COLORS.track });
  } else {
    const startTop = Math.PI / 2;
    let frac = 0;
    for (const seg of segments) {
      if (seg.value <= 0) continue;
      const f0 = frac, f1 = frac + seg.value / total;
      frac = f1;
      const a0 = startTop - f0 * 2 * Math.PI;
      const a1 = startTop - f1 * 2 * Math.PI;
      page.drawSvgPath(wedgePath(rOuter, rInner, a0, a1), { x: cx, y: cy, color: seg.color });
    }
  }
  page.drawEllipse({ x: cx, y: cy, xScale: rInner, yScale: rInner, color: COLORS.white });
}

// Centered "dot  label" row, e.g. "● Present: 12   ● Late: 1   ● Absent: 2"
// — mirrors the Dashboard ring's .ring-breakdown row. Width is measured
// first so the whole row can be centered as a group, not just each item.
function drawLegendRow(page, items, cxTop, yTop, font, size) {
  const dotR = 3, dotGap = 4, itemGap = 14;
  const widths = items.map(it => dotR * 2 + dotGap + font.widthOfTextAtSize(it.text, size));
  const totalW = widths.reduce((a, b) => a + b, 0) + itemGap * (items.length - 1);
  let x = cxTop - totalW / 2;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    page.drawEllipse({ x: x + dotR, y: pdfY(yTop - size * 0.32), xScale: dotR, yScale: dotR, color: it.color });
    page.drawText(it.text, { x: x + dotR * 2 + dotGap, y: pdfY(yTop), size, font, color: COLORS.muted });
    x += widths[i] + itemGap;
  }
}

// The full ring block: subtitle (which month), donut with a center
// percentage + label (matching Dashboard's ring-inner), and the legend row
// below — all vertically centered as a group inside the given box.
function drawDonutBlock(page, box, { subtitle, segments, centerPct, centerLabel, legendItems, fonts }) {
  const cx = (box.x0 + box.x1) / 2;
  const rOuter = 62, rInner = 49;
  const blockH = 10 + 12 + rOuter * 2 + 24 + 10;
  let y = box.y0 + (box.y1 - box.y0 - blockH) / 2;
  centerText(page, subtitle, fonts.regular, 9, cx, y + 8, COLORS.muted);
  const donutCy = y + 10 + 12 + rOuter;
  drawRingWedges(page, cx, donutCy, rOuter, rInner, segments);
  centerText(page, `${centerPct}%`, fonts.bold, 16, cx, donutCy - 2, COLORS.ink);
  centerText(page, centerLabel, fonts.regular, 7.5, cx, donutCy + 10, COLORS.muted);
  drawLegendRow(page, legendItems, cx, donutCy + rOuter + 24, fonts.regular, 9);
}

// Checkbox squares measured from the template — {left, top, right, bottom} in
// top-down points, one per behaviour rating.
const CHECKBOXES = {
  Excellent: { x0: 143.52, y0: 478.56, x1: 159.36, y1: 494.40 },
  Good: { x0: 273.60, y0: 478.56, x1: 289.92, y1: 494.40 },
  Fair: { x0: 404.16, y0: 478.56, x1: 420.00, y1: 494.40 },
  Poor: { x0: 534.24, y0: 478.56, x1: 550.08, y1: 494.40 },
};

function drawCheckmark(page, box) {
  const { x0, y0, x1, y1 } = box;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const w = x1 - x0;
  page.drawSvgPath(
    `M ${-w * 0.32} ${0.02 * w} L ${-w * 0.08} ${w * 0.26} L ${w * 0.34} ${-w * 0.28} L ${w * 0.34} ${-w * 0.14} L ${-w * 0.08} ${w * 0.40} L ${-w * 0.32} ${w * 0.14} Z`,
    { x: cx, y: pdfY(cy), color: COLORS.ink }
  );
}

export function wrapText(text, font, size, maxWidth) {
  const words = (text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const trial = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(trial, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = trial;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// The template is a flat single-page design, so a continuation page can't
// reuse its artwork — this builds a plain page styled to match (same bands,
// fonts, colors) for whatever summary text didn't fit on page one.
// A freshly created page has a normal (0,0)-origin MediaBox — unlike the
// template page, its "top" for pdfY() purposes is plain PAGE_H, not
// MEDIABOX_TOP — so every conversion below passes PAGE_H explicitly.
function newContinuationPage(doc, fonts, studentLabel, reportDate) {
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const bandTop = 40, bandH = 30;
  page.drawRectangle({ x: 41, y: pdfY(bandTop + bandH, PAGE_H), width: 517, height: bandH, color: COLORS.summaryBand });
  centerText(page, `Report Summary (continued) — ${studentLabel}`, fonts.semibold, 11, PAGE_W / 2, bandTop + bandH - 10, COLORS.ink, PAGE_H);

  const footBandTop = PAGE_H - 60, footBandH = 28;
  page.drawRectangle({ x: 41, y: pdfY(footBandTop + footBandH, PAGE_H), width: 517, height: footBandH, color: COLORS.gray });
  centerText(page, `Baytul 'Ilm Madrasah · Confidential · ${reportDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`,
    fonts.regular, 9, PAGE_W / 2, footBandTop + footBandH - 11, COLORS.muted, PAGE_H);

  return { page, pageTop: PAGE_H, contentTop: bandTop + bandH + 20, contentBottom: footBandTop - 15 };
}

// Draws wrapped lines starting on `firstPage`, spilling onto as many
// continuation pages as needed (via `makeContinuationPage`) rather than
// truncating or shrinking text to force a fit.
function drawFlowingText(doc, lines, { firstPage, firstPageTop, x, startTop, limitTop, font, size, lineHeight, color, makeContinuationPage }) {
  let page = firstPage, pageTop = firstPageTop, yTop = startTop, limit = limitTop;
  for (const line of lines) {
    if (yTop + size > limit) {
      const cont = makeContinuationPage();
      page = cont.page; pageTop = cont.pageTop; yTop = cont.contentTop; limit = cont.contentBottom;
    }
    page.drawText(line, { x, y: pdfY(yTop, pageTop), size, font, color });
    yTop += lineHeight;
  }
}

export async function generateReportPdfBytes({ student, counts, feeTotals, monthLabel, aiSummary, behavior, reportDate }) {
  const [templateBytes, comfortaaReg, comfortaaSemi, comfortaaBold] = await Promise.all([
    fetchBytes('/report-template.pdf'),
    fetchBytes('/fonts/Comfortaa-Regular.ttf'),
    fetchBytes('/fonts/Comfortaa-SemiBold.ttf'),
    fetchBytes('/fonts/Comfortaa-Bold.ttf'),
  ]);

  const doc = await PDFDocument.load(templateBytes);
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(comfortaaReg, { subset: true });
  const semibold = await doc.embedFont(comfortaaSemi, { subset: true });
  const numFont = await doc.embedFont(comfortaaBold, { subset: true });

  const page = doc.getPage(0);

  // Subtitle under the masthead, in the gap before the "Details" band.
  centerText(page, `Student Progress Report · ${monthLabel}`, regular, 8, PAGE_W / 2, 64, COLORS.muted);

  // Details grid values, placed right after each pre-printed label, on the
  // label's own baseline — pdftotext's bbox yMax runs ~3pt below the true
  // baseline (it uses the font's descent metric, not actual glyph ink), so
  // that value is nudged up rather than used directly.
  const valueSize = 10;
  page.drawText(`${student.forename} ${student.surname}`, { x: 141, y: pdfY(121.5), size: valueSize, font: regular, color: COLORS.ink });
  page.drawText('Shaikh Farhaan', { x: 434, y: pdfY(121.5), size: valueSize, font: regular, color: COLORS.ink });
  page.drawText(student.class || '—', { x: 85, y: pdfY(153.0), size: valueSize, font: regular, color: COLORS.ink });
  page.drawText(reportDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }), { x: 338, y: pdfY(153.0), size: valueSize, font: regular, color: COLORS.ink });

  // Attendance & fees — the same donut rings the Dashboard shows, just for
  // one student and one month instead of the whole class/year. The template's
  // Attendance/Fees boxes are blank (no more sample chart to erase).
  const fonts = { regular, semibold, bold: numFont };
  const attTotal = counts.present + counts.late + counts.absent;
  const attPct = attTotal ? Math.round(((counts.present + counts.late) / attTotal) * 100) : 0;
  drawDonutBlock(page, { x0: 41, x1: 297, y0: 209, y1: 426 }, {
    subtitle: monthLabel,
    segments: [
      { value: counts.present, color: COLORS.green },
      { value: counts.late, color: COLORS.amber },
      { value: counts.absent, color: COLORS.red },
    ],
    centerPct: attPct, centerLabel: 'Present/Late',
    legendItems: [
      { text: `Present: ${counts.present}`, color: COLORS.green },
      { text: `Late: ${counts.late}`, color: COLORS.amber },
      { text: `Absent: ${counts.absent}`, color: COLORS.red },
    ],
    fonts,
  });

  const { billed = 0, collected = 0 } = feeTotals || {};
  const outstanding = Math.max(0, billed - collected);
  const collectedPct = billed ? Math.round((collected / billed) * 100) : 0;
  drawDonutBlock(page, { x0: 301, x1: 558, y0: 209, y1: 426 }, {
    subtitle: monthLabel,
    segments: [
      { value: collected, color: COLORS.blue },
      { value: outstanding, color: COLORS.track },
    ],
    centerPct: collectedPct, centerLabel: 'Collected',
    legendItems: [
      { text: `Collected: £${collected.toFixed(2)}`, color: COLORS.blue },
      { text: `Outstanding: £${outstanding.toFixed(2)}`, color: COLORS.textSoft },
    ],
    fonts,
  });

  // Class behaviour checkbox.
  if (behavior && CHECKBOXES[behavior]) drawCheckmark(page, CHECKBOXES[behavior]);

  // Report summary paragraph — spills onto continuation page(s) instead of
  // being truncated or shrunk if it doesn't fit the template's box.
  const summaryText = aiSummary || 'No summary has been generated for this student yet.';
  const lines = wrapText(summaryText, regular, SUMMARY_BOX.fontSize, SUMMARY_BOX.maxWidth);
  drawFlowingText(doc, lines, {
    firstPage: page, firstPageTop: MEDIABOX_TOP, x: SUMMARY_BOX.x, startTop: SUMMARY_BOX.startTop, limitTop: SUMMARY_BOX.limitTop,
    font: regular, size: SUMMARY_BOX.fontSize, lineHeight: SUMMARY_BOX.lineHeight, color: COLORS.ink,
    makeContinuationPage: () => newContinuationPage(doc, { semibold, regular }, `${student.forename} ${student.surname}`, reportDate),
  });

  // Footer date — the template ships with a sample date baked in; cover just
  // the white gap above the band (768–781, well short of the band's own top
  // border at ~781.4) so that border line is left untouched, then fill the
  // band itself exactly to its border coordinates (measured off the template).
  page.drawRectangle({ x: 40.3, y: pdfY(781.0), width: 518.9, height: 781.0 - 768, color: COLORS.white });
  page.drawRectangle({ x: 40.3, y: pdfY(810.24), width: 518.9, height: 810.24 - 782.4, color: COLORS.gray });
  // The template's own border around this box is inconsistent — its right
  // edge renders ~0.72pt vs ~0.96pt on the other three sides (a Canva export
  // quirk present even in the untouched source file). Redraw a uniform
  // stroke over it rather than leave that asymmetry visible.
  page.drawRectangle({ x: 40.3, y: pdfY(810.4), width: 518.9, height: 810.4 - 781.3, borderColor: COLORS.ink, borderWidth: 0.9 });
  centerText(page, `Baytul 'Ilm Madrasah · Confidential · ${reportDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`,
    regular, 9, PAGE_W / 2, 799, COLORS.muted);

  return doc.save();
}

export function downloadPdfBytes(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
