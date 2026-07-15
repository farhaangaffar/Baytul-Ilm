// Generates the student progress report PDF by overlaying dynamic content on
// top of public/report-template.pdf — the school's actual Canva-designed
// template, reused as-is rather than redrawn from scratch. Coordinates below
// were measured directly off that PDF (pdftotext -bbox-layout + pixel
// analysis of a rendered page) and are only valid for that exact file.
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

const PAGE_W = 595.5;
const PAGE_H = 842.25;

const COLORS = {
  ink: rgb(0.1, 0.1, 0.1),
  muted: rgb(51 / 255, 51 / 255, 51 / 255),
  green: rgb(126 / 255, 217 / 255, 87 / 255),
  amber: rgb(255 / 255, 222 / 255, 89 / 255),
  red: rgb(255 / 255, 49 / 255, 49 / 255),
  blue: rgb(81 / 255, 112 / 255, 255 / 255),
  gray: rgb(217 / 255, 217 / 255, 217 / 255),
  white: rgb(1, 1, 1),
};

// Convert a top-down (pdftotext-style, origin top-left) y coordinate to
// pdf-lib's bottom-up page space.
function pdfY(yTopDown) { return PAGE_H - yTopDown; }

async function fetchBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url}`);
  return res.arrayBuffer();
}

function centerText(page, text, font, size, cx, yTop, color) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: cx - w / 2, y: pdfY(yTop), size, font, color });
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

// Wipes the template's sample chart — both the sample donut AND its
// percentage callout text, which sits further out than the ring itself, so a
// simple circle isn't enough. Covers the whole white content box below the
// static legend row (which is kept) down to the section's border.
function eraseChartArea(page, xTop0, xTop1, yTop0, yTop1) {
  page.drawRectangle({
    x: xTop0, y: pdfY(yTop1), width: xTop1 - xTop0, height: yTop1 - yTop0,
    color: COLORS.white,
  });
}

function drawDonut(page, cxTop, cyTop, rOuter, rInner, segments) {
  const cx = cxTop, cy = pdfY(cyTop);
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total <= 0) {
    page.drawEllipse({ x: cx, y: cy, xScale: rOuter, yScale: rOuter, color: COLORS.gray });
    page.drawEllipse({ x: cx, y: cy, xScale: rInner, yScale: rInner, color: COLORS.white });
    return;
  }
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

// bounds = the safe box (top-down) callouts must stay inside — a dominant
// segment's midpoint angle can point anywhere, including straight up/down
// where the ring already nearly touches the box edge, so the anchor point
// is clamped into the box rather than left to drift outside it.
function drawDonutCallouts(page, cxTop, cyTop, rOuter, segments, font, size, bounds) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total <= 0) return;
  const startTop = Math.PI / 2;
  let frac = 0;
  const pad = 32;
  for (const seg of segments) {
    if (seg.value <= 0) { continue; }
    const f0 = frac, f1 = frac + seg.value / total;
    const mid = startTop - ((f0 + f1) / 2) * 2 * Math.PI;
    frac = f1;
    const pct = Math.round((seg.value / total) * 100);
    const calloutR = rOuter + 13;
    let anchorX = cxTop + calloutR * Math.cos(mid);
    let anchorYTop = cyTop - calloutR * Math.sin(mid); // top-down: subtract, mirrors wedgePath's flip
    anchorX = Math.min(Math.max(anchorX, bounds.x0 + pad), bounds.x1 - pad);
    anchorYTop = Math.min(Math.max(anchorYTop, bounds.y0 + 8), bounds.y1 - 8);
    centerText(page, seg.label, font, size, anchorX, anchorYTop - size * 0.9, COLORS.ink);
    centerText(page, `${pct}%`, font, size, anchorX, anchorYTop + size * 0.9, COLORS.ink);
  }
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

function wrapText(text, font, size, maxWidth) {
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

export async function generateReportPdfBytes({ student, counts, studentFees, aiSummary, behavior, reportDate }) {
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
  centerText(page, `Student Progress Report · ${reportDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`,
    regular, 9, PAGE_W / 2, 64, COLORS.muted);

  // Details grid values, placed right after each pre-printed label.
  const valueSize = 10;
  page.drawText(`${student.forename} ${student.surname}`, { x: 141, y: pdfY(124.57), size: valueSize, font: semibold, color: COLORS.ink });
  page.drawText('Shaikh Farhaan', { x: 434, y: pdfY(124.57), size: valueSize, font: semibold, color: COLORS.ink });
  page.drawText(student.class || '—', { x: 85, y: pdfY(156.30), size: valueSize, font: regular, color: COLORS.ink });
  page.drawText(reportDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }), { x: 338, y: pdfY(156.30), size: valueSize, font: regular, color: COLORS.ink });

  // Attendance donut (Present / Late / Absent). Erase the template's sample
  // chart + callouts first (but not the static legend row above it).
  const attBounds = { x0: 41, x1: 297, y0: 234, y1: 424 };
  eraseChartArea(page, attBounds.x0, attBounds.x1, attBounds.y0, attBounds.y1);
  const attSegs = [
    { label: 'Present', value: counts.present, color: COLORS.green },
    { label: 'Late', value: counts.late, color: COLORS.amber },
    { label: 'Absent', value: counts.absent, color: COLORS.red },
  ];
  drawDonut(page, 169.44, 328.32, 88.9, 44.5, attSegs);
  drawDonutCallouts(page, 169.44, 328.32, 88.9, attSegs, numFont, 8, attBounds);

  // Fees donut (Paid / Unpaid), by week count.
  const feeBounds = { x0: 301, x1: 558, y0: 234, y1: 424 };
  eraseChartArea(page, feeBounds.x0, feeBounds.x1, feeBounds.y0, feeBounds.y1);
  const paidCount = studentFees.filter(f => f.status === 'Paid').length;
  const unpaidCount = studentFees.length - paidCount;
  const feeSegs = [
    { label: 'Paid', value: paidCount, color: COLORS.blue },
    { label: 'Unpaid', value: unpaidCount, color: COLORS.gray },
  ];
  drawDonut(page, 429.12, 328.32, 88.9, 44.5, feeSegs);
  drawDonutCallouts(page, 429.12, 328.32, 88.9, feeSegs, numFont, 8, feeBounds);

  // Class behaviour checkbox.
  if (behavior && CHECKBOXES[behavior]) drawCheckmark(page, CHECKBOXES[behavior]);

  // Report summary paragraph.
  const summaryText = aiSummary || 'No summary has been generated for this student yet.';
  const lines = wrapText(summaryText, regular, 10, 495);
  let ySum = pdfY(548.64 + 14);
  for (const line of lines) {
    if (ySum < pdfY(767)) break; // don't run into the footer
    page.drawText(line, { x: 52, y: ySum, size: 10, font: regular, color: COLORS.ink });
    ySum -= 15;
  }

  // Footer date — the template ships with a sample date baked in; cover the
  // whole band plus the white gap just above it (glyph ink can bleed above
  // the bbox pdftotext reports) and redraw with the real generation date.
  page.drawRectangle({ x: 41, y: pdfY(781.4), width: 517, height: 781.4 - 768, color: COLORS.white });
  page.drawRectangle({ x: 41, y: pdfY(809.5), width: 517, height: 809.5 - 781.4, color: COLORS.gray });
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
