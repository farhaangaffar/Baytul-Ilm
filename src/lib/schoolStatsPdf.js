// A school's Stats as a PDF (the Stats page's "Download PDF"; the owner's ask — every year group, schools only for now):
// one document, a section per list — Surahs, Du'aas, Practicals, then Homework — each with its figures, every year group
// (bar and %) with its forms underneath, the assessment points, year over year and the hardest items; homework by month and
// each quiz's average. Drawn with pdf-lib in the same soft colours as the screen (like src/lib/studiesReportPdf.js).
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { getBranding, APP_NAME, APP_URL } from './branding';
import { yearLabel } from './studies';

const W = 595.28, H = 841.89, M = 44, BOTTOM = 60;
const C = {
  ink: rgb(0.1, 0.1, 0.1), muted: rgb(0.42, 0.45, 0.5), line: rgb(0.87, 0.89, 0.91), band: rgb(0.953, 0.957, 0.965), track: rgb(0.925, 0.937, 0.953),
  green: rgb(0.18, 0.42, 0.12), greenBg: rgb(0.83, 0.92, 0.74),
  amber: rgb(0.61, 0.48, 0.06), amberBg: rgb(1, 0.93, 0.68),
  red: rgb(0.55, 0.18, 0.13), redBg: rgb(0.95, 0.77, 0.74),
  blue: rgb(0.18, 0.5, 0.93), blueDark: rgb(0.12, 0.36, 0.72),
};
const POINT = [rgb(0.36, 0.61, 0.94), rgb(0.59, 0.8, 0.38), rgb(0.99, 0.87, 0.24), rgb(0.85, 0.31, 0.25)];
const TITLES = { surah: 'Surahs', duaa: "Du'aas", practical: 'Practicals', homework: 'Homework' };

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
const safe = s => String(s ?? '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-');
const show = n => (n === null || n === undefined ? '-' : `${n}%`);
const niceYear = y => `20${y.slice(0, 2)}-${y.slice(3)}`;

// data: { year, made, kinds: { surah, duaa, practical, homework } } — each as GET /api/school-stats returns it.
export async function buildSchoolStatsPdf(data) {
  const [reg, semi, bold, logoFile] = await Promise.all([
    bytesOf('/fonts/Comfortaa-Regular.ttf'), bytesOf('/fonts/Comfortaa-SemiBold.ttf'), bytesOf('/fonts/Comfortaa-Bold.ttf'), logoOf(),
  ]);
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const f = { reg: await doc.embedFont(reg, { subset: true }), semi: await doc.embedFont(semi, { subset: true }), bold: await doc.embedFont(bold, { subset: true }) };
  let logo = null;
  if (logoFile) { try { logo = logoFile.type.includes('jpeg') ? await doc.embedJpg(logoFile.bytes) : await doc.embedPng(logoFile.bytes); } catch { logo = null; } }
  const school = getBranding().schoolName || '';

  let page, top;
  const Y = t => H - t;
  const fit = (t, font, size, max) => { let s = safe(t); if (font.widthOfTextAtSize(s, size) <= max) return s; while (s.length > 1 && font.widthOfTextAtSize(`${s}...`, size) > max) s = s.slice(0, -1); return `${s}...`; };
  const text = (t, x, tp, size, font = f.reg, color = C.ink) => page.drawText(safe(t), { x, y: Y(tp), size, font, color });
  const right = (t, x, tp, size, font = f.reg, color = C.ink) => text(t, x - font.widthOfTextAtSize(safe(t), size), tp, size, font, color);
  const centre = (t, cx, tp, size, font = f.reg, color = C.ink) => text(t, cx - font.widthOfTextAtSize(safe(t), size) / 2, tp, size, font, color);
  const box = (x, tp, w, h, color, border) => page.drawRectangle({ x, y: Y(tp + h), width: w, height: h, color, ...(border ? { borderColor: border, borderWidth: 0.8 } : {}) });
  const foot = () => centre(fit(`${school} · Islamic Studies stats · ${niceYear(data.year)} · made ${data.made} · ${APP_NAME} · ${APP_URL.replace(/^https?:\/\//, '')}`, f.reg, 7.5, W - 2 * M), W / 2, H - 26, 7.5, f.reg, C.muted);
  const newPage = () => { if (page) foot(); page = doc.addPage([W, H]); top = 48; };
  const room = h => { if (top + h > H - BOTTOM) { newPage(); } };
  // A soft bar: segments [[pct, colour], …] on a grey track.
  const bar = (x, tp, w, segs, h = 6) => {
    box(x, tp, w, h, C.track);
    let at = x;
    for (const [p, col] of segs) { const sw = Math.min((w * (p || 0)) / 100, x + w - at); if (sw > 0) { box(at, tp, sw, h, col); at += sw; } } // rounded %s can add to 101
  };
  const heading = (t, sub, keep = 70) => {
    room(keep); // the heading stays with what follows it
    text(t, M, top + 14, 13, f.bold); top += 20;
    if (sub) { text(sub, M, top + 9, 8.5, f.reg, C.muted); top += 14; }
    top += 4;
  };
  const figures = cells => {
    room(48);
    const gap = 8, bw = (W - 2 * M - gap * 3) / 4;
    cells.forEach(([v, label, color, bg], i) => {
      const x = M + i * (bw + gap);
      box(x, top, bw, 40, bg, bg === C.band ? null : color);
      centre(v, x + bw / 2, top + 19, 14, f.bold, color);
      centre(label, x + bw / 2, top + 32, 8, f.reg, color);
    });
    top += 52;
  };

  // The front: the school, the year, what's inside.
  newPage();
  const nameSize = Math.min(20, (W - 2 * M - (logo ? 60 : 0)) / Math.max(1, f.bold.widthOfTextAtSize(school.toUpperCase(), 1)));
  const nameW = f.bold.widthOfTextAtSize(safe(school.toUpperCase()), nameSize);
  const logoW = logo ? logo.width * (40 / logo.height) : 0;
  let x = W / 2 - (nameW + (logo ? logoW + 10 : 0)) / 2;
  if (logo) { page.drawImage(logo, { x, y: Y(top + 8 + 26), width: logoW, height: 40 }); x += logoW + 10; }
  text(school.toUpperCase(), x, top + 26, nameSize, f.bold);
  top += 52;
  centre('Islamic Studies stats', W / 2, top, 15, f.bold); top += 16;
  centre(`Academic year ${niceYear(data.year)} · as at ${data.made}`, W / 2, top, 9.5, f.reg, C.muted); top += 10;
  centre('Percentages are of what has been assessed (or set), so year groups of any size compare fairly.', W / 2, top + 10, 8, f.reg, C.muted); top += 30;

  for (const kind of ['surah', 'duaa', 'practical', 'homework']) {
    const d = data.kinds[kind];
    if (!d) continue;
    const hw = kind === 'homework';
    if (kind !== 'surah') newPage();
    room(70);
    box(M, top, W - 2 * M, 30, C.band);
    text(TITLES[kind], M + 12, top + 20, 15, f.bold, C.blueDark);
    if (d.fromPoint) right(`As at that year's ${d.fromPoint} assessment`, W - M - 12, top + 19, 8.5, f.reg, C.muted);
    top += 42;

    figures(hw
      ? [[String(d.school.set), 'Set', C.ink, C.band], [show(d.school.onTimePct), 'Done on time', C.green, C.greenBg], [show(d.school.latePct), 'Done late', C.amber, C.amberBg], [show(d.school.quizAvg), 'Quiz average', C.ink, C.band]]
      : [[show(d.school.pct), 'Achieved', C.green, C.greenBg], [show(d.school.helpPct), 'With help', C.amber, C.amberBg], [show(d.school.incPct), 'Incomplete', C.red, C.redBg], [String(d.school.notAssessed), 'Not assessed', C.ink, C.band]]);

    // Every year group, its forms under it.
    heading('Year groups', hw ? 'Homework done (green on time, amber late), and the quiz average' : `This year's ${TITLES[kind].toLowerCase()} · green achieved, amber with help, red incomplete`);
    if (!d.yearGroups.length) { text(hw ? 'No homework set this year.' : 'No marks yet.', M, top + 8, 9, f.reg, C.muted); top += 18; }
    const line = (name, t, indent) => {
      room(26);
      const x0 = M + indent, w = W - 2 * M - indent;
      text(fit(name, indent ? f.reg : f.semi, indent ? 9 : 10, 150), x0, top + 9, indent ? 9 : 10, indent ? f.reg : f.semi);
      const fig = hw ? `${show(t.donePct)} done${t.quizAvg !== null && t.quizAvg !== undefined ? ` · quizzes ${t.quizAvg}%` : ''}` : `${show(t.pct)} achieved`;
      right(fig, x0 + w, top + 9, 9, f.semi, hw ? C.green : C.green);
      bar(x0, top + 14, w, hw ? [[t.onTimePct, C.greenBg], [t.latePct, C.amberBg]] : [[t.pct, C.greenBg], [t.helpPct, C.amberBg], [t.incPct, C.redBg]], indent ? 5 : 6);
      top += indent ? 24 : 27;
    };
    for (const g of d.yearGroups) {
      line(yearLabel(g.yearGroup), g, 0);
      if (g.forms.length > 1) g.forms.forEach(fm => line(`${fm.name}${fm.pupils ? ` · ${fm.pupils} pupils` : ''}`, fm, 16));
    }
    top += 6;

    if (!hw) {
      // Through the year: each point by year group, as small columns.
      if (d.through.length) {
        heading('Through the year', 'Achieved at each assessment point, by year group', 175);
        const groups = [...new Set(d.through.flatMap(p => p.yearGroups.map(g => g.yearGroup)))].sort((a, b) => a - b);
        const chartH = 90, colW = (W - 2 * M) / Math.max(1, groups.length);
        page.drawLine({ start: { x: M, y: Y(top + chartH) }, end: { x: W - M, y: Y(top + chartH) }, thickness: 0.6, color: C.line });
        groups.forEach((yg, i) => {
          const n = d.through.length, bw = Math.min(14, (colW - 16) / n), cx = M + i * colW + colW / 2, x0 = cx - (bw * n + 2 * (n - 1)) / 2;
          d.through.forEach((p, j) => {
            const v = p.yearGroups.find(g => g.yearGroup === yg)?.pct || 0;
            const h = (chartH * v) / 100;
            if (h > 0) box(x0 + j * (bw + 2), top + chartH - h, bw, h, POINT[j % POINT.length]);
          });
          centre(yg === 0 ? 'Rec' : `Y${yg}`, cx, top + chartH + 12, 8, f.reg, C.muted);
        });
        top += chartH + 22;
        let lx = M;
        d.through.forEach((p, j) => {
          box(lx, top - 7, 8, 8, POINT[j % POINT.length]);
          const label = `${p.name} · ${show(p.school)}`;
          text(label, lx + 12, top, 8.5, f.reg, C.muted);
          lx += 24 + f.reg.widthOfTextAtSize(safe(label), 8.5);
        });
        top += 18;
      }
      // Year over year.
      if (d.overYears.length) {
        heading('Year over year', 'The whole school, achieved');
        d.overYears.forEach(r => {
          room(24);
          text(`${niceYear(r.year)}${r.soFar ? ' so far' : r.point ? ` · ${r.point}` : ''}`, M, top + 9, 10, f.semi);
          right(show(r.pct), W - M, top + 9, 9.5, f.semi, C.green);
          bar(M, top + 14, W - 2 * M, [[r.pct, C.greenBg]]);
          top += 27;
        });
        top += 4;
      }
      // Hardest.
      if (d.hardest.length) {
        heading(`Hardest ${d.year === d.current ? 'this year' : 'that year'}`, `The ${TITLES[kind].toLowerCase()} with the most pupils still incomplete`);
        d.hardest.forEach(h => {
          room(20);
          text(fit(`${h.name} · ${yearLabel(h.yearGroup)}`, f.semi, 10, 300), M, top + 9, 10, f.semi);
          right(`${h.incomplete} incomplete · ${h.withHelp} with help`, W - M, top + 9, 9, f.reg, C.muted);
          page.drawLine({ start: { x: M, y: Y(top + 16) }, end: { x: W - M, y: Y(top + 16) }, thickness: 0.5, color: C.line });
          top += 22;
        });
      }
    } else {
      if (d.months?.length) {
        heading('By month', 'Homework set each month, and how much was done');
        d.months.forEach(r => {
          room(26);
          const label = new Date(`${r.month}-01T12:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
          text(`${label} · ${r.set} set`, M, top + 9, 10, f.semi);
          right(`${show(r.donePct)} done`, W - M, top + 9, 9, f.semi, C.green);
          bar(M, top + 14, W - 2 * M, [[r.onTimePct, C.greenBg], [r.latePct, C.amberBg]]);
          top += 27;
        });
        top += 4;
      }
      if (d.quizzes?.length) {
        heading('Quizzes', "The latest, with each class's average");
        d.quizzes.forEach(q => {
          room(20);
          text(fit(`${q.title} · ${q.class}`, f.semi, 10, 330), M, top + 9, 10, f.semi);
          right(`${q.handedIn} of ${q.assigned} handed in · ${show(q.avg)}`, W - M, top + 9, 9, f.reg, C.muted);
          page.drawLine({ start: { x: M, y: Y(top + 16) }, end: { x: W - M, y: Y(top + 16) }, thickness: 0.5, color: C.line });
          top += 22;
        });
      }
    }
  }
  foot();
  return doc.save();
}
