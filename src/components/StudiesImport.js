// Islamic Studies → "Import marks from your spreadsheets" (head): a school's own assessment workbook — one sheet per year
// group, a First Name and Surname column, then a column per surah or du'aa holding 1 (Incomplete), 2 (Completed with
// help) or 3 (Achieved), an empty box meaning not assessed yet. Each sheet's pupils are matched to the school's pupils by
// name and each column to its list by name (spellings boiled down — "Faatihah" = "Al-Fatihah"; a surah also by its
// number); columns not on the list yet can be added, each with the year it's learnt in. Read in the browser
// (src/lib/xlsx.js); only the matched marks are sent (server/routes/studies.js ?action=import).
import React, { useState } from 'react';
import { X, Upload, Check } from 'lucide-react';
import { xlsxSheets } from '../lib/xlsx';
import { getStudents, getStudiesItems, saveStudiesItem, importStudiesMarks, removeStudiesItems } from '../lib/store';
import { markMarksImported } from './GettingStarted';
import { useAuth } from '../lib/AuthContext';
import { STUDY_KINDS, yearLabel, plainName, surahNumber } from '../lib/studies';
import { useBackToClose } from '../lib/useBackToClose';

const personKey = (first, last) => `${first} ${last}`.toLowerCase().replace(/[^a-z]/g, '');
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
  let h = rows.findIndex(r => r.some(isFirst) && r.some(isLast));
  let full = false;
  if (h < 0) { h = rows.findIndex(r => r.some(isFull)); full = h >= 0; }
  if (h < 0) return null;
  const hdr = rows[h];
  const fi = full ? hdr.findIndex(isFull) : hdr.findIndex(isFirst), si = full ? fi : hdr.findIndex(isLast);
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
    out.push({ first, last, values });
  }
  const sections = {};
  for (const r of rows.slice(0, h)) {
    let cur = null, any = false;
    const lab = [];
    for (let i = 0; i < Math.max(r.length, hdr.length); i++) {
      if (String(r[i] || '').trim()) { cur = wordKind(r[i]); if (cur) any = true; }
      lab[i] = cur;
    }
    if (any) cols.forEach(([i, c]) => { if (lab[i]) sections[c] = lab[i]; });
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
  const [newKinds, setNewKinds] = useState({}); // new column → its list, when changed by hand
  const [sheets, setSheets] = useState(null); // parsed sheets
  const [use, setUse] = useState({}); // sheet name → ticked
  const [pupils, setPupils] = useState([]);
  const [items, setItems] = useState([]);
  const [newYears, setNewYears] = useState({}); // new column → year group, or 'skip'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const [drop, setDrop] = useState([]); // after the import: ready-made items not in the spreadsheet, ticked to remove
  const [dropped, setDropped] = useState(null);

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
      setSheets(parsed);
      setUse(Object.fromEntries(parsed.map(s => [s.name, s.year !== null])));
      setPupils(studs.filter(s => s.status !== 'Inactive'));
      setItems(its.items);
      setNewYears({}); setNewKinds({});
    } catch (e) { setError(e.message || 'Could not read that file — save it as .xlsx and try again.'); }
    setBusy(false);
  }

  const chosen = (sheets || []).filter(s => use[s.name]);
  const byPerson = Object.fromEntries(pupils.map(p => [personKey(p.forename, p.surname), p]));
  // Each column finds its own list (one sheet can mix surahs, du'aas and practicals): a hint from the section row above it
  // or its own words, then the school's lists (that list first, then any), then a surah's name, then the column before it.
  const findIn = (list, col) => list.find(i => plainName(i.name) === plainName(col) || (i.kind === 'surah' && i.surah && i.surah === surahNumber(col)));
  const kindOf = {}, itemOf = {};
  for (const sh of chosen) {
    let prev = null;
    for (const c of sh.columns) {
      if (kindOf[c]) { prev = kindOf[c]; continue; }
      const hint = newKinds[c] || sh.sections[c] || wordKind(c);
      const it = newKinds[c] ? findIn(items.filter(i => i.kind === newKinds[c]), c)
        : (hint && findIn(items.filter(i => i.kind === hint), c)) || findIn(items, c);
      kindOf[c] = newKinds[c] || (it ? it.kind : hint || (surahNumber(c) ? 'surah' : prev) || 'surah');
      if (it) itemOf[c] = it;
      prev = kindOf[c];
    }
  }
  const matchItem = col => itemOf[col];
  const columns = [...new Set(chosen.flatMap(s => s.columns))];
  const perKind = STUDY_KINDS.map(([k, label]) => [label, columns.filter(c => kindOf[c] === k).length]).filter(([, n]) => n);
  const matched = columns.filter(c => matchItem(c));
  const fresh = columns.filter(c => !matchItem(c));
  // A new column's year: the earliest ticked sheet whose pupils have marks in it.
  const colourYear = c => chosen.map(sh => sh.colYears?.[c]).find(y => y !== undefined);
  const guessYear = c => {
    if (colourYear(c) !== undefined) return colourYear(c);
    const ys = chosen.filter(s => s.rows.some(r => r.values[c])).map(s => s.year).filter(y => y !== null);
    return ys.length ? Math.min(...ys) : 0;
  };
  const yearFor = c => (newYears[c] === undefined ? guessYear(c) : newYears[c]);
  // Already on the list but the sheet's colours say another year (e.g. added to the wrong year by an earlier import):
  // "Learnt in" moves to the colour's year.
  const moves = columns.filter(c => itemOf[c] && colourYear(c) !== undefined && colourYear(c) !== itemOf[c].yearGroup)
    .filter((c, i, a) => a.findIndex(x => itemOf[x].id === itemOf[c].id) === i);
  const rowsFound = chosen.flatMap(s => s.rows);
  const unknown = [...new Set(rowsFound.filter(r => !byPerson[personKey(r.first, r.last)]).map(r => `${r.first} ${r.last}`))];
  const marksCount = rowsFound.filter(r => byPerson[personKey(r.first, r.last)])
    .reduce((t, r) => t + Object.keys(r.values).filter(c => matchItem(c) || yearFor(c) !== 'skip').length, 0);

  // The school's own list replaces ours: items of the lists the spreadsheet has (surahs, du'aas …), in the years its
  // sheets are for (all years if no sheet names a year), that no column matched.
  function spareItems(ids) {
    const used = new Set(Object.values(ids).map(String));
    const kinds = new Set(Object.keys(ids).map(c => kindOf[c]));
    const ys = chosen.map(s => s.year).filter(y => y !== null);
    const lo = ys.length ? Math.min(...ys) : -Infinity, hi = ys.length ? Math.max(...ys) : Infinity;
    return items.filter(i => kinds.has(i.kind) && !used.has(String(i.id)) && i.yearGroup >= lo && i.yearGroup <= hi)
      .sort((a, b) => a.yearGroup - b.yearGroup || STUDY_KINDS.findIndex(k => k[0] === a.kind) - STUDY_KINDS.findIndex(k => k[0] === b.kind));
  }

  async function removeSpare() {
    setBusy(true); setError('');
    try { const r = await removeStudiesItems(drop); setDropped(r.removed); await onDone?.(); }
    catch (e) { setError(e.message || 'Could not remove them'); }
    setBusy(false);
  }

  async function run() {
    setBusy(true); setError('');
    try {
      const ids = Object.fromEntries(matched.map(c => [c, matchItem(c).id]));
      for (const c of moves) {
        const it = itemOf[c];
        await saveStudiesItem({ id: it.id, kind: it.kind, name: it.name, detail: it.detail || '', yearGroup: colourYear(c), surah: it.surah });
      }
      for (const c of fresh) {
        if (yearFor(c) === 'skip') continue;
        const r = await saveStudiesItem({ kind: kindOf[c], name: c, detail: '', yearGroup: Number(yearFor(c)), surah: kindOf[c] === 'surah' ? surahNumber(c) : null });
        ids[c] = r.id;
      }
      const marks = new Map(); // later sheets win
      for (const s of chosen) for (const r of s.rows) {
        const p = byPerson[personKey(r.first, r.last)];
        if (!p) continue;
        for (const [c, level] of Object.entries(r.values)) if (ids[c]) marks.set(`${p.id}|${ids[c]}`, { studentId: p.id, itemId: ids[c], level });
      }
      const list = [...marks.values()];
      let n = 0;
      for (let i = 0; i < list.length; i += 4000) n += (await importStudiesMarks(list.slice(i, i + 4000))).imported;
      setDone({ moved: moves.length, marks: n, added: fresh.filter(c => yearFor(c) !== 'skip').length, spare: spareItems(ids) });
      setDrop(spareItems(ids).map(i => i.id));
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
              <Check size={15} style={{ verticalAlign: -2 }} /> Imported {done.marks} marks{done.added ? ` and added ${done.added} to your list` : ''}{done.moved ? `; moved ${done.moved} to the year your colours show` : ''}.
            </div>
            {dropped !== null ? (dropped >= 0 &&
              <div style={{ fontSize: 14, color: 'var(--green-text)' }}><Check size={15} style={{ verticalAlign: -2 }} /> Removed {dropped} — your lists are now your own.</div>
            ) : done.spare.length > 0 && (
              <div style={{ display: 'grid', gap: 8, background: '#f3f4f6', borderRadius: 'var(--r-md)', padding: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Use your own list instead of ours?</div>
                <div className="text-muted" style={{ fontSize: 13 }}>
                  Your spreadsheet doesn't have {done.spare.length === 1 ? 'this one' : `these ${done.spare.length}`} from our ready-made list. Remove the ticked ones (and any marks on them)?
                </div>
                <div style={{ display: 'grid', gap: 2, maxHeight: 300, overflowY: 'auto', background: '#fff', borderRadius: 'var(--r-md)', padding: '6px 10px' }}>
                  {[...new Set(done.spare.map(i => i.yearGroup))].map(y => {
                    const list = done.spare.filter(i => i.yearGroup === y);
                    const all = list.every(i => drop.includes(i.id));
                    return (
                      <div key={y} style={{ display: 'grid', gap: 2, padding: '4px 0' }}>
                        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, fontWeight: 600, textTransform: 'none', letterSpacing: 0, color: 'var(--ink)' }}>
                          <input type="checkbox" checked={all} onChange={() => setDrop(d => (all ? d.filter(id => !list.some(i => i.id === id)) : [...new Set([...d, ...list.map(i => i.id)])]))} />
                          {yearLabel(y)}
                        </label>
                        {list.map(i => (
                          <label key={i.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, paddingLeft: 22, textTransform: 'none', letterSpacing: 0, fontWeight: 400, color: 'var(--ink)' }}>
                            <input type="checkbox" checked={drop.includes(i.id)} onChange={() => setDrop(d => (d.includes(i.id) ? d.filter(x => x !== i.id) : [...d, i.id]))} />
                            <span style={{ minWidth: 0 }}>{i.name} <span className="text-muted" style={{ fontSize: 12 }}>· {STUDY_KINDS.find(k => k[0] === i.kind)[2]}</span></span>
                          </label>
                        ))}
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn btn-primary" disabled={busy || !drop.length} onClick={removeSpare}>{busy ? 'Removing…' : `Remove ${drop.length}`}</button>
                  <button className="btn" disabled={busy} onClick={() => setDropped(-1)}>Keep them</button>
                </div>
              </div>
            )}
          </> : <>
            <div className="text-muted" style={{ fontSize: 13 }}>
              Your workbook as it is: a sheet per year, First Name and Surname, then a column per surah, du'aa or practical (all on
              one sheet is fine) with 1 (Incomplete), 2 (Completed with help) or 3 (Achieved). Empty boxes stay "not assessed".
              Add your pupils first (Pupils → Import).
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
                      <span><b>{s.name}</b> · {s.rows.length} pupils</span>
                    </label>
                  ))}
                </div>
                <span className="text-muted" style={{ fontSize: 12 }}>Sheets that aren't a year group (e.g. last years' "2025") start unticked.</span>
              </div>
              <div className="box-row-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 6 }}>
                <div className="info-box"><strong>{rowsFound.length - unknown.length}</strong><span className="info-box-label">Pupils matched</span></div>
                <div className="info-box"><strong>{matched.length}</strong><span className="info-box-label">Columns matched</span></div>
                <div className="info-box"><strong>{marksCount}</strong><span className="info-box-label">Marks to import</span></div>
              </div>
              {perKind.length > 0 && (
                <div className="text-muted" style={{ fontSize: 12.5 }}>Columns found: {perKind.map(([l, n]) => `${l} ${n}`).join(' · ')}</div>
              )}
              {moves.length > 0 && (
                <div style={{ fontSize: 12.5, color: 'var(--ink)', background: '#f3f4f6', borderRadius: 'var(--r-md)', padding: '8px 10px' }}>
                  Your colours put {moves.length === 1 ? 'this' : `these ${moves.length}`} in another year — {moves.length === 1 ? 'it' : 'they'}'ll move:{' '}
                  {moves.slice(0, 8).map(c => `${itemOf[c].name} (${yearLabel(itemOf[c].yearGroup)} → ${yearLabel(colourYear(c))})`).join(', ')}{moves.length > 8 ? '…' : ''}
                </div>
              )}
              {unknown.length > 0 && (
                <div style={{ fontSize: 12.5, color: 'var(--amber-text)' }}>
                  {unknown.length} not found among your pupils (left out): {unknown.slice(0, 8).join(', ')}{unknown.length > 8 ? '…' : ''}
                </div>
              )}
              {fresh.length > 0 && (
                <div className="form-group"><label>Not on your list yet — add them?</label>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {fresh.map(c => (
                      <div key={c} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 108px 130px', gap: 6, alignItems: 'center', fontSize: 13.5 }}>
                        <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{c}</span>
                        <select value={kindOf[c]} aria-label={`${c}: which list`} onChange={e => setNewKinds(n => ({ ...n, [c]: e.target.value }))}>
                          {STUDY_KINDS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                        </select>
                        <select value={yearFor(c)} onChange={e => setNewYears(n => ({ ...n, [c]: e.target.value === 'skip' ? 'skip' : Number(e.target.value) }))}>
                          {Array.from({ length: 14 }, (_, y) => <option key={y} value={y}>Add · {yearLabel(y)}</option>)}
                          <option value="skip">Leave out</option>
                        </select>
                      </div>
                    ))}
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
