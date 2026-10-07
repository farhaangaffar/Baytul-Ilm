// Students ⇄ spreadsheets: the download on Settings → Backup and the "Import from a
// spreadsheet" pop-up on the Students page use the same columns, so a downloaded sheet
// can be filled in and imported back.
import { formatDateGB } from './store';

export const SHEET_COLUMNS = [
  ['forename', 'Forename'], ['surname', 'Surname'], ['class', 'Class'], ['dob', 'Date of birth'],
  ['parent1Name', 'Parent 1 name'], ['parent1Phone', 'Parent 1 phone'],
  ['parent2Name', 'Parent 2 name'], ['parent2Phone', 'Parent 2 phone'],
  ['weeklyFee', 'Fee'], ['enrollDate', 'Enrolled'], ['leaveDate', 'Left'], ['status', 'Status'], ['notes', 'Notes'],
];

const csvCell = v => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const gb = d => { try { return d ? formatDateGB(d) : ''; } catch { return d || ''; } };
const STATUS = { Active: 'Active', Inactive: 'Left', 'Waiting list': 'Waiting list' };

// → CSV text (with a byte-order mark so Excel shows Arabic names properly).
export function studentsCsv(students) {
  const rows = students.map(s => SHEET_COLUMNS.map(([k]) =>
    k === 'dob' || k === 'enrollDate' || k === 'leaveDate' ? gb(s[k]) : k === 'status' ? (STATUS[s.status] || s.status) : s[k]));
  return '﻿' + [SHEET_COLUMNS.map(c => c[1]), ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');
}

export function downloadText(text, filename, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Text pasted from Excel / Google Sheets (tab-separated) or a .csv file → rows of cells.
function splitRows(text) {
  const t = text.replace(/^﻿/, '');
  const sep = t.includes('\t') ? '\t' : ',';
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (quoted) {
      if (c === '"' && t[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  row.push(cell); rows.push(row);
  return rows.map(r => r.map(c => c.trim())).filter(r => r.some(Boolean));
}

// Heading words → field. Checked in order, so "parent 2 phone" wins over "phone".
const HEADINGS = [
  [/^(full\s*)?name$|^(student|child|pupil)('?s)?\s*name$/, 'fullName'],
  [/fore|first|given/, 'forename'], [/sur|last|family/, 'surname'],
  [/class|group|year|level/, 'class'], [/birth|dob|d\.o\.b/, 'dob'],
  [/(parent|guardian|mother|father|contact)?\s*2.*(phone|mobile|tel|number)|(phone|mobile|tel).*2/, 'parent2Phone'],
  [/(parent|guardian|mother|father|contact)?\s*2/, 'parent2Name'],
  [/phone|mobile|tel|number|contact\s*no/, 'parent1Phone'],
  [/parent|guardian|mother|father/, 'parent1Name'],
  [/fee|amount|price/, 'weeklyFee'], [/enrol|start|joined/, 'enrollDate'], [/left|leav/, 'leaveDate'],
  [/status/, 'status'], [/note|comment/, 'notes'],
];
function headingField(h) {
  const s = h.toLowerCase().replace(/[_\-.]+/g, ' ').trim();
  for (const [re, f] of HEADINGS) if (re.test(s)) return f;
  return null;
}

// '12/03/2015', '12-3-15', '2015-03-12', '12.03.2015' → '2015-03-12' (day first, UK style).
export function parseDate(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (m) { let y = +m[3]; if (y < 100) y += y > (new Date().getFullYear() % 100) ? 1900 : 2000; return valid(y, +m[2], +m[1]); }
  return null;
}
function valid(y, mo, d) {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : null;
}

// Text → { rows: [{ forename, surname, class, … }], headed: bool }. With no recognisable
// heading row the columns are taken in the download's order.
export function parseSheet(text) {
  const cells = splitRows(text || '');
  if (!cells.length) return { rows: [], headed: false };
  // A second parent column ("Mother's name" then "Father name") fills Parent 2.
  const used = new Set();
  const SECOND = { parent1Name: 'parent2Name', parent1Phone: 'parent2Phone' };
  const mapped = cells[0].map(h => {
    let f = headingField(h);
    if (f && used.has(f) && SECOND[f]) f = SECOND[f];
    if (f) used.add(f);
    return f;
  });
  const headed = mapped.filter(Boolean).length >= 2;
  const fields = headed ? mapped : SHEET_COLUMNS.map(c => c[0]);
  const rows = (headed ? cells.slice(1) : cells).map(r => {
    const o = {};
    fields.forEach((f, i) => { if (f && r[i] != null && r[i] !== '' && o[f] == null) o[f] = r[i]; });
    if (o.fullName && !o.forename) {
      const parts = o.fullName.split(/\s+/);
      o.surname = o.surname || (parts.length > 1 ? parts.pop() : '');
      o.forename = parts.join(' ');
    }
    delete o.fullName;
    return o;
  });
  return { rows, headed };
}
