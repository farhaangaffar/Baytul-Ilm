import React, { useState, useRef, useMemo } from 'react';
import { X, Upload, Download, FileSpreadsheet, ArrowLeft } from 'lucide-react';
import { importStudents, getDefaultWeeklyFee } from '../lib/store';
import { parseSheet, parseDate, SHEET_COLUMNS } from '../lib/studentSheet';
import { xlsxBlob, downloadBlob, xlsxToText } from '../lib/xlsx';

// Students → Import: paste rows copied from Excel / Google Sheets (or choose a .csv), check
// them, then add them all at once. Class names the madrasah doesn't have yet can be matched
// to an existing class, added as new classes, or put on the waiting list.
const WAITING = 'Waiting list';
const NEW = '__new__';
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, '');
const today = () => new Date().toISOString().slice(0, 10);

export default function ImportStudents({ classNames, students, onClose, onDone }) {
  const [text, setText] = useState('');
  const [step, setStep] = useState('paste'); // paste → check
  const [classMap, setClassMap] = useState({}); // sheet class name → class / NEW / WAITING
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const parsed = useMemo(() => parseSheet(text), [text]);
  const existing = useMemo(() => new Set(students.map(s => norm(s.forename + s.surname))), [students]);

  // Each different class name in the sheet, with a best guess at what it means here.
  const sheetClasses = useMemo(() => {
    const names = [...new Set(parsed.rows.map(r => (r.class || '').trim()))];
    return names.map(name => {
      const match = classNames.find(c => norm(c) === norm(name));
      return { name, guess: !name ? (classNames.length === 1 ? classNames[0] : WAITING) : match || (/wait/i.test(name) ? WAITING : NEW) };
    });
  }, [parsed, classNames]);
  const classFor = name => classMap[name] ?? sheetClasses.find(c => c.name === name)?.guess ?? WAITING;

  const checked = parsed.rows.map(r => {
    const issues = [];
    if (!r.forename || !r.surname) return { r, skip: 'No name' };
    if (existing.has(norm(r.forename + r.surname))) return { r, skip: 'Already added' };
    const dob = parseDate(r.dob);
    if (dob === null) issues.push(`date of birth "${r.dob}" not understood`);
    return { r, dob: dob || '', issues };
  });
  const toAdd = checked.filter(c => !c.skip);
  const skipped = checked.filter(c => c.skip);

  async function chooseFile(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (/\.xlsx$/i.test(f.name)) {
      try { setText(await xlsxToText(f)); setError(''); }
      catch { setError("Couldn't read that Excel file — open it, copy the rows and paste them here instead."); }
      return;
    }
    if (/\.(xls|numbers|ods)$/i.test(f.name)) { setError('Save it as an Excel (.xlsx) file first — or copy the rows and paste them here.'); return; }
    const reader = new FileReader();
    reader.onload = () => { setText(String(reader.result || '')); setError(''); };
    reader.readAsText(f);
  }

  async function add() {
    setBusy(true); setError('');
    try {
      const fee = await getDefaultWeeklyFee().catch(() => 15);
      const newClasses = sheetClasses.filter(c => classFor(c.name) === NEW).map(c => c.name);
      const list = toAdd.map(({ r, dob }) => {
        const mapped = classFor((r.class || '').trim());
        const cls = mapped === NEW ? r.class.trim() : mapped;
        const left = /left|inactive/i.test(r.status || '') || !!parseDate(r.leaveDate);
        const amount = parseFloat(String(r.weeklyFee || '').replace(/[^0-9.]/g, ''));
        return {
          forename: r.forename, surname: r.surname, class: cls, dob,
          parent1Name: r.parent1Name, parent1Phone: r.parent1Phone, parent2Name: r.parent2Name, parent2Phone: r.parent2Phone,
          weeklyFee: Number.isFinite(amount) ? amount : fee,
          enrollDate: parseDate(r.enrollDate) || today(),
          status: left ? 'Inactive' : 'Active', leaveDate: parseDate(r.leaveDate) || (left ? today() : ''),
          notes: r.notes,
        };
      });
      const res = await importStudents(list, newClasses);
      onDone(`${res.added} student${res.added === 1 ? '' : 's'} added${res.classesAdded ? ` · ${res.classesAdded} new class${res.classesAdded === 1 ? '' : 'es'}` : ''}`);
    } catch (err) { setError(err.message || 'Could not add the students'); }
    setBusy(false);
  }

  const blankSheet = () => downloadBlob(xlsxBlob([SHEET_COLUMNS.slice(0, 9).map(c => c[1])], 'Students'), 'students-template.xlsx');
  const sel = { padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', fontFamily: 'var(--font)', fontSize: 13, minWidth: 0, maxWidth: '100%' };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <div className="modal-title"><FileSpreadsheet size={16} style={{ verticalAlign: '-3px', marginRight: 6 }} />Add students from a spreadsheet</div>
          <button className="btn btn-icon" onClick={onClose} disabled={busy}><X size={16} /></button>
        </div>
        <div className="modal-body">
          {step === 'paste' ? (<>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>
              In Excel or Google Sheets, select the rows (with the heading row) and copy them, then paste below. Or choose the file (.xlsx or .csv).
            </div>
            <textarea value={text} onChange={e => { setText(e.target.value); setError(''); }} rows={8} placeholder={'Forename\tSurname\tClass\tDate of birth\tParent 1 name\tParent 1 phone\nAisha\tPatel\tQaa\'idah 1\t04/05/2017\tFatima Patel\t07700 900123'}
              style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: 12, padding: 10, border: '1px solid var(--border)', borderRadius: 'var(--r-md)', resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              <button className="btn btn-sm" onClick={() => fileRef.current?.click()}><Upload size={13} />Choose a file</button>
              <button className="btn btn-sm" onClick={blankSheet}><Download size={13} />Blank sheet to fill in</button>
              <input ref={fileRef} type="file" accept=".xlsx,.csv,text/csv,.tsv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={chooseFile} style={{ display: 'none' }} />
            </div>
            {text && !parsed.rows.length && <div style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 8 }}>No rows found.</div>}
            {text && parsed.rows.length > 0 && !parsed.headed && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>No heading row found — reading the columns as Forename, Surname, Class, Date of birth, Parent 1 name, Parent 1 phone…</div>}
          </>) : (<>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{toAdd.length} student{toAdd.length === 1 ? '' : 's'} to add</div>
            {skipped.length > 0 && <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 4 }}>
              {skipped.length} skipped: {skipped.slice(0, 4).map(c => `${[c.r.forename, c.r.surname].filter(Boolean).join(' ') || 'a row'} (${c.skip.toLowerCase()})`).join(', ')}{skipped.length > 4 ? '…' : ''}
            </div>}
            {sheetClasses.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div className="form-section-title" style={{ marginBottom: 8 }}>Classes</div>
                <div style={{ display: 'grid', gap: 6 }}>
                  {sheetClasses.map(c => {
                    const n = toAdd.filter(x => (x.r.class || '').trim() === c.name).length;
                    if (!n) return null;
                    return (
                      <div key={c.name || '—'} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.2fr)', gap: 8, alignItems: 'center', fontSize: 13 }}>
                        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <strong>{c.name || 'No class given'}</strong> <span className="text-muted">· {n}</span>
                        </span>
                        <select value={classFor(c.name)} onChange={e => setClassMap(m => ({ ...m, [c.name]: e.target.value }))} style={sel} aria-label={`Class for ${c.name || 'no class'}`}>
                          {c.name && !classNames.some(x => norm(x) === norm(c.name)) && <option value={NEW}>Add new class "{c.name}"</option>}
                          {classNames.map(x => <option key={x} value={x}>{x}</option>)}
                          <option value={WAITING}>Waiting list</option>
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="form-section-title" style={{ margin: '14px 0 8px' }}>Students</div>
            <div style={{ display: 'grid', gap: 4, maxHeight: 260, overflowY: 'auto' }}>
              {toAdd.map((c, i) => (
                <div key={i} style={{ background: '#f3f4f6', borderRadius: 'var(--r-md)', padding: '6px 10px', fontSize: 12.5 }}>
                  <strong>{c.r.forename} {c.r.surname}</strong>
                  <span className="text-muted"> · {(() => { const m = classFor((c.r.class || '').trim()); return m === NEW ? c.r.class : m; })()}{c.dob ? ` · born ${c.dob.split('-').reverse().join('/')}` : ''}{c.r.parent1Phone ? ` · ${c.r.parent1Phone}` : ''}</span>
                  {c.issues.length > 0 && <div style={{ color: 'var(--amber-text)', fontSize: 11.5 }}>{c.issues.join('; ')} — left blank</div>}
                </div>
              ))}
            </div>
          </>)}
          {error && <div style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 10 }}>{error}</div>}
        </div>
        <div className="modal-footer">
          {step === 'paste' ? (<>
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" style={{ background: 'var(--blue)' }} disabled={!parsed.rows.length} onClick={() => setStep('check')}>Next</button>
          </>) : (<>
            <button className="btn" onClick={() => setStep('paste')} disabled={busy}><ArrowLeft size={13} />Back</button>
            <button className="btn btn-primary" style={{ background: 'var(--blue)' }} disabled={!toAdd.length || busy} onClick={add}>
              {busy ? 'Adding…' : `Add ${toAdd.length} student${toAdd.length === 1 ? '' : 's'}`}
            </button>
          </>)}
        </div>
      </div>
    </div>
  );
}
