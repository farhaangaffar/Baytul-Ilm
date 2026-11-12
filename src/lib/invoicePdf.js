// An invoice for a madrasah or school to pay Suhuf by bank transfer (the platform owner's Madaaris page → a madrasah → Invoice;
// schools' finance offices pay invoices rather than set up standing orders). One A4 page: who it's from and to, the invoice
// number and dates, one line (what it's for and the amount), and the bank details to pay into with the reference to use.
// Drawn with pdf-lib in the app's font, like the other PDFs.
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { APP_NAME, APP_URL } from './branding';
import { PROVIDER } from './legal';

const W = 595.28, H = 841.89, M = 56;
const INK = rgb(0.1, 0.1, 0.1), MUTED = rgb(0.42, 0.45, 0.5), LINE = rgb(0.85, 0.87, 0.9), BAND = rgb(0.95, 0.96, 0.97), BLUE = rgb(0.1, 0.24, 0.37);
const safe = s => String(s ?? '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-');
const longDate = iso => new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const money = n => `£${Number(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function bytesOf(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url}`);
  return res.arrayBuffer();
}

// inv: { number, date, due, to: { name, contact, email }, item, amount, reference, from: { payee, address, bank, sortCode, account } }
export async function buildInvoicePdf(inv) {
  const [reg, bold] = await Promise.all([bytesOf('/fonts/Comfortaa-Regular.ttf'), bytesOf('/fonts/Comfortaa-Bold.ttf')]);
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const f = { reg: await doc.embedFont(reg, { subset: true }), bold: await doc.embedFont(bold, { subset: true }) };
  doc.setTitle(`Invoice ${inv.number}`);
  const page = doc.addPage([W, H]);
  const Y = t => H - t;
  const text = (t, x, tp, size, font = f.reg, color = INK) => page.drawText(safe(t), { x, y: Y(tp), size, font, color });
  const right = (t, x, tp, size, font = f.reg, color = INK) => text(t, x - font.widthOfTextAtSize(safe(t), size), tp, size, font, color);
  const wrap = (t, font, size, max) => {
    const out = []; let line = '';
    for (const w of safe(t).split(/\s+/)) {
      const next = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) > max && line) { out.push(line); line = w; } else line = next;
    }
    if (line) out.push(line);
    return out;
  };

  // Heading: Suhuf on the left, INVOICE on the right.
  text(APP_NAME, M, 70, 24, f.bold, BLUE);
  text(APP_URL.replace(/^https?:\/\//, ''), M, 88, 9.5, f.reg, MUTED);
  right('INVOICE', W - M, 70, 22, f.bold);
  right(`No. ${inv.number}`, W - M, 88, 10, f.reg, MUTED);

  // From / to.
  let top = 132;
  const block = (label, lines, x) => {
    text(label, x, top, 8.5, f.bold, MUTED);
    lines.filter(Boolean).forEach((l, i) => text(l, x, top + 18 + i * 14, 10, i === 0 ? f.bold : f.reg));
  };
  const from = inv.from || {};
  block('FROM', [from.payee || PROVIDER.name, ...(from.address ? from.address.split(/\s*,\s*|\n/) : []), PROVIDER.email], M);
  block('TO', [inv.to.name, inv.to.contact, inv.to.email], W / 2 + 10);

  // Dates.
  top = 250;
  page.drawRectangle({ x: M, y: Y(top + 46), width: W - 2 * M, height: 46, color: BAND, borderColor: LINE, borderWidth: 0.8 });
  [['Invoice date', longDate(inv.date)], ['Payment due', longDate(inv.due)], ['Reference', inv.reference]].forEach(([k, v], i) => {
    const x = M + 14 + i * ((W - 2 * M) / 3);
    text(k, x, top + 18, 8.5, f.reg, MUTED);
    text(v, x, top + 34, 10.5, f.bold);
  });

  // The line.
  top = 330;
  text('Description', M, top, 8.5, f.bold, MUTED);
  right('Amount', W - M, top, 8.5, f.bold, MUTED);
  page.drawLine({ start: { x: M, y: Y(top + 8) }, end: { x: W - M, y: Y(top + 8) }, thickness: 0.8, color: LINE });
  const lines = wrap(inv.item, f.reg, 10.5, W - 2 * M - 120);
  lines.forEach((l, i) => text(l, M, top + 28 + i * 15, 10.5));
  right(money(inv.amount), W - M, top + 28, 10.5, f.bold);
  top += 28 + lines.length * 15 + 8;
  page.drawLine({ start: { x: M, y: Y(top) }, end: { x: W - M, y: Y(top) }, thickness: 0.8, color: LINE });
  right('Total to pay', W - M - 120, top + 26, 11, f.bold);
  right(money(inv.amount), W - M, top + 26, 13, f.bold, BLUE);

  // How to pay.
  top += 70;
  text('How to pay', M, top, 12, f.bold);
  const pay = [
    ['Pay by bank transfer to', from.payee || PROVIDER.name],
    from.bank && ['Bank', from.bank],
    from.sortCode && ['Sort code', from.sortCode],
    from.account && ['Account number', from.account],
    ['Reference to use', inv.reference],
  ].filter(Boolean);
  pay.forEach(([k, v], i) => {
    text(k, M, top + 26 + i * 18, 10, f.reg, MUTED);
    text(v, M + 160, top + 26 + i * 18, 10.5, f.bold);
  });
  top += 26 + pay.length * 18 + 16;
  wrap(`Thank you. Questions about this invoice: ${PROVIDER.email}.`, f.reg, 9.5, W - 2 * M).forEach((l, i) => text(l, M, top + i * 14, 9.5, f.reg, MUTED));

  return doc.save();
}
