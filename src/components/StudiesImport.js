// Islamic Studies → "Import marks from your spreadsheets" (head): a school's own assessment workbook — one sheet per year
// group, a First Name and Surname column, then a column per surah or du'aa holding 1 (Incomplete), 2 (Completed with
// help) or 3 (Achieved), an empty box meaning not assessed yet. Each sheet's pupils are matched to the school's pupils by
// name and each column to its list by name (spellings boiled down — "Faatihah" = "Al-Fatihah"; a surah also by its
// number). **Marks only** (the owner's choice): the import never adds, renames or moves a surah/du'aa — what each year
// learns is set in the Year plan (Studies.js YearPlan); a column not in the plan is listed and left out. Read in the
// browser (src/lib/xlsx.js); only the matched marks are sent (server/routes/studies.js ?action=import).
import React, { useState, useMemo, useRef } from 'react';
import { X, Upload, Check, AlertTriangle, ArrowDown } from 'lucide-react';
import { xlsxSheets } from '../lib/xlsx';
import { getStudents, getStudiesItems, importStudiesMarks } from '../lib/store';
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

// A colour legend (the owner's sheets: each du'aa's column coloured by the year it's learnt in, a key at the bottom): every
// coloured cell, other than the headings row, whose own words — or the words just beside it — name a year.
function readLegend(rows, fills, h) {
  const legend = {};
  rows.forEach((r, ri) => {
    if (ri === h) return;
    (fills[ri] || []).forEach((f, ci) => {
      if (!f || legend[f] !== undefined) return;
      let y = legendYear(r[ci]);
      for (let d = 1; y === undefined && d <= 3; d++) {
        if (String(r[ci + d] || '').trim()) { y = legendYear(r[ci + d]); if (y === undefined && !(fills[ri] || [])[ci + d]) break; }
      }
      if (y === undefined && ci > 0 && !(fills[ri] || [])[ci - 1]) y = legendYear(r[ci - 1]);
      if (y !== undefined) legend[f] = y;
    });
  });
  return legend;
}

// One sheet → { name, year, columns: [header…], sections: { header: kind }, colYears: { header: year from its colour },
// rows: [{ first, last, values: { header: 1|2|3 } }] }
// One sheet can hold surahs AND du'aas (and practicals): a row above the headings like "Surahs … Du'aas" (often merged
// cells, so the word sits over the first column of its group) puts each column in its list. Columns with no 1/2/3 in them
// (a Total or % column) are left out.
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
  const cols = [];
  for (let i = Math.max(fi, si) + 1; i < hdr.length; i++) {
    if (isFirst(hdr[i]) || (full && isFull(hdr[i]))) break; // the sheet's summary block starts again with the names
    if (hdr[i]) cols.push([i, hdr[i]]);
  }
  const out = [];
  for (const r of rows.slice(h + 1)) {
    let first = (r[fi] || '').trim(), last = (r[si] || '').trim();
    if (full) { const parts = first.split(/\s+/); last = parts.length > 1 ? parts.pop() : ''; first = parts.join(' '); }
    if (!first || /average/i.test(first) || /^(key|legend)\b/i.test(first) || legendYear(`${first} ${last}`) !== undefined) { if (out.length) break; continue; }
    const values = {};
    cols.forEach(([i, c]) => { const v = String(r[i] || '').trim(); if (['1', '2', '3'].includes(v)) values[c] = Number(v); });
    out.push({ first, last, values, sheet: name });
  }
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
    const first = lab.findIndex(Boolean);
    if (any) cols.forEach(([i, c]) => { const k = lab[i] || (i < first ? lab[first] : null); if (k) sections[c] = k; });
  }
  // Each column's year from its colour: the heading's fill, else the fill most of its mark cells share.
  const legend = readLegend(rows, fills, h);
  const colYears = {};
  if (Object.keys(legend).length) cols.forEach(([i, c]) => {
    let f = (fills[h] || [])[i];
    if (legend[f] === undefined) {
      const n = {};
      rows.slice(h + 1, h + 1 + out.length + 5).forEach((_, k) => { const g = (fills[h + 1 + k] || [])[i]; if (legend[g] !== undefined) n[g] = (n[g] || 0) + 1; });
      f = Object.keys(n).sort((a, b) => n[b] - n[a])[0];
    }
    if (legend[f] !== undefined) colYears[c] = legend[f];
  });
  const y = yearFromSheet(name);
  const used = cols.map(c => c[1]).filter(c => out.some(r => r.values[c]));
  return { name, year: y === undefined ? null : Number(y), columns: used, sections, colYears, rows: out };
}

export default function StudiesImport({ onClose, onDone }) {
  const { user } = useAuth();
  const close = useBackToClose(true, onClose);
  const [picked, setPicked] = useState({}); // a name not found → the pupil the head chose for it (id), or none
  const [colPicked, setColPicked] = useState({}); // a column not matched exactly → the item the head chose for it (id), or '' to leave out
  const [sheets, setSheets] = useState(null); // parsed sheets
  const [use, setUse] = useState({}); // sheet name → ticked
  const [pupils, setPupils] = useState([]);
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);

  async function pick(file) {
    setError(''); setBusy(true);
    try {
      const [book, studs, its] = await Promise.all([xlsxSheets(file), getStudents(), getStudiesItems()]);
      const parsed = book.map(readSheet).filter(Boolean);
      if (!parsed.length) {
        // Say what the file's first rows actually hold, so it's clear what to change.
        const seen = book.map(sh => (sh.rows.find(r => r.some(c => c)) || []).filter(Boolean).slice(0, 6).join(', ')).filter(Boolean)[0];
        throw new Error(book.every(sh => !sh.rows.some(r => r.some(c => c)))
          ? 'That file looks empty — open it in Excel or Google Sheets, then "Save as" / "Download" an .xlsx and try again.'
          : `Couldn't find the pupils' name columns (First name and Surname, or one Name column).${seen ? ` The first row reads: ${seen}.` : ''}`);
      }
      // A sheet not named after a year ("Duaas", "Sheet1") takes the year most of its pupils are in (their class's year
      // group). Only sheets named like a past year ("2019") stay unticked — and a file with one sheet is always ticked.
      const finder = pupilFinder(studs.filter(s => s.status !== 'Inactive'));
      parsed.forEach(sh => {
        if (sh.year !== null) return;
        const n = {};
        sh.rows.forEach(r => { const y = guessYearGroup(finder(r.first, r.last)?.pupil?.class); if (y !== null && y !== undefined) n[y] = (n[y] || 0) + 1; });
        const best = Object.keys(n).sort((a, b) => n[b] - n[a])[0];
        if (best !== undefined) { sh.year = Number(best); sh.yearFromPupils = true; }
      });
      setSheets(parsed);
      setUse(Object.fromEntries(parsed.map(s => [s.name, parsed.length === 1 || (s.year !== null && !/^\s*(19|20)\d\d\b/.test(s.name))])));
      setPupils(studs.filter(s => s.status !== 'Inactive'));
      setItems(its.items);
      setPicked({}); setColPicked({});
    } catch (e) { setError(e.message || 'Could not read that file — save it as .xlsx and try again.'); }
    setBusy(false);
  }

  const chosen = (sheets || []).filter(s => use[s.name]);
  // Pupils found by name — exactly, or by a close spelling ("M Husayn" = Muhammad Husayn, Kareem = Karim; nameMatch.js).
  const findPupil = useMemo(() => pupilFinder(pupils), [pupils]);
  // A name not found is picked once per sheet (two sheets can each have their own Bilal Ahmed).
  const nameOf = r => `${r.first} ${r.last}${chosen.length > 1 ? ` · ${r.sheet}` : ''}`;
  const pupilOf = r => (picked[nameOf(r)] ? pupils.find(p => p.id === picked[nameOf(r)]) : findPupil(r.first, r.last)?.pupil);
  // For a name not found: pupils sharing a word of it first (likely the same child), then everyone A to Z.
  const byName = (a, b) => `${a.forename} ${a.surname}`.localeCompare(`${b.forename} ${b.surname}`);
  const allPupils = useMemo(() => [...pupils].sort(byName), [pupils]);
  const likely = name => {
    const w = name.toLowerCase().split(/[\s\-']+/).filter(x => x.length > 2);
    return allPupils.filter(p => `${p.forename} ${p.surname}`.toLowerCase().split(/[\s\-']+/).some(x => w.includes(x)));
  };
  // Each column finds its own list (one sheet can mix surahs, du'aas and practicals): a hint from the section row above it
  // or its own words, then the school's lists (that list first, then any), then a surah's name, then the column before it.
  const findIn = (list, col) => list.find(i => plainName(i.name) === plainName(col) || (i.kind === 'surah' && i.surah && i.surah === surahNumber(col)));
  const kindOf = {}, itemOf = {}, closeOf = {}, yearOfCol = {};
  for (const sh of chosen) {
    let prev = null;
    const sheetKind = wordKind(sh.name); // a sheet called "Duaas" holds du'aas unless a column says otherwise
    for (const c of sh.columns) {
      if (kindOf[c]) { prev = kindOf[c]; continue; }
      yearOfCol[c] = sh.year;
      // A surah's own name ("Bayyinah", "Qadr") always means a surah, whatever heading is above it.
      const hint = (surahNumber(c) ? 'surah' : null) || sh.sections[c] || wordKind(c) || sheetKind;
      const of = hint ? items.filter(i => i.kind === hint) : items;
      let it = findIn(of, c) || findIn(items, c);
      if (!it) { it = closeItem(of, c, sh.year) || (hint ? closeItem(items, c, sh.year) : null); if (it) closeOf[c] = it; }
      kindOf[c] = it ? it.kind : hint || (surahNumber(c) ? 'surah' : prev) || 'surah';
      if (it && !closeOf[c]) itemOf[c] = it;
      prev = kindOf[c];
    }
  }
  // A column matched exactly is used as it is; any other can be chosen by the head (a close match is chosen for them to check).
  const matchItem = col => {
    if (itemOf[col]) return itemOf[col];
    if (colPicked[col] !== undefined) return colPicked[col] ? items.find(i => String(i.id) === String(colPicked[col])) : null;
    return closeOf[col] || null;
  };
  const columns = [...new Set(chosen.flatMap(s => s.columns))];
  const perKind = STUDY_KINDS.map(([k, label]) => [label, columns.filter(c => kindOf[c] === k).length]).filter(([, n]) => n);
  const matched = columns.filter(c => matchItem(c));
  const fresh = columns.filter(c => !matchItem(c)); // not matched (or left out): listed, their marks not imported
  const toCheck = columns.filter(c => !itemOf[c]); // not matched exactly: a drop-down each, so the head can choose
  const freshRef = useRef(null);
  const rowsFound = chosen.flatMap(s => s.rows);
  const unknown = [...new Set(rowsFound.filter(r => !findPupil(r.first, r.last)).map(nameOf))]; // the head can pick each one's pupil
  const nearNames = [...new Map(rowsFound.map(r => [r, findPupil(r.first, r.last)]).filter(([, m]) => m?.close)
    .map(([r, m]) => [`${r.first} ${r.last}`, `${m.pupil.forename} ${m.pupil.surname}`])).entries()];
  const unpicked = unknown.filter(n => !picked[n]); // names still left out — shown up top so they aren't missed (the owner's ask)
  const namesRef = useRef(null);
  const marksCount = rowsFound.filter(r => pupilOf(r))
    .reduce((t, r) => t + Object.keys(r.values).filter(c => matchItem(c)).length, 0);

  async function run() {
    setBusy(true); setError('');
    try {
      const ids = Object.fromEntries(matched.map(c => [c, matchItem(c).id]));
      const marks = new Map(); // later sheets win
      for (const s of chosen) for (const r of s.rows) {
        const p = pupilOf(r);
        if (!p) continue;
        for (const [c, level] of Object.entries(r.values)) if (ids[c]) marks.set(`${p.id}|${ids[c]}`, { studentId: p.id, itemId: ids[c], level });
      }
      const list = [...marks.values()];
      let n = 0;
      for (let i = 0; i < list.length; i += 4000) n += (await importStudiesMarks(list.slice(i, i + 4000))).imported;
      setDone({ marks: n, left: fresh, names: unpicked });
      markMarksImported(user?.madrasah?.code); // ticks Getting started's "Bring in the marks you already have"
      await onDone?.();
    } catch (e) { setError(e.message || 'Could not import'); }
    setBusy(false);
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && close()}>
      <div className="modal" style={{ maxWidth: 560 }}>
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
              <div style={{ fontSize: 13, color: 'var(--amber-text)' }}>
                {done.left.length} column{done.left.length === 1 ? ' was' : 's were'} left out: {done.left.join(', ')}.
                To bring {done.left.length === 1 ? 'it' : 'them'} in, import the file again and choose which {done.left.length === 1 ? 'it is' : 'they are'} — or tick {done.left.length === 1 ? 'it' : 'them'} into a year in <b>Year plan</b> first.
              </div>
            )}
          </> : <>
            <div className="text-muted" style={{ fontSize: 13 }}>
              Your workbook as it is: a sheet per year, First Name and Surname, then a column per surah, du'aa or practical (all on
              one sheet is fine) with 1 (Incomplete), 2 (Completed with help) or 3 (Achieved). Empty boxes stay "not assessed".
              Only marks come in — set what each year learns in <b>Year plan</b> first, and add your pupils (Pupils → Import).
            </div>
            <label className="btn" style={{ justifyContent: 'center', cursor: 'pointer' }}>
              <Upload size={14} /> {sheets ? 'Choose another file' : 'Choose the .xlsx file'}
              <input type="file" accept=".xlsx" hidden onChange={e => e.target.files[0] && pick(e.target.files[0])} />
            </label>
            {sheets && <>
              <div className="form-group"><label>Sheets to bring in</label>
                <div style={{ display: 'grid', gap: 4 }}>
                  {sheets.map(s => (
                    <label key={s.name} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, textTransform: 'none', letterSpacing: 0, fontWeight: 400, color: 'var(--ink)' }}>
                      <input type="checkbox" checked={!!use[s.name]} onChange={e => setUse(u => ({ ...u, [s.name]: e.target.checked }))} />
                      <span><b>{s.name}</b> · {s.rows.length} pupils{s.yearFromPupils ? ` · ${yearLabel(s.year)} (from its pupils' class)` : ''}</span>
                    </label>
                  ))}
                </div>
                <span className="text-muted" style={{ fontSize: 12 }}>Sheets that aren't a year group (e.g. last years' "2025") start unticked.</span>
              </div>
              <div className="box-row-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 6 }}>
                <div className="info-box"><strong>{rowsFound.filter(r => pupilOf(r)).length}</strong><span className="info-box-label">Pupils matched</span></div>
                <div className="info-box"><strong>{matched.length}</strong><span className="info-box-label">Columns matched</span></div>
                <div className="info-box"><strong>{marksCount}</strong><span className="info-box-label">Marks to import</span></div>
              </div>
              {unpicked.length > 0 && (
                <button type="button" onClick={() => namesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', fontFamily: 'var(--font)', fontSize: 13.5, fontWeight: 600, color: 'var(--amber-text)', background: 'var(--amber-light)', border: '1px solid #f1d58a', borderRadius: 'var(--r-md)', padding: '10px 12px', cursor: 'pointer' }}>
                  <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{unpicked.length} name{unpicked.length === 1 ? '' : 's'} not found — their marks won't come in. Choose who they are below.</span>
                  <ArrowDown size={15} style={{ flexShrink: 0 }} />
                </button>
              )}
              {fresh.length > 0 && (
                <button type="button" onClick={() => freshRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', fontFamily: 'var(--font)', fontSize: 13.5, fontWeight: 600, color: 'var(--amber-text)', background: 'var(--amber-light)', border: '1px solid #f1d58a', borderRadius: 'var(--r-md)', padding: '10px 12px', cursor: 'pointer' }}>
                  <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{fresh.length} column{fresh.length === 1 ? '' : 's'} not matched — {fresh.length === 1 ? 'its' : 'their'} marks won't come in. Choose which {fresh.length === 1 ? 'it is' : 'they are'} below.</span>
                  <ArrowDown size={15} style={{ flexShrink: 0 }} />
                </button>
              )}
              {perKind.length > 0 && (
                <div className="text-muted" style={{ fontSize: 12.5 }}>Columns found: {perKind.map(([l, n]) => `${l} ${n}`).join(' · ')}</div>
              )}
              {nearNames.length > 0 && (
                <div style={{ fontSize: 12.5, color: 'var(--ink)', background: '#f3f4f6', borderRadius: 'var(--r-md)', padding: '8px 10px' }}>
                  {nearNames.length} matched by a close spelling — check they're right: {nearNames.slice(0, 10).map(([a, b]) => `${a} → ${b}`).join(', ')}{nearNames.length > 10 ? '…' : ''}
                </div>
              )}
              {unknown.length > 0 && (
                <div className="form-group" ref={namesRef} style={{ scrollMarginTop: 12, ...(unpicked.length ? { border: '1px solid #f1d58a', background: 'var(--amber-light)', borderRadius: 'var(--r-md)', padding: '10px 12px' } : {}) }}><label>Not found among your pupils — who are they?</label>
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
              {toCheck.length > 0 && (
                <div className="form-group" ref={freshRef} style={{ scrollMarginTop: 12, ...(fresh.length ? { border: '1px solid #f1d58a', background: 'var(--amber-light)', borderRadius: 'var(--r-md)', padding: '10px 12px' } : { background: '#f3f4f6', borderRadius: 'var(--r-md)', padding: '10px 12px' }) }}>
                  <label>Columns to check — which surah, du'aa or practical is each?</label>
                  <span className="text-muted" style={{ fontSize: 12 }}>
                    Their names aren't exactly as in your Year plan. Check the ones chosen for you, pick the others, or leave a column out (e.g. a Total).
                  </span>
                  <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
                    {toCheck.map(c => {
                      const cur = matchItem(c);
                      const year = yearOfCol[c];
                      const groups = STUDY_KINDS.map(([k, label]) => [label, items.filter(i => i.kind === k)])
                        .filter(([, list]) => list.length);
                      const thisYear = year !== null && year !== undefined ? items.filter(i => i.yearGroup === year && i.kind === kindOf[c]) : [];
                      return (
                        <div key={c} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.2fr)', gap: 8, alignItems: 'center', fontSize: 13.5 }}>
                          <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{c}</span>
                          <select value={cur ? String(cur.id) : ''} aria-label={`Which is ${c}?`} onChange={e => setColPicked(x => ({ ...x, [c]: e.target.value }))}
                            style={cur ? undefined : { color: 'var(--amber-text)' }}>
                            <option value="">Leave out</option>
                            {thisYear.length > 0 && <optgroup label={`${yearLabel(year)} · ${(STUDY_KINDS.find(([k]) => k === kindOf[c]) || [])[1] || ''}`}>{thisYear.map(i => <option key={`y${i.id}`} value={String(i.id)}>{i.name}</option>)}</optgroup>}
                            {groups.map(([label, list]) => (
                              <optgroup key={label} label={`All ${label.toLowerCase()}`}>
                                {list.map(i => <option key={i.id} value={String(i.id)}>{i.name}{i.yearGroup !== null && i.yearGroup !== undefined ? ` · ${yearLabel(i.yearGroup)}` : ''}</option>)}
                              </optgroup>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>}
          </>}
          {error && <div style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={close}>{done ? 'Close' : 'Cancel'}</button>
          {!done && <button className="btn btn-primary" disabled={busy || !sheets || !marksCount} onClick={run}>{busy ? 'Working…' : `Import ${marksCount} marks`}</button>}
        </div>
      </div>
    </div>
  );
}
