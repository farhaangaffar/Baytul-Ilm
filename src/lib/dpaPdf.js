// The data processing agreement as a PDF (src/lib/legal.js DPA): from /dpa (blank lines for the school's name and the date)
// or from a school's Settings → Your school (its name, and when and by whom it was agreed in the app) — for the headteacher
// or data protection officer to keep. Drawn with pdf-lib in the app's font, like the other PDFs.
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { DPA, DPA_UPDATED, PROVIDER } from './legal';
import { APP_NAME, APP_URL } from './branding';

const W = 595.28, H = 841.89, M = 52, BOTTOM = 64;
const INK = rgb(0.1, 0.1, 0.1), MUTED = rgb(0.42, 0.45, 0.5), LINE = rgb(0.85, 0.87, 0.9), BAND = rgb(0.95, 0.96, 0.97);
const safe = s => String(s ?? '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/→/g, '>');

async function bytesOf(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url}`);
  return res.arrayBuffer();
}

// school: { name, agreedOn ('YYYY-MM-DD'), agreedBy, contactName } — or null for a blank copy.
export async function buildDpaPdf(school) {
  const [reg, bold] = await Promise.all([bytesOf('/fonts/Comfortaa-Regular.ttf'), bytesOf('/fonts/Comfortaa-Bold.ttf')]);
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const f = { reg: await doc.embedFont(reg, { subset: true }), bold: await doc.embedFont(bold, { subset: true }) };
  doc.setTitle('Data processing agreement');
  let page, top, n = 0;
  const Y = t => H - t;
  const text = (t, x, tp, size, font = f.reg, color = INK) => page.drawText(safe(t), { x, y: Y(tp), size, font, color });
  const wrap = (t, font, size, max) => {
    const out = []; let line = '';
    for (const w of safe(t).split(/\s+/)) {
      const next = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) > max && line) { out.push(line); line = w; } else line = next;
    }
    if (line) out.push(line);
    return out;
  };
  const foot = () => {
    const s = `${APP_NAME} data processing agreement · ${DPA_UPDATED} · ${APP_URL.replace(/^https?:\/\//, '')}/dpa · page ${n}`;
    text(s, W / 2 - f.reg.widthOfTextAtSize(safe(s), 7.5) / 2, H - 30, 7.5, f.reg, MUTED);
  };
  const newPage = () => { if (page) foot(); page = doc.addPage([W, H]); n += 1; top = 56; };
  const para = (t, size = 9.5, font = f.reg, gap = 5, indent = 0) => {
    const lines = wrap(t, font, size, W - 2 * M - indent);
    const lh = size * 1.5;
    for (const l of lines) {
      if (top + lh > H - BOTTOM) newPage();
      text(l, M + indent, top + size, size, font); top += lh;
    }
    top += gap;
  };

  newPage();
  text('Data processing agreement', M, top + 20, 20, f.bold); top += 32;
  text(`Between the school below and ${PROVIDER.name}`, M, top + 10, 10, f.reg, MUTED); top += 26;

  // Who and when: filled in from the app, or lines to write on.
  const rows = school
    ? [['School', school.name], ['Agreed in the app', school.agreedOn ? `${new Date(`${school.agreedOn}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}${school.agreedBy ? ` by ${school.agreedBy}` : ''}` : 'Not yet'], ['Contact', school.contactName || ''], ['Processor', `${PROVIDER.name} · ${PROVIDER.email}`]]
    : [['School', ''], ['Date', ''], ['Agreed by', ''], ['Processor', `${PROVIDER.name} · ${PROVIDER.email}`]];
  const boxH = rows.length * 22 + 14;
  page.drawRectangle({ x: M, y: Y(top + boxH), width: W - 2 * M, height: boxH, color: BAND, borderColor: LINE, borderWidth: 0.8 });
  rows.forEach(([k, v], i) => {
    const t = top + 12 + i * 22 + 10;
    text(k, M + 14, t, 9, f.reg, MUTED);
    if (v) text(v, M + 130, t, 10, f.bold);
    else page.drawLine({ start: { x: M + 130, y: Y(t + 2) }, end: { x: W - M - 14, y: Y(t + 2) }, thickness: 0.6, color: MUTED });
  });
  top += boxH + 22;

  DPA.forEach(([heading, paras], i) => {
    if (top + 60 > H - BOTTOM) newPage();
    text(`${i + 1}. ${heading}`, M, top + 12, 12, f.bold); top += 22;
    paras.forEach(p => para(p));
    top += 6;
  });
  foot();
  return doc.save();
}
