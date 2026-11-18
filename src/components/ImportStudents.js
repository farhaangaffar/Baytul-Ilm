import React, { useState, useRef, useMemo } from 'react';
import { X, Upload, Download, FileSpreadsheet, ArrowLeft } from 'lucide-react';
import { importStudents, getDefaultWeeklyFee, updateStudentDetails } from '../lib/store';
import { parseSheet, parseBook, parseDate, SHEET_COLUMNS, SHEET_LEFT } from '../lib/studentSheet';
import { DETAIL_FIELDS } from '../lib/studentDetails';
import { xlsxBlob, downloadBlob, xlsxSheetTexts } from '../lib/xlsx';

// Students → Import: paste rows copied from Excel / Google Sheets (or choose a .csv), check
// them, then add them all at once. Only children and their details come in — never classes, and
// nobody is put into a class: they land in Students → "Not in a class", grouped by the class their
// sheet named, and the head places them (the sheet's class is kept as a hint, `sheetClass`).
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, '');
const today = () => new Date().toISOString().slice(0, 10);
// What a sheet can fill in for a child already here (never name, class, status or fee).
const UPDATABLE = ['parent1Name', 'parent1Phone', 'parent2Name', 'parent2Phone', ...DETAIL_FIELDS.map(([k]) => k)];
const FIELD_LABEL = { dob: 'date of birth', parent1Name: 'contact 1 name', parent1Phone: 'contact 1 phone', parent2Name: 'contact 2 name', parent2Phone: 'contact 2 phone',
  ...Object.fromEntries(DETAIL_FIELDS.map(([k, label]) => [k, label.toLowerCase()])) };

export default function ImportStudents({ students, onClose, onDone }) {
  const [text, setText] = useState('');
  const [book, setBook] = useState(null); // a chosen .xlsx with several sheets: every sheet comes in
  const [step, setStep] = useState('paste'); // paste → check
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const parsed = useMemo(() => (book ? parseBook(book) : parseSheet(text)), [book, text]);
  const byName = useMemo(() => {
    const m = {};
    students.forEach(s => { const k = norm(s.forename + s.surname); (m[k] = m[k] || []).push(s); });
    return m;
  }, [students]);

  // A child already here: the sheet fills in or changes their details (date of birth, contacts …) — the fields it has a
  // value for that differ from what's saved. Two children with one name: the sheet's class (or sheet name) picks one.
  const changesFor = (s, r, dob) => {
    const out = {};
    if (dob && String(s.dob || '').slice(0, 10) !== dob) out.dob = dob;
    for (const k of UPDATABLE) if (r[k] && String(r[k]).trim() !== String(s[k] || '').trim()) out[k] = String(r[k]).trim();
    return out;
  };
  const checked = parsed.rows.map(r => {
    const issues = [];
    if (!r.forename || !r.surname) return { r, skip: 'No name' };
    const dob = parseDate(r.dob);
    if (dob === null) issues.push(`date of birth "${r.dob}" not understood`);
    let same = byName[norm(r.forename + r.surname)] || [];
    if (same.length > 1 && r.class) { const inClass = same.filter(s => norm(s.class) === norm(r.class) || norm(s.sheetClass) === norm(r.class)); if (inClass.length) same = inClass; }
    if (same.length > 1) return { r, skip: 'Two with this name' };
    if (same.length === 1) {
      const changes = changesFor(same[0], r, dob || '');
      return Object.keys(changes).length ? { r, update: same[0], changes, issues } : { r, skip: 'Already added' };
    }
    return { r, dob: dob || '', issues };
  });
  const toAdd = checked.filter(c => !c.skip && !c.update);
  const toUpdate = checked.filter(c => c.update);
  const skipped = checked.filter(c => c.skip);

  async function chooseFile(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (/\.xlsx$/i.test(f.name)) {
      try {
        const sheets = await xlsxSheetTexts(f);
        if (sheets.length > 1) { setBook(sheets); setText(''); } else { setBook(null); setText(sheets[0]?.text || ''); }
        setError('');
      }
      catch { setError("Couldn't read that Excel file — open it, copy the rows and paste them here instead."); }
      return;
    }
    if (/\.(xls|numbers|ods)$/i.test(f.name)) { setError('Save it as an Excel (.xlsx) file first — or copy the rows and paste them here.'); return; }
    const reader = new FileReader();
    reader.onload = () => { setBook(null); setText(String(reader.result || '')); setError(''); };
    reader.readAsText(f);
  }

  async function add() {
    setBusy(true); setError('');
    try {
      const fee = await getDefaultWeeklyFee().catch(() => 15);
      const list = toAdd.map(({ r, dob }) => {
        const left = /left|inactive/i.test(r.status || '') || !!parseDate(r.leaveDate);
        const amount = parseFloat(String(r.weeklyFee || '').replace(/[^0-9.]/g, ''));
        return {
          forename: r.forename, surname: r.surname, sheetClass: (r.class || '').trim(), dob,
          waiting: /wait/i.test(r.status || '') || /wait/i.test(r.class || ''),
          parent1Name: r.parent1Name, parent1Phone: r.parent1Phone, parent2Name: r.parent2Name, parent2Phone: r.parent2Phone,
          weeklyFee: Number.isFinite(amount) ? amount : fee,
          enrollDate: parseDate(r.enrollDate) || today(),
          status: left ? 'Inactive' : 'Active', leaveDate: parseDate(r.leaveDate) || (left ? today() : ''),
          notes: r.notes,
          ...Object.fromEntries(DETAIL_FIELDS.map(([k]) => [k, r[k] || ''])),
        };
      });
      const res = list.length ? await importStudents(list) : { added: 0 };
      const up = toUpdate.length ? await updateStudentDetails(toUpdate.map(c => ({ id: c.update.id, ...c.changes }))) : { updated: 0 };
      onDone([
        res.added ? `${res.added} student${res.added === 1 ? '' : 's'} added — choose their classes in "Not in a class"` : '',
        up.updated ? `${up.updated} student${up.updated === 1 ? '' : 's'}' details updated` : '',
      ].filter(Boolean).join('; ') || 'Nothing to change');
    } catch (err) { setError(err.message || 'Could not add the students'); }
    setBusy(false);
  }

  const blankSheet = () => downloadBlob(xlsxBlob([SHEET_COLUMNS.slice(0, 9).map(c => c[1])], 'Students', SHEET_LEFT), 'students-template.xlsx');
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
            {book && (
              <div style={{ background: '#f3f4f6', borderRadius: 'var(--r-md)', padding: '10px 12px', fontSize: 13, marginBottom: 8 }}>
                <strong>Every sheet of the workbook</strong>{parsed.sheets?.length ? `: ${parsed.sheets.map(s => `${s.name} (${s.count})`).join(', ')}` : ' — no pupils found on any sheet.'}
                {parsed.sheets?.length < book.length && <div className="text-muted" style={{ fontSize: 12, marginTop: 2 }}>Sheets without a name heading row are left out.</div>}
                <button type="button" className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => { setBook(null); setText(''); }}>Clear</button>
              </div>
            )}
            {!book && <textarea value={text} onChange={e => { setText(e.target.value); setError(''); }} rows={8} placeholder={'Forename\tSurname\tClass\tDate of birth\tContact 1 name\tContact 1 phone\nAisha\tPatel\tQaa\'idah 1\t04/05/2017\tFatima Patel\t07700 900123'}
              style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: 12, padding: 10, border: '1px solid var(--border)', borderRadius: 'var(--r-md)', resize: 'vertical' }} />}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              <button className="btn btn-sm" onClick={() => fileRef.current?.click()}><Upload size={13} />Choose a file</button>
              <button className="btn btn-sm" onClick={blankSheet}><Download size={13} />Blank sheet to fill in</button>
              <input ref={fileRef} type="file" accept=".xlsx,.csv,text/csv,.tsv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={chooseFile} style={{ display: 'none' }} />
            </div>
            {!book && text && !parsed.rows.length && <div style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 8 }}>No rows found.</div>}
            {!book && text && parsed.rows.length > 0 && !parsed.headed && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>No heading row found — reading the columns as Forename, Surname, Class, Date of birth, Contact 1 name, Contact 1 phone…</div>}
          </>) : (<>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
              {toAdd.length} student{toAdd.length === 1 ? '' : 's'} to add{toUpdate.length ? ` · ${toUpdate.length} to update` : ''}
            </div>
            {skipped.length > 0 && <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 4 }}>
              {skipped.length} skipped: {skipped.slice(0, 4).map(c => `${[c.r.forename, c.r.surname].filter(Boolean).join(' ') || 'a row'} (${c.skip.toLowerCase()})`).join(', ')}{skipped.length > 4 ? '…' : ''}
            </div>}
            {toAdd.length > 0 && <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 6 }}>They'll be added without a class — then choose a class for them on Students, under "Not in a class".</div>}
            {toUpdate.length > 0 && <>
              <div className="form-section-title" style={{ margin: '14px 0 4px' }}>Already here — details to fill in</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 8 }}>Only what the sheet has is changed; empty cells leave their details as they are.</div>
              <div style={{ display: 'grid', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
                {toUpdate.map((c, i) => (
                  <div key={i} style={{ background: '#f3f4f6', borderRadius: 'var(--r-md)', padding: '6px 10px', fontSize: 12.5 }}>
                    <strong>{c.r.forename} {c.r.surname}</strong>
                    <span className="text-muted"> · {Object.keys(c.changes).map(k => FIELD_LABEL[k] || k).join(', ')}</span>
                  </div>
                ))}
              </div>
            </>}
            {toAdd.length > 0 && <div className="form-section-title" style={{ margin: '14px 0 8px' }}>Students</div>}
            <div style={{ display: 'grid', gap: 4, maxHeight: 260, overflowY: 'auto' }}>
              {toAdd.map((c, i) => (
                <div key={i} style={{ background: '#f3f4f6', borderRadius: 'var(--r-md)', padding: '6px 10px', fontSize: 12.5 }}>
                  <strong>{c.r.forename} {c.r.surname}</strong>
                  <span className="text-muted">{c.r.class ? ` · ${c.r.class}` : ''}{c.dob ? ` · born ${c.dob.split('-').reverse().join('/')}` : ''}{c.r.parent1Phone ? ` · ${c.r.parent1Phone}` : ''}</span>
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
            <button className="btn btn-primary" style={{ background: 'var(--blue)' }} disabled={(!toAdd.length && !toUpdate.length) || busy} onClick={add}>
              {busy ? 'Saving…' : [toAdd.length ? `Add ${toAdd.length}` : '', toUpdate.length ? `Update ${toUpdate.length}` : ''].filter(Boolean).join(' · ')}
            </button>
          </>)}
        </div>
      </div>
    </div>
  );
}
