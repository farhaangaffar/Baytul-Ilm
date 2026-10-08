// Tiny Excel (.xlsx) support with no extra library: writing one sheet of plain-text cells
// (the students spreadsheet), and reading the first sheet of an uploaded .xlsx (Students →
// Import). An .xlsx is a zip of XML files: written here uncompressed, which every
// spreadsheet app reads; read with the browser's own unzipping (DecompressionStream).

const enc = new TextEncoder();
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

let crcTable;
function crc32(bytes) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// files: [[name, text]] → zip Blob (stored, no compression).
function zip(files, type) {
  const parts = [], central = [];
  let offset = 0;
  for (const [name, text] of files) {
    const nameBytes = enc.encode(name), data = enc.encode(text), crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);
    local.setUint32(14, crc, true); local.setUint32(18, data.length, true); local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    parts.push(new Uint8Array(local.buffer), nameBytes, data);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true);
    cen.setUint32(16, crc, true); cen.setUint32(20, data.length, true); cen.setUint32(24, data.length, true);
    cen.setUint16(28, nameBytes.length, true); cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const cenSize = central.reduce((n, b) => n + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cenSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type });
}

const colName = i => { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };

// A date cell: { date: 'YYYY-MM-DD' } — stored as a real Excel date shown dd/mm/yyyy, so
// every date lines up the same way and sorts properly.
const serial = iso => Math.round((Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 864e5);
// Cell styles (styles.xml cellXfs): 0 text, 1 bold heading, 2 date, then the same three centred (3, 4, 5).
function cellXml(v, ref, header, center) {
  if (v == null || v === '') return center ? `<c r="${ref}" s="3"/>` : '';
  const style = n => { const i = n + (center ? 3 : 0); return i ? ` s="${i}"` : ''; };
  if (typeof v === 'object' && /^\d{4}-\d{2}-\d{2}/.test(v.date || '')) return `<c r="${ref}"${style(2)}><v>${serial(v.date)}</v></c>`;
  if (typeof v === 'object') return '';
  if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${style(header ? 1 : 0)}><v>${v}</v></c>`;
  return `<c r="${ref}" t="inlineStr"${style(header ? 1 : 0)}><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
}
const cellWidth = v => (v && typeof v === 'object' ? 10 : String(v ?? '').length);

// rows: [[cell, …], …] (first row = headings, shown bold and frozen) → an .xlsx Blob.
// Cells are text, numbers, or { date } for dates. leftColumns: column indexes kept left-aligned
// (e.g. names); when given, every other column is centred.
export function xlsxBlob(rows, sheetName = 'Sheet1', leftColumns = null) {
  const centred = ci => !!leftColumns && !leftColumns.includes(ci);
  const widths = (rows[0] || []).map((_, c) => Math.min(40, Math.max(8, ...rows.map(r => cellWidth(r[c]) + 2))));
  const sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    + `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"${centred(i) ? ' style="3"' : ''}/>`).join('')}</cols><sheetData>`
    + rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => cellXml(v, `${colName(ci)}${ri + 1}`, ri === 0, centred(ci))).join('')}</row>`).join('')
    + '</sheetData></worksheet>';
  const x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  return zip([
    ['[Content_Types].xml', `${x}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
    ['_rels/.rels', `${x}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `${x}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${esc(sheetName).slice(0, 31)}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `${x}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', `${x}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center"/></xf><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`],
    ['xl/worksheets/sheet1.xml', sheet],
  ], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Reading ──

// zip bytes → { name: Uint8Array } for the files wanted.
async function unzip(buf, wanted) {
  const v = new DataView(buf), bytes = new Uint8Array(buf), dec = new TextDecoder();
  let e = buf.byteLength - 22;
  while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('not a zip');
  const count = v.getUint16(e + 10, true);
  let p = v.getUint32(e + 16, true);
  const out = {};
  for (let i = 0; i < count; i++) {
    const method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true);
    const nLen = v.getUint16(p + 28, true), xLen = v.getUint16(p + 30, true), cLen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nLen));
    p += 46 + nLen + xLen + cLen;
    if (!wanted(name)) continue;
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const raw = bytes.subarray(start, start + size);
    if (method === 0) out[name] = raw;
    else if (method === 8) {
      if (typeof DecompressionStream === 'undefined') throw new Error('old browser');
      const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      out[name] = new Uint8Array(await new Response(stream).arrayBuffer());
    }
  }
  return out;
}

const colIndex = ref => { let n = 0; for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };

// An .xlsx File → tab-separated text of its first sheet (what pasting from Excel gives),
// so it goes through the same reading as pasted rows. Dates come out as dd/mm/yyyy.
export async function xlsxToText(file) {
  const files = await unzip(await file.arrayBuffer(), n => n === 'xl/sharedStrings.xml' || n === 'xl/workbook.xml' || n === 'xl/_rels/workbook.xml.rels' || n === 'xl/styles.xml' || /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  const dec = new TextDecoder(), parse = s => new DOMParser().parseFromString(s, 'application/xml');
  const text = n => (files[n] ? dec.decode(files[n]) : '');
  const shared = files['xl/sharedStrings.xml']
    ? [...parse(text('xl/sharedStrings.xml')).getElementsByTagName('si')].map(si => [...si.getElementsByTagName('t')].map(t => t.textContent).join(''))
    : [];
  // The first sheet's file, via the workbook's relationships.
  let sheetFile = 'xl/worksheets/sheet1.xml';
  try {
    const rid = parse(text('xl/workbook.xml')).getElementsByTagName('sheet')[0].getAttribute('r:id');
    const rel = [...parse(text('xl/_rels/workbook.xml.rels')).getElementsByTagName('Relationship')].find(r => r.getAttribute('Id') === rid);
    const target = rel.getAttribute('Target').replace(/^\/?(xl\/)?/, '');
    if (files[`xl/${target}`]) sheetFile = `xl/${target}`;
  } catch { /* use sheet1 */ }
  // Which cell styles are dates (so a number like 42000 becomes 26/12/2014).
  const dateStyles = new Set();
  try {
    const st = parse(text('xl/styles.xml'));
    const custom = {};
    [...st.getElementsByTagName('numFmt')].forEach(f => { custom[f.getAttribute('numFmtId')] = f.getAttribute('formatCode'); });
    const xfs = st.getElementsByTagName('cellXfs')[0];
    [...(xfs ? xfs.getElementsByTagName('xf') : [])].forEach((xf, i) => {
      const id = Number(xf.getAttribute('numFmtId'));
      if ((id >= 14 && id <= 22) || /[dy]/i.test((custom[id] || '').replace(/"[^"]*"|\[[^\]]*\]/g, ''))) dateStyles.add(i);
    });
  } catch { /* no dates */ }
  const sheet = parse(text(sheetFile));
  const rows = [];
  [...sheet.getElementsByTagName('row')].forEach(r => {
    const cells = [];
    [...r.getElementsByTagName('c')].forEach(c => {
      const i = colIndex(c.getAttribute('r') || colName(cells.length));
      const t = c.getAttribute('t');
      const vEl = c.getElementsByTagName('v')[0];
      let val = '';
      if (t === 's') val = shared[Number(vEl?.textContent)] ?? '';
      else if (t === 'inlineStr') val = [...c.getElementsByTagName('t')].map(x => x.textContent).join('');
      else if (vEl) {
        val = vEl.textContent;
        if (t === 'd' && /^\d{4}-\d{2}-\d{2}/.test(val)) val = val.slice(0, 10).split('-').reverse().join('/');
        else if ((!t || t === 'n') && dateStyles.has(Number(c.getAttribute('s'))) && /^\d+(\.\d+)?$/.test(val)) {
          const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(val)) * 864e5);
          val = `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
        }
      }
      cells[i] = String(val).replace(/[\t\r\n]+/g, ' ');
    });
    rows.push(Array.from(cells, c => c ?? '').join('\t'));
  });
  return rows.join('\n');
}
