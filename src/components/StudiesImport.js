// Islamic Studies → "Import marks from your spreadsheets" (head): a school's own assessment workbook — one sheet per year
// group, a First Name and Surname column, then a column per surah or du'aa holding 1 (Incomplete), 2 (Completed with
// help) or 3 (Achieved), an empty box meaning not assessed yet. Each sheet's pupils are matched to the school's pupils by
// name and each column to its list by name (spellings boiled down — "Faatihah" = "Al-Fatihah"; a surah also by its
// number); columns not on the list yet can be added, each with the year it's learnt in. Read in the browser
// (src/lib/xlsx.js); only the matched marks are sent (server/routes/studies.js ?action=import).
import React, { useState } from 'react';
import { X, Upload, Check } from 'lucide-react';
import { xlsxSheets } from '../lib/xlsx';
import { getStudents, getStudiesItems, saveStudiesItem, importStudiesMarks } from '../lib/store';
import { STUDY_KINDS, yearLabel, plainName, surahNumber } from '../lib/studies';
import { ChoiceBoxes } from './StudentDetails';
import { useBackToClose } from '../lib/useBackToClose';

const personKey = (first, last) => `${first} ${last}`.toLowerCase().replace(/[^a-z]/g, '');
const yearFromSheet = name => (/reception|^rec\b/i.test(name) ? 0 : (/(?:year|yr|y)\s*(\d{1,2})/i.exec(name) || /^(\d{1,2})[a-z]?$/i.exec(name.trim()) || [])[1]);

// One sheet → { name, year, columns: [header…], rows: [{ first, last, values: { header: '1'|'2'|'3' } }] }
function readSheet({ name, rows }) {
  const h = rows.findIndex(r => r.some(c => /^first\s*name$/i.test(c)) && r.some(c => /^(surname|last\s*name)$/i.test(c)));
  if (h < 0) return null;
  const hdr = rows[h];
  const fi = hdr.findIndex(c => /^first\s*name$/i.test(c)), si = hdr.findIndex(c => /^(surname|last\s*name)$/i.test(c));
  const cols = [];
  for (let i = Math.max(fi, si) + 1; i < hdr.length; i++) {
    if (/^first\s*name$/i.test(hdr[i])) break; // the sheet's summary block starts again with the names
    if (hdr[i]) cols.push([i, hdr[i]]);
  }
  const out = [];
  for (const r of rows.slice(h + 1)) {
    const first = (r[fi] || '').trim(), last = (r[si] || '').trim();
    if (!first || /average/i.test(first)) { if (out.length) break; continue; }
    const values = {};
    cols.forEach(([i, c]) => { const v = String(r[i] || '').trim(); if (['1', '2', '3'].includes(v)) values[c] = Number(v); });
    out.push({ first, last, values });
  }
  const y = yearFromSheet(name);
  return { name, year: y === undefined ? null : Number(y), columns: cols.map(c => c[1]), rows: out };
}

export default function StudiesImport({ onClose, onDone }) {
  const close = useBackToClose(true, onClose);
  const [kind, setKind] = useState('surah');
  const [sheets, setSheets] = useState(null); // parsed sheets
  const [use, setUse] = useState({}); // sheet name → ticked
  const [pupils, setPupils] = useState([]);
  const [items, setItems] = useState([]);
  const [newYears, setNewYears] = useState({}); // new column → year group, or 'skip'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);

  async function pick(file) {
    setError(''); setBusy(true);
    try {
      const [book, studs, its] = await Promise.all([xlsxSheets(file), getStudents(), getStudiesItems()]);
      const parsed = book.map(readSheet).filter(Boolean);
      if (!parsed.length) throw new Error('No sheet with "First Name" and "Surname" columns was found.');
      const title = book.map(s => (s.rows[0] || []).join(' ')).join(' ');
      setKind(/du'?a/i.test(title) ? 'duaa' : /surah|suraah/i.test(title) ? 'surah' : kind);
      setSheets(parsed);
      setUse(Object.fromEntries(parsed.map(s => [s.name, s.year !== null])));
      setPupils(studs.filter(s => s.status !== 'Inactive'));
      setItems(its.items);
      setNewYears({});
    } catch (e) { setError(e.message || 'Could not read that file — save it as .xlsx and try again.'); }
    setBusy(false);
  }

  const chosen = (sheets || []).filter(s => use[s.name]);
  const byPerson = Object.fromEntries(pupils.map(p => [personKey(p.forename, p.surname), p]));
  const mine = items.filter(i => i.kind === kind);
  const matchItem = col => mine.find(i => plainName(i.name) === plainName(col) || (kind === 'surah' && i.surah && i.surah === surahNumber(col)));
  const columns = [...new Set(chosen.flatMap(s => s.columns))];
  const matched = columns.filter(c => matchItem(c));
  const fresh = columns.filter(c => !matchItem(c));
  // A new column's year: the earliest ticked sheet whose pupils have marks in it.
  const guessYear = c => {
    const ys = chosen.filter(s => s.rows.some(r => r.values[c])).map(s => s.year).filter(y => y !== null);
    return ys.length ? Math.min(...ys) : 0;
  };
  const yearFor = c => (newYears[c] === undefined ? guessYear(c) : newYears[c]);
  const rowsFound = chosen.flatMap(s => s.rows);
  const unknown = [...new Set(rowsFound.filter(r => !byPerson[personKey(r.first, r.last)]).map(r => `${r.first} ${r.last}`))];
  const marksCount = rowsFound.filter(r => byPerson[personKey(r.first, r.last)])
    .reduce((t, r) => t + Object.keys(r.values).filter(c => matchItem(c) || yearFor(c) !== 'skip').length, 0);

  async function run() {
    setBusy(true); setError('');
    try {
      const ids = Object.fromEntries(matched.map(c => [c, matchItem(c).id]));
      for (const c of fresh) {
        if (yearFor(c) === 'skip') continue;
        const r = await saveStudiesItem({ kind, name: c, detail: '', yearGroup: Number(yearFor(c)), surah: kind === 'surah' ? surahNumber(c) : null });
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
      setDone({ marks: n, added: fresh.filter(c => yearFor(c) !== 'skip').length });
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
          {done ? (
            <div style={{ fontSize: 14, color: 'var(--green-text)' }}>
              <Check size={15} style={{ verticalAlign: -2 }} /> Imported {done.marks} marks{done.added ? ` and added ${done.added} to your list` : ''}.
            </div>
          ) : <>
            <div className="text-muted" style={{ fontSize: 13 }}>
              Your workbook as it is: a sheet per year, First Name and Surname, then a column per surah or du'aa with 1 (Incomplete),
              2 (Completed with help) or 3 (Achieved). Empty boxes stay "not assessed". Add your pupils first (Pupils → Import).
            </div>
            <label className="btn" style={{ justifyContent: 'center', cursor: 'pointer' }}>
              <Upload size={14} /> {sheets ? 'Choose another file' : 'Choose the .xlsx file'}
              <input type="file" accept=".xlsx" hidden onChange={e => e.target.files[0] && pick(e.target.files[0])} />
            </label>
            {sheets && <>
              <div className="form-group"><label>This sheet is for</label>
                <ChoiceBoxes options={STUDY_KINDS.map(k => k[1])} value={STUDY_KINDS.find(k => k[0] === kind)[1]}
                  onChange={v => { setKind(STUDY_KINDS.find(k => k[1] === v)[0]); setNewYears({}); }} /></div>
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
              {unknown.length > 0 && (
                <div style={{ fontSize: 12.5, color: 'var(--amber-text)' }}>
                  {unknown.length} not found among your pupils (left out): {unknown.slice(0, 8).join(', ')}{unknown.length > 8 ? '…' : ''}
                </div>
              )}
              {fresh.length > 0 && (
                <div className="form-group"><label>Not on your list yet — add them?</label>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {fresh.map(c => (
                      <div key={c} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 150px', gap: 8, alignItems: 'center', fontSize: 13.5 }}>
                        <span>{c}</span>
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
