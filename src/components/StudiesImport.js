// Islamic Studies → "Import marks from a spreadsheet" (head) — the owner's picked redesign: four steps in one pop-up,
// **any spreadsheet, however it's set out** (every school saved its marks its own way — the owner's wife's sheets showed it):
//   1 Your file   — an .xlsx, a .csv, or cells pasted in; pupils down the side or along the top (`transpose`); a sheet per
//                   year, per class or all on one. No sheet yet? "Download a ready sheet" — the school's pupils down the
//                   side and its Year plan along the top, a sheet per year group (`downloadTemplate`).
//   2 Columns     — every column with its first few marks and Suhuf's guess (exact name, else a close match by its
//                   important words — `closeItem()`), grouped Please check · Found · Left out (a Total / % column).
//                   Each is a drop-down: Leave out · that year's list · every list. Nothing is ever added or renamed.
//   3 Marks       — every different thing written (or only coloured) in the mark boxes, how many times, and four boxes:
//                   Achieved · With help · Incomplete · Not assessed (`guessLevel()`: 3/2/1, ✓ / ✗, words, letters;
//                   green / amber / red cells). Anything Suhuf can't guess waits, amber, for the head to choose.
//   4 Import      — names not found (pick the pupil, or leave out), a look at the first pupils' marks, Import N marks.
// Pupils are matched by name (src/lib/nameMatch.js); only the matched marks are sent (studies.js ?action=import), which
// replace those pupils' marks for those items — an empty box leaves a mark as it is.
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { X, Upload, Check, AlertTriangle, ArrowDown, ClipboardPaste, Download, ChevronRight } from 'lucide-react';
import { xlsxSheets, xlsxBookBlob, downloadBlob } from '../lib/xlsx';
import { getStudents, getStudiesItems, importStudiesMarks, getClasses } from '../lib/store';
import { markMarksImported } from './GettingStarted';
import { useAuth } from '../lib/AuthContext';
import { pupilFinder } from '../lib/nameMatch';
import { guessYearGroup } from '../pages/ClassesTeachers';
import { STUDY_KINDS, yearLabel, plainName, surahNumber } from '../lib/studies';
import { useBackToClose } from '../lib/useBackToClose';

const yearFromSheet = name => (/reception|^rec\b/i.test(name) ? 0 : (/(?:year|yr|y)\s*(\d{1,2})/i.exec(name) || /^(\d{1,2})[a-z]?$/i.exec(name.trim()) || [])[1]);

// The name columns, however a school heads them: "First Name", "Forename(s)", "Legal forename", "Pupil first name",
// "Given name" … and "Surname", "Last name", "Family name", "Legal surname" … — or one "Name" / "Pupil name" / "Full name"
// column (split into first name and surname). Spaces, capitals and punctuation don't matter.
const squash = c => String(c || '').toLowerCase().replace(/[^a-z]/g, '');
const isFirst = c => { const k = squash(c); return /(firstname|forename|givenname|christianname)/.test(k) && !/surname|last/.test(k); };
const isLast = c => { const k = squash(c); return /(surname|lastname|familyname)/.test(k); };
// A heading's list, from its words: "Surah Al-Asr" → surah, "Du'aa before eating" → du'aa, "Practicals" → practical.
// A title naming two lists ("Surahs and Du'aas") says nothing.
function wordKind(v) {
  const t = String(v || '').toLowerCase();
  const ks = [/\bsura(h|t)?\b|\bsuraah|\bsurahs\b/.test(t) && 'surah', /\bdu['’`]?aa?s?\b|\bduas?\b|supplication/.test(t) && 'duaa', /practical/.test(t) && 'practical'].filter(Boolean);
  return ks.length === 1 ? ks[0] : null;
}
// A heading's important words, for a close match when the exact name isn't on the list: "Entering masjid" = "Entering the
// masjid", "Loss occurs" = "When loss occurs", "Morning and evening" = "Morning and evening adhkar". Little words (the, when,
// of, du'aa …) don't count; spellings are boiled down like plainName().
const LITTLE = new Set(['the', 'a', 'an', 'of', 'when', 'and', 'for', 'on', 'upon', 'in', 'at', 'to', 'is', 'du', 'dua', 'duaa', 'duas', 'duaas', 'aa', 'supplication', 'surah', 'surat']);
const wordsOf = v => String(v || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/['’`]/g, '')
  .split(/[^a-z]+/).map(w => w.replace(/aa+/g, 'a').replace(/ee+/g, 'i').replace(/oo+/g, 'u')).filter(w => w.length > 1 && !LITTLE.has(w));
// One item whose important words hold all the column's (or the other way round) — only when exactly one fits, the one
// learnt in the sheet's year preferred.
function closeItem(list, col, year) {
  const cw = wordsOf(col);
  if (!cw.length) return null;
  const fits = list.filter(i => { const iw = wordsOf(i.name); return iw.length > 0 && (cw.every(w => iw.includes(w)) || iw.every(w => cw.includes(w))); });
  if (fits.length === 1) return fits[0];
  const inYear = fits.filter(i => year !== null && year !== undefined && i.yearGroup === year);
  return inYear.length === 1 ? inYear[0] : null;
}
const isFull = c => ['name', 'names', 'fullname', 'pupilname', 'pupilsname', 'studentname', 'studentsname', 'childname', 'childsname', 'pupil', 'student'].includes(squash(c));

// A legend's words → its year group: "Reception" / "EYFS" → 0, "Year 3" / "Yr 3" / "Y3 du'aas" → 3.
const legendYear = v => {
  const t = String(v || '');
  if (/\breception\b|\brec\b|\beyfs\b|\bnursery\b/i.test(t)) return 0;
  const m = /\b(?:year|yr|y)\s*(\d{1,2})\b/i.exec(t);
  return m && Number(m[1]) <= 13 ? Number(m[1]) : undefined;
};


// One sheet → { name, year, columns: [header…], sections: { header: kind }, rows: [{ first, last, cells: { header: { v, f } }, sheet }] }
// (v = the words typed in the box, f = its background colour key). A row above the headings like "Surahs … Du'aas" (often
// merged cells, so the word sits over the first column of its group) puts each column in its list. A column with nothing in
// any box is left out.
// Columns about the pupil, not marks: their class, form, year, date of birth, gender, school numbers …
const NOT_MARKS = /^(class|form|tutor ?group|reg(istration)?( group)?|group|set|year( group)?|yr|dob|date of birth|birthday|gender|sex|upn|id|pupil id|student id|adno|admission( no| number)?|teacher|notes?|comments?)$/i;
function readSheet({ name, rows, fills = [] }) {
  // First name + Surname; or "Name" + "Surname" (Name is then the first name); or one Name column (split in two).
  let h = rows.findIndex(r => r.some(isFirst) && r.some(isLast));
  let nameFirst = false;
  if (h < 0) { h = rows.findIndex(r => r.some(isFull) && r.some(isLast)); nameFirst = h >= 0; }
  let full = false;
  if (h < 0) { h = rows.findIndex(r => r.some(isFull)); full = h >= 0; }
  if (h < 0) return null;
  const hdr = rows[h];
  const fi = full || nameFirst ? hdr.findIndex(isFull) : hdr.findIndex(isFirst), si = full ? fi : hdr.findIndex(isLast);
  const ci = hdr.findIndex(c => /^(class|form)$/i.test(String(c || '').trim())); // tells two pupils with one name apart
  const cols = [];
  for (let i = Math.max(fi, si) + 1; i < hdr.length; i++) {
    if (isFirst(hdr[i]) || (full && isFull(hdr[i]))) break; // the sheet's summary block starts again with the names
    if (String(hdr[i] || '').trim() && !NOT_MARKS.test(String(hdr[i]).trim())) cols.push([i, String(hdr[i]).trim()]);
  }
  const out = [];
  rows.slice(h + 1).forEach((r, k) => {
    let first = String(r[fi] || '').trim(), last = String(r[si] || '').trim();
    if (full) { const parts = first.split(/\s+/); last = parts.length > 1 ? parts.pop() : ''; first = parts.join(' '); }
    if (!first || /average|total/i.test(first) || /^(key|legend)\b/i.test(first) || legendYear(`${first} ${last}`) !== undefined) return;
    const fr = fills[h + 1 + k] || [];
    const cells = {};
    cols.forEach(([i, c]) => { const v = String(r[i] ?? '').trim(), f = fr[i] || ''; if (v || f) cells[c] = { v, f }; });
    if (Object.keys(cells).length) out.push({ first, last, cells, sheet: name, cls: ci >= 0 ? String(r[ci] || '').trim() : '' }); // a pupil with nothing marked has nothing to bring in
  });
  const sections = {};
  for (const r of rows.slice(0, h)) {
    let cur = null, any = false;
    const lab = [];
    for (let i = 0; i < Math.max(r.length, hdr.length); i++) {
      if (String(r[i] || '').trim()) { cur = wordKind(r[i]); if (cur) any = true; }
      lab[i] = cur;
    }
    // A heading typed over the middle of its columns (not merged across them) leaves the first ones unlabelled: they
    // take the first heading in the row.
    const firstLab = lab.findIndex(Boolean);
    if (any) cols.forEach(([i, c]) => { const k = lab[i] || (i < firstLab ? lab[firstLab] : null); if (k) sections[c] = k; });
  }
  const y = yearFromSheet(name);
  const used = cols.map(c => c[1]).filter(c => out.some(r => r.cells[c]));
  return { name, year: y === undefined ? null : Number(y), columns: [...new Set(used)], sections, rows: out };
}
// Pupils along the top instead of down the side: the same sheet turned on its side.
const transpose = ({ name, rows, fills = [] }) => {
  const w = Math.max(0, ...rows.map(r => r.length));
  const t = m => Array.from({ length: w }, (_, c) => m.map(r => (r || [])[c] ?? ''));
  return { name, rows: t(rows), fills: t(fills) };
};
const readAny = sh => readSheet(sh) || readSheet(transpose(sh));

// A .csv file, or cells pasted from a spreadsheet (tabs between boxes) → one sheet's rows.
function parseDelimited(text, name) {
  const tab = text.includes('\t');
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; continue; }
    if (ch === '"' && cell === '') { q = true; continue; }
    if (ch === (tab ? '\t' : ',')) { row.push(cell.trim()); cell = ''; continue; }
    if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell.trim()); rows.push(row); row = []; cell = ''; continue; }
    cell += ch;
  }
  if (cell || row.length) { row.push(cell.trim()); rows.push(row); }
  return { name, rows, fills: [] };
}

// A Total / % / score column — left out to start with.
function looksTotal(col, rows) {
  if (/total|complete|score|percent|%|average|count|sum\b|overall/i.test(col)) return true;
  const vs = rows.map(r => r.cells[col]?.v).filter(Boolean);
  return vs.length > 0 && vs.some(v => /%$/.test(v) || (/^\d+(\.\d+)?$/.test(v) && Number(v) > 3));
}

// What a box means: 3 Achieved · 2 With help · 1 Incomplete · 0 Not assessed · undefined = the head chooses.
const LEVELS = [[3, 'Achieved', 'ach'], [2, 'With help', 'hlp'], [1, 'Incomplete', 'inc'], [0, 'Not assessed', 'nas']];
const keyOf = cell => (cell.v ? `t:${cell.v.toLowerCase().replace(/\s+/g, ' ')}` : cell.f ? `f:${cell.f}` : null);
// A fill's colour on screen: 'FF92D050' → '#92D050'; theme colours can't be shown exactly.
const fillCss = f => (/^[0-9A-F]{8}$/i.test(f) ? `#${f.slice(2)}` : /^[0-9A-F]{6}$/i.test(f) ? `#${f}` : null);
function hueOf(hex) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 0.12) return null; // grey / white / black: no colour to go by
  const hue = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (hue * 60 + 360) % 360;
}
function guessLevel(key) {
  if (key.startsWith('f:')) {
    const css = fillCss(key.slice(2));
    const h = css ? hueOf(css) : null;
    if (h === null) return undefined;
    if (h >= 75 && h <= 170) return 3;   // green
    if (h >= 28 && h < 75) return 2;     // amber, yellow, orange
    if (h < 20 || h >= 330) return 1;    // red, pink
    return undefined;
  }
  const t = key.slice(2).replace(/[.!]$/, '');
  if (t === '3') return 3;
  if (t === '2') return 2;
  if (t === '1') return 1;
  if (/^(✓|✔|☑|✅|y|yes|a|ach|achieved|secure|sec|s|complete|completed|done|met|mastered|exceeding|ex|good)$/.test(t)) return 3;
  if (/^(w|wh|h|with help|help|developing|dev|d|partly|partial|p|working towards|wt|nearly|almost|some)$/.test(t)) return 2;
  if (/^(✗|✘|❌|x|n|no|i|inc|incomplete|e|emerging|not yet|ny|nm|not met|b|beginning|weak)$/.test(t)) return 1;
  if (/^(-|–|—|abs|absent|n\/a|na|ns|not seen|not assessed)$/.test(t)) return 0;
  return undefined;
}

export default function StudiesImport({ onClose, onDone }) {
  const { user } = useAuth();
  const close = useBackToClose(true, onClose);
  const [step, setStep] = useState(1);
  const [picked, setPicked] = useState({}); // a name not found → the pupil the head chose for it (id), or none
  const [colPicked, setColPicked] = useState({}); // a column → the item the head chose for it (id), or '' to leave out
  const [valPicked, setValPicked] = useState({}); // a box's value key → the level the head chose
  const [sheets, setSheets] = useState(null); // parsed sheets
  const [use, setUse] = useState({}); // sheet name → ticked
  const [pupils, setPupils] = useState([]);
  const [items, setItems] = useState([]);
  const [classes, setClasses] = useState([]);
  const [pasting, setPasting] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);

  useEffect(() => {
    Promise.all([getStudents(), getStudiesItems(), getClasses().catch(() => [])])
      .then(([studs, its, cls]) => { setPupils(studs.filter(s => s.status !== 'Inactive')); setItems(its.items); setClasses(cls); })
      .catch(e => setError(e.message || 'Could not load your pupils'));
  }, []);

  // Read the file (or pasted cells) into sheets, then go on to the columns.
  function take(book) {
    const parsed = book.map(readAny).filter(Boolean);
    if (!parsed.length) {
      const seen = book.map(sh => (sh.rows.find(r => r.some(c => c)) || []).filter(Boolean).slice(0, 6).join(', ')).filter(Boolean)[0];
      throw new Error(book.every(sh => !sh.rows.some(r => r.some(c => c)))
        ? 'That file looks empty — open it in Excel or Google Sheets, then "Save as" / "Download" an .xlsx and try again.'
        : `Couldn't find the pupils' name columns (First name and Surname, or one Name column).${seen ? ` The first row reads: ${seen}.` : ''}`);
    }
    // A sheet not named after a year ("Duaas", "Sheet1") takes the year most of its pupils are in (their class's year
    // group). Only sheets named like a past year ("2019") stay unticked — and a file with one sheet is always ticked.
    const finder = pupilFinder(pupils);
    const yearOfClass = Object.fromEntries(classes.map(c => [c.name, c.yearGroup ?? guessYearGroup(c.name)]));
    parsed.forEach(sh => {
      if (sh.year !== null) return;
      const n = {};
      sh.rows.forEach(r => {
        const cls = finder(r.first, r.last)?.pupil?.class;
        const y = cls in yearOfClass ? yearOfClass[cls] : guessYearGroup(cls);
        if (y !== null && y !== undefined) n[y] = (n[y] || 0) + 1;
      });
      const best = Object.keys(n).sort((a, b) => n[b] - n[a])[0];
      if (best !== undefined) { sh.year = Number(best); sh.yearFromPupils = true; }
    });
    setSheets(parsed);
    setUse(Object.fromEntries(parsed.map(s => [s.name, parsed.length === 1 || (s.year !== null && !/^\s*(19|20)\d\d\b/.test(s.name))])));
    setPicked({}); setColPicked({}); setValPicked({});
    setStep(2);
  }
  async function pick(file) {
    setError(''); setBusy(true);
    try {
      take(/\.csv$/i.test(file.name) ? [parseDelimited(await file.text(), file.name.replace(/\.csv$/i, ''))] : await xlsxSheets(file));
    } catch (e) { setError(e.message || 'Could not read that file — save it as .xlsx and try again.'); }
    setBusy(false);
  }
  function usePasted() {
    setError('');
    try { take([parseDelimited(pasteText, 'Pasted')]); setPasting(false); }
    catch (e) { setError(e.message || 'Could not read what was pasted.'); }
  }

  // "Download a ready sheet": a sheet per year group with pupils — First Name, Surname, Class, then that year's Year plan.
  function downloadTemplate() {
    const yearOfClass = Object.fromEntries(classes.map(c => [c.name, c.yearGroup ?? guessYearGroup(c.name)]));
    const byYear = {};
    pupils.filter(p => p.status === 'Active' && p.class && yearOfClass[p.class] !== null && yearOfClass[p.class] !== undefined)
      .forEach(p => { (byYear[yearOfClass[p.class]] = byYear[yearOfClass[p.class]] || []).push(p); });
    const years = Object.keys(byYear).map(Number).sort((a, b) => a - b);
    const book = [{ name: 'How to fill it in', rows: [['How to fill it in'], ['Type 3 for Achieved, 2 for Completed with help, 1 for Incomplete.'], ['Leave a box empty if it hasn\'t been assessed yet.'], ['Then in Suhuf: Islamic Studies → Import marks, and choose this file.']] }];
    years.forEach(y => {
      const list = items.filter(i => i.yearGroup === y);
      const kids = byYear[y].sort((a, b) => `${a.class} ${a.forename} ${a.surname}`.localeCompare(`${b.class} ${b.forename} ${b.surname}`));
      book.push({ name: yearLabel(y), leftColumns: [0, 1, 2], rows: [['First Name', 'Surname', 'Class', ...list.map(i => i.name)], ...kids.map(p => [p.forename, p.surname, p.class, ...list.map(() => '')])] });
    });
    downloadBlob(xlsxBookBlob(book), 'Islamic Studies marks.xlsx');
  }

  const chosen = (sheets || []).filter(s => use[s.name]);
  // Pupils found by name — exactly, or by a close spelling ("M Husayn" = Muhammad Husayn, Kareem = Karim; nameMatch.js).
  const findPupil = useMemo(() => pupilFinder(pupils), [pupils]);
  // A name not found is picked once per sheet (two sheets can each have their own Bilal Ahmed).
  const nameOf = r => `${r.first} ${r.last}${chosen.length > 1 ? ` · ${r.sheet}` : ''}`;
  // Two pupils with one name: the sheet's Class column says which (the ready sheet has one).
  const sameNameIn = r => (r.cls ? pupils.filter(p => p.class === r.cls && plainName(`${p.forename} ${p.surname}`) === plainName(`${r.first} ${r.last}`)) : []);
  const found = r => findPupil(r.first, r.last)?.pupil || (sameNameIn(r).length === 1 ? sameNameIn(r)[0] : null);
  const pupilOf = r => (picked[nameOf(r)] ? pupils.find(p => p.id === picked[nameOf(r)]) : found(r));
  // For a name not found: pupils sharing a word of it first (likely the same child), then everyone A to Z.
  const byName = (a, b) => `${a.forename} ${a.surname}`.localeCompare(`${b.forename} ${b.surname}`);
  const allPupils = useMemo(() => [...pupils].sort(byName), [pupils]);
  const likely = name => {
    const w = name.toLowerCase().split(/[\s\-']+/).filter(x => x.length > 2);
    return allPupils.filter(p => `${p.forename} ${p.surname}`.toLowerCase().split(/[\s\-']+/).some(x => w.includes(x)));
  };

  // Each column's guess: its own list (a surah's own name, a section row above it, its own words, the sheet's name), then the
  // exact name in that list or any, then a close match by its important words. A Total / % column is left out to start with.
  const findIn = (list, col) => list.find(i => plainName(i.name) === plainName(col) || (i.kind === 'surah' && i.surah && i.surah === surahNumber(col)));
  const cols = useMemo(() => {
    const out = [];
    const seen = new Set();
    for (const sh of chosen) {
      let prev = null;
      const sheetKind = wordKind(sh.name);
      for (const c of sh.columns) {
        if (seen.has(c)) continue;
        seen.add(c);
        const hint = (surahNumber(c) ? 'surah' : null) || sh.sections[c] || wordKind(c) || sheetKind;
        const of = hint ? items.filter(i => i.kind === hint) : items;
        const exact = findIn(of, c) || findIn(items, c);
        const total = !exact && looksTotal(c, sh.rows);
        const close = exact || total ? null : closeItem(of, c, sh.year) || (hint ? closeItem(items, c, sh.year) : null);
        const kind = exact?.kind || close?.kind || hint || (surahNumber(c) ? 'surah' : prev) || 'surah';
        prev = kind;
        const sample = sh.rows.map(r => r.cells[c]).filter(Boolean).slice(0, 5).map(x => x.v || '■');
        out.push({ col: c, year: sh.year, kind, exact, close, total, sample });
      }
    }
    return out;
  }, [sheets, use, items]); // eslint-disable-line
  const itemById = id => items.find(i => String(i.id) === String(id));
  const matchItem = c => (colPicked[c.col] !== undefined ? (colPicked[c.col] ? itemById(colPicked[c.col]) : null) : c.exact || c.close || null);
  const mapped = cols.filter(c => matchItem(c));
  const groups = [
    ['Please check', cols.filter(c => !c.exact && !c.total), 'amber'],
    ['Found', cols.filter(c => c.exact), 'green'],
    ['Left out', cols.filter(c => c.total), 'grey'],
  ];

  // Step 3: every different value (or colour) in the boxes of the columns that come in.
  const rowsFound = chosen.flatMap(s => s.rows);
  const values = useMemo(() => {
    const m = new Map();
    const inCols = new Set(mapped.map(c => c.col));
    for (const r of rowsFound) for (const [c, cell] of Object.entries(r.cells)) {
      if (!inCols.has(c)) continue;
      const k = keyOf(cell);
      if (!k) continue;
      const e = m.get(k) || { key: k, label: cell.v || '', fill: cell.v ? '' : cell.f, n: 0 };
      e.n += 1; m.set(k, e);
    }
    const order = k => { const g = guessLevel(k); return g === undefined ? -1 : 4 - g; };
    return [...m.values()].sort((a, b) => (a.key[0] === b.key[0] ? order(a.key) - order(b.key) || b.n - a.n : a.key < b.key ? 1 : -1));
  }, [rowsFound, mapped]); // eslint-disable-line
  const levelOf = k => (valPicked[k] !== undefined ? valPicked[k] : guessLevel(k));
  const unsure = values.filter(v => levelOf(v.key) === undefined);

  const unknown = [...new Set(rowsFound.filter(r => !found(r)).map(nameOf))];
  const nearNames = [...new Map(rowsFound.map(r => [r, findPupil(r.first, r.last)]).filter(([, m]) => m?.close)
    .map(([r, m]) => [`${r.first} ${r.last}`, `${m.pupil.forename} ${m.pupil.surname}`])).entries()];
  const unpicked = unknown.filter(n => !picked[n]);
  const namesRef = useRef(null);

  // The marks that would come in (later sheets win).
  const marks = useMemo(() => {
    const out = new Map();
    for (const s of chosen) for (const r of s.rows) {
      const p = pupilOf(r);
      if (!p) continue;
      for (const c of mapped) {
        const cell = r.cells[c.col];
        const k = cell && keyOf(cell);
        const level = k ? levelOf(k) : undefined;
        if (level >= 1 && level <= 3) out.set(`${p.id}|${matchItem(c).id}`, { studentId: p.id, itemId: matchItem(c).id, level, pupil: p, col: c.col });
      }
    }
    return [...out.values()];
  }, [chosen, mapped, picked, valPicked, pupils]); // eslint-disable-line
  const marksCount = marks.length;
  const pupilsWithMarks = [...new Map(marks.map(m => [m.studentId, m.pupil])).values()];

  async function run() {
    setBusy(true); setError('');
    try {
      const list = marks.map(({ studentId, itemId, level }) => ({ studentId, itemId, level }));
      let n = 0;
      for (let i = 0; i < list.length; i += 4000) n += (await importStudiesMarks(list.slice(i, i + 4000))).imported;
      setDone({ marks: n, left: cols.filter(c => !matchItem(c)).map(c => c.col), names: unpicked });
      markMarksImported(user?.madrasah?.code); // ticks Getting started's "Bring in the marks you already have"
      await onDone?.();
    } catch (e) { setError(e.message || 'Could not import'); }
    setBusy(false);
  }

  const amberBox = { border: '1px solid #f1d58a', background: 'var(--amber-light)', borderRadius: 'var(--r-md)', padding: '10px 12px' };
  const stepNames = ['Your file', 'Columns', 'Marks', 'Import'];
  const next = [null, null, mapped.length > 0, true, marksCount > 0];

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && close()}>
      <div className="modal" style={{ maxWidth: 600 }}>
        <div className="modal-header">
          <div className="modal-title">Import marks from a spreadsheet</div>
          <button className="btn btn-icon" onClick={close}><X size={16} /></button>
        </div>
        <div className="modal-body" style={{ display: 'grid', gap: 12 }}>
          {done ? <>
            <div style={{ fontSize: 14, color: 'var(--green-text)' }}>
              <Check size={15} style={{ verticalAlign: -2 }} /> Imported {done.marks} marks.
            </div>
            {done.names.length > 0 && (
              <div style={{ fontSize: 13, color: 'var(--amber-text)' }}>
                {done.names.length} name{done.names.length === 1 ? ' wasn\'t' : 's weren\'t'} matched to a pupil, so their marks were left out: {done.names.slice(0, 12).join(', ')}{done.names.length > 12 ? '…' : ''}.
                Import the file again and choose who they are.
              </div>
            )}
            {done.left.length > 0 && (
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Left out: {done.left.join(', ')}. To bring {done.left.length === 1 ? 'it' : 'any of them'} in, import the file again and choose which {done.left.length === 1 ? 'it is' : 'they are'}.
              </div>
            )}
          </> : <>
            <div className="im-steps">
              {stepNames.map((n, i) => (
                <div key={n} className={`im-step ${step === i + 1 ? 'on' : step > i + 1 ? 'done' : ''}`}><b>{step > i + 1 ? '✓' : i + 1}</b>{n}</div>
              ))}
            </div>

            {step === 1 && <>
              <div className="text-muted" style={{ fontSize: 13 }}>
                Bring in the marks you already have, <b>however your sheet is set out</b>. Suhuf reads it and you check what it found before anything is saved.
              </div>
              <label className="im-drop">
                <span className="im-drop-icon"><Upload size={22} /></span>
                <span style={{ fontSize: 15, fontWeight: 700 }}>{busy ? 'Reading…' : 'Choose your spreadsheet'}</span>
                <span className="text-muted" style={{ fontSize: 12 }}>Excel (.xlsx) or .csv — a Google Sheet works too: File → Download → .xlsx</span>
                <input type="file" accept=".xlsx,.csv" hidden disabled={busy} onChange={e => e.target.files[0] && pick(e.target.files[0])} />
              </label>
              {!pasting ? (
                <button type="button" className="line-row" onClick={() => setPasting(true)}>
                  <ClipboardPaste size={16} style={{ flexShrink: 0 }} />
                  <span className="ct-two"><span className="line-row-name">Or paste it in</span><span className="line-row-sub">Select the cells in your sheet, copy, and paste here</span></span>
                  <ChevronRight size={16} style={{ color: 'var(--text-soft)', flexShrink: 0 }} />
                </button>
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  <textarea rows={6} value={pasteText} onChange={e => setPasteText(e.target.value)} placeholder="Paste the cells here — the row with the names' headings and the marks below it" autoFocus />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-sm" onClick={() => setPasting(false)}>Cancel</button>
                    <button className="btn btn-primary btn-sm" disabled={!pasteText.trim()} onClick={usePasted}>Use these cells</button>
                  </div>
                </div>
              )}
              <div className="form-section-title" style={{ margin: '4px 0 0' }}>Any of these work</div>
              <div className="im-any">
                <div><b>Pupils down the side</b> or along the top</div>
                <div><b>A sheet per year</b>, per class, or all on one</div>
                <div><b>1 · 2 · 3</b>, ✓ / ✗, words, letters</div>
                <div><b>Coloured boxes</b> with nothing typed in them</div>
              </div>
              <div style={{ borderTop: '1px solid #eef1f5', paddingTop: 12, display: 'grid', gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>No sheet yet, or yours won't read?</div>
                <button type="button" className="line-row" onClick={downloadTemplate} disabled={!pupils.length || !items.length}>
                  <Download size={16} style={{ flexShrink: 0 }} />
                  <span className="ct-two"><span className="line-row-name">Download a ready sheet</span><span className="line-row-sub">Your pupils down the side, your Year plan along the top — fill it in and bring it back</span></span>
                  <ChevronRight size={16} style={{ color: 'var(--text-soft)', flexShrink: 0 }} />
                </button>
              </div>
            </>}

            {step === 2 && sheets && <>
              <div style={{ display: 'grid', gap: 4, background: '#f6f8fb', borderRadius: 'var(--r-md)', padding: '8px 12px' }}>
                {sheets.map(s => (
                  <label key={s.name} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, textTransform: 'none', letterSpacing: 0, fontWeight: 400, color: 'var(--ink)' }}>
                    {sheets.length > 1 && <input type="checkbox" checked={!!use[s.name]} onChange={e => setUse(u => ({ ...u, [s.name]: e.target.checked }))} />}
                    <span><b>{s.name}</b> · {s.rows.length} pupil{s.rows.length === 1 ? '' : 's'}{s.year !== null ? ` · ${yearLabel(s.year)}${s.yearFromPupils ? ' (from its pupils\' class)' : ''}` : ''}</span>
                  </label>
                ))}
              </div>
              <div className="box-row-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 6 }}>
                <div className="info-box" style={{ background: 'var(--green-light)' }}><strong>{groups[1][1].length}</strong><span className="info-box-label">Found</span></div>
                <div className="info-box" style={{ background: groups[0][1].length ? 'var(--amber-light)' : undefined }}><strong>{groups[0][1].length}</strong><span className="info-box-label">Please check</span></div>
                <div className="info-box"><strong>{groups[2][1].length}</strong><span className="info-box-label">Left out</span></div>
              </div>
              <div className="text-muted" style={{ fontSize: 13 }}>Each column of your sheet, and what Suhuf thinks it is. Change any that are wrong.</div>
              {groups.map(([title, list, tone]) => list.length > 0 && (
                <div key={title} style={{ display: 'grid', gap: 6 }}>
                  <div className="form-section-title" style={{ margin: '4px 0 0' }}>{title}</div>
                  {list.map(c => {
                    const cur = matchItem(c);
                    const thisYear = c.year !== null ? items.filter(i => i.yearGroup === c.year && i.kind === c.kind) : [];
                    return (
                      <div key={c.col} className={`im-col ${tone}`}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 700, overflowWrap: 'anywhere' }}>{c.col}</div>
                          <div className="text-muted" style={{ fontSize: 11 }}>{c.sample.join(' · ')}{c.sample.length >= 5 ? ' …' : ''}</div>
                        </div>
                        <span className="text-soft" aria-hidden="true">→</span>
                        <select value={cur ? String(cur.id) : ''} aria-label={`Which is ${c.col}?`} onChange={e => setColPicked(x => ({ ...x, [c.col]: e.target.value }))}
                          style={cur ? undefined : { color: tone === 'amber' ? 'var(--amber-text)' : 'var(--text-muted)' }}>
                          <option value="">{c.total ? 'Leave out · looks like a total' : tone === 'amber' ? 'Choose… (or leave out)' : 'Leave out'}</option>
                          {thisYear.length > 0 && <optgroup label={`${yearLabel(c.year)} · ${(STUDY_KINDS.find(([k]) => k === c.kind) || [])[1] || ''}`}>{thisYear.map(i => <option key={`y${i.id}`} value={String(i.id)}>{i.name}</option>)}</optgroup>}
                          {STUDY_KINDS.map(([k, label]) => {
                            const list2 = items.filter(i => i.kind === k);
                            return list2.length > 0 && <optgroup key={k} label={`All ${label.toLowerCase()}`}>{list2.map(i => <option key={i.id} value={String(i.id)}>{i.name}{i.yearGroup !== null && i.yearGroup !== undefined ? ` · ${yearLabel(i.yearGroup)}` : ''}</option>)}</optgroup>;
                          })}
                        </select>
                      </div>
                    );
                  })}
                </div>
              ))}
              {!cols.length && <div style={{ ...amberBox, fontSize: 13 }}>No mark columns were found next to the names in the sheet{chosen.length === 1 ? '' : 's'} ticked.</div>}
            </>}

            {step === 3 && <>
              <div style={{ fontSize: 15, fontWeight: 700 }}>What do your marks mean?</div>
              <div className="text-muted" style={{ fontSize: 13, marginTop: -6 }}>These are all the different things written (or coloured) in your mark boxes. Tap what each one means.</div>
              {unsure.length > 0 && <div style={{ ...amberBox, fontSize: 13, color: 'var(--amber-text)', fontWeight: 600 }}>{unsure.length} Suhuf wasn't sure about — choose what {unsure.length === 1 ? 'it means' : 'they mean'}, or their boxes won't come in.</div>}
              {['t:', 'f:'].map(prefix => {
                const list = values.filter(v => v.key.startsWith(prefix));
                return list.length > 0 && (
                  <div key={prefix} style={{ display: 'grid', gap: 6 }}>
                    <div className="form-section-title" style={{ margin: '4px 0 0' }}>{prefix === 't:' ? 'Typed in your boxes' : 'Coloured boxes (nothing typed)'}</div>
                    {list.map(v => {
                      const lv = levelOf(v.key);
                      return (
                        <div key={v.key} className={`im-val ${lv === undefined ? 'amber' : ''}`}>
                          <div className="im-val-chip">
                            {v.fill ? <span className="im-swatch" style={{ background: fillCss(v.fill) || 'repeating-linear-gradient(45deg,#cbd5e1 0 4px,#e2e8f0 4px 8px)' }} title={fillCss(v.fill) ? '' : 'A colour from the sheet\'s theme'} /> : <span className="im-text">{v.label}</span>}
                            <span className="text-muted" style={{ fontSize: 10.5 }}>{v.n} box{v.n === 1 ? '' : 'es'}</span>
                          </div>
                          <div className="im-levels">
                            {LEVELS.map(([n, label, cls]) => (
                              <button key={n} type="button" className={`im-lv ${lv === n ? cls : ''}`} onClick={() => setValPicked(x => ({ ...x, [v.key]: n }))}>{label}</button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
              {!values.length && <div className="text-muted" style={{ fontSize: 13 }}>The columns chosen have no marks in them.</div>}
              <div className="text-muted" style={{ fontSize: 12 }}>Empty boxes are "Not assessed" and leave any mark already in Suhuf as it is.</div>
            </>}

            {step === 4 && <>
              <div className="box-row-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 6 }}>
                <div className="info-box"><strong>{pupilsWithMarks.length}</strong><span className="info-box-label">Pupils</span></div>
                <div className="info-box"><strong>{mapped.length}</strong><span className="info-box-label">Columns</span></div>
                <div className="info-box" style={{ background: 'var(--teal-light)' }}><strong style={{ color: 'var(--teal-dark)' }}>{marksCount}</strong><span className="info-box-label">Marks to import</span></div>
              </div>
              {unpicked.length > 0 && (
                <button type="button" onClick={() => namesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  style={{ ...amberBox, display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', fontFamily: 'var(--font)', fontSize: 13.5, fontWeight: 600, color: 'var(--amber-text)', cursor: 'pointer' }}>
                  <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{unpicked.length} name{unpicked.length === 1 ? '' : 's'} not found — their marks won't come in. Choose who they are below.</span>
                  <ArrowDown size={15} style={{ flexShrink: 0 }} />
                </button>
              )}
              {nearNames.length > 0 && (
                <div style={{ fontSize: 12.5, color: 'var(--ink)', background: '#f3f4f6', borderRadius: 'var(--r-md)', padding: '8px 10px' }}>
                  {nearNames.length} matched by a close spelling — check they're right: {nearNames.slice(0, 10).map(([a, b]) => `${a} → ${b}`).join(', ')}{nearNames.length > 10 ? '…' : ''}
                </div>
              )}
              {marksCount > 0 && (() => {
                const shownCols = mapped.slice(0, 6);
                const by = new Map(marks.map(m => [`${m.studentId}|${m.col}`, m.level]));
                return (
                  <div style={{ display: 'grid', gap: 6 }}>
                    <div className="form-section-title" style={{ margin: '4px 0 0' }}>A look at what will come in</div>
                    <div style={{ background: '#f6f8fb', borderRadius: 'var(--r-md)', padding: 8, overflowX: 'auto' }}>
                      <table className="im-table">
                        <thead><tr><th>Pupil</th>{shownCols.map(c => <th key={c.col}>{matchItem(c).name}</th>)}</tr></thead>
                        <tbody>{pupilsWithMarks.slice(0, 4).map(p => (
                          <tr key={p.id}><td>{p.forename} {p.surname}</td>{shownCols.map(c => {
                            const l = by.get(`${p.id}|${c.col}`);
                            return <td key={c.col} className={l === 3 ? 'ach' : l === 2 ? 'hlp' : l === 1 ? 'inc' : 'nas'}>{l === 3 ? '✓' : l === 2 ? 'help' : l === 1 ? '✗' : '—'}</td>;
                          })}</tr>
                        ))}</tbody>
                      </table>
                      {(pupilsWithMarks.length > 4 || mapped.length > 6) && <div className="text-muted" style={{ fontSize: 11.5, textAlign: 'center', padding: 4 }}>
                        {pupilsWithMarks.length > 4 ? `+ ${pupilsWithMarks.length - 4} more pupils` : ''}{pupilsWithMarks.length > 4 && mapped.length > 6 ? ' · ' : ''}{mapped.length > 6 ? `+ ${mapped.length - 6} more columns` : ''}
                      </div>}
                    </div>
                  </div>
                );
              })()}
              {unknown.length > 0 && (
                <div className="form-group" ref={namesRef} style={{ scrollMarginTop: 12, ...(unpicked.length ? amberBox : {}) }}><label>Not found among your pupils — who are they?</label>
                  <span className="text-muted" style={{ fontSize: 12 }}>Pick the pupil for each name, or leave it out (their marks aren't imported).</span>
                  <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
                    {unknown.map(n => {
                      const near = likely(n);
                      return (
                        <div key={n} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.2fr)', gap: 8, alignItems: 'center', fontSize: 13.5 }}>
                          <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{n}</span>
                          <select value={picked[n] || ''} aria-label={`Which pupil is ${n}?`} onChange={e => setPicked(x => ({ ...x, [n]: e.target.value }))}
                            style={picked[n] ? undefined : { color: 'var(--amber-text)' }}>
                            <option value="">Leave out</option>
                            {near.length > 0 && <optgroup label="Close names">{near.map(p => <option key={p.id} value={p.id}>{p.forename} {p.surname}{p.class ? ` · ${p.class}` : ''}</option>)}</optgroup>}
                            <optgroup label="All pupils">{allPupils.map(p => <option key={p.id} value={p.id}>{p.forename} {p.surname}{p.class ? ` · ${p.class}` : ''}</option>)}</optgroup>
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div style={{ background: '#f3f4f6', borderRadius: 'var(--r-md)', padding: '10px 12px', fontSize: 12.5, lineHeight: 1.5 }}>
                Marks already in Suhuf for these pupils will be <b>replaced</b> by the ones in your sheet. Empty boxes leave a mark as it is.
              </div>
            </>}
          </>}
          {error && <div style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>}
        </div>
        <div className="modal-footer">
          {done || step === 1
            ? <button className="btn" onClick={close}>{done ? 'Close' : 'Cancel'}</button>
            : <button className="btn" onClick={() => setStep(step - 1)} disabled={busy}>Back</button>}
          {!done && step === 2 && <button className="btn btn-primary" disabled={!next[2]} onClick={() => setStep(3)}>Next: your marks</button>}
          {!done && step === 3 && <button className="btn btn-primary" onClick={() => setStep(4)}>Next: check and import</button>}
          {!done && step === 4 && <button className="btn btn-primary" disabled={busy || !marksCount} onClick={run}>{busy ? 'Working…' : `Import ${marksCount} marks`}</button>}
        </div>
      </div>
    </div>
  );
}
