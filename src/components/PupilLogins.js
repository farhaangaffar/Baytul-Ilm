import React, { useState } from 'react';
import BoxRow from './BoxRow';
import { useBackToClose } from '../lib/useBackToClose';
import { savePupilLogin, importPupilLogins, setPupilLoginActive, removePupilLogin, formatDateGB } from '../lib/store';
import { xlsxToText } from '../lib/xlsx';
import { X, Save, KeyRound, Upload, Trash2, Power } from 'lucide-react';

// A school's pupil logins (server/routes/pupil-logins.js — the head only). The school gives each pupil their own
// username and password; the head types them in on the pupil's card (PupilLoginCard) or imports a class from a
// spreadsheet (PupilLoginsLine → ImportModal). Passwords are stored safely and can't be shown again.

const lastSeen = l => (l.lastLoginAt ? `Last signed in ${formatDateGB(String(l.lastLoginAt).slice(0, 10))}` : 'Not signed in yet');

// On a pupil's card: their login, or a form to add one.
export function PupilLoginCard({ student, login, demo, onChanged }) {
  const [editing, setEditing] = useState(!login);
  const [f, setF] = useState({ login: login?.login || '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  async function run(fn) {
    setBusy(true); setError('');
    try { await fn(); await onChanged(); setEditing(false); setConfirmRemove(false); } catch (e) { setError(e.message || 'Could not save'); }
    setBusy(false);
  }
  if (demo) {
    return <div className="text-muted" style={{ fontSize: 13 }}>{login ? `Username: ${login.login} · ${lastSeen(login)}` : 'No login yet.'} Logins can't be changed in the demo.</div>;
  }
  if (editing) {
    return (
      <div style={{ display: 'grid', gap: 8 }}>
        <div className="form-group" style={{ margin: 0 }}><label htmlFor={`pl-u-${student.id}`}>Username (from your school)</label>
          <input id={`pl-u-${student.id}`} value={f.login} autoCapitalize="off" autoCorrect="off" spellCheck={false} onChange={e => setF(x => ({ ...x, login: e.target.value }))}
            placeholder={`e.g. ${student.forename.toLowerCase()}.${(student.surname || 'x')[0].toLowerCase()}`} /></div>
        <div className="form-group" style={{ margin: 0 }}><label htmlFor={`pl-p-${student.id}`}>{login ? 'New password (leave blank to keep it)' : 'Password (from your school)'}</label>
          <input id={`pl-p-${student.id}`} value={f.password} autoCapitalize="off" autoCorrect="off" spellCheck={false} onChange={e => setF(x => ({ ...x, password: e.target.value }))} /></div>
        {error && <div style={{ color: 'var(--red-text)', fontSize: 13 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {login && <button className="btn" disabled={busy} onClick={() => { setEditing(false); setError(''); }}>Cancel</button>}
          <button className="btn btn-primary" disabled={busy || !f.login.trim() || (!login && !f.password)}
            onClick={() => run(() => savePupilLogin(student.id, f.login, f.password || undefined))}><Save size={13} />{login ? 'Save' : 'Add login'}</button>
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <BoxRow columns="minmax(0, 1fr) minmax(0, 1fr)" cells={[
        { text: login.login, sub: 'Username', label: true, wrap: true },
        login.active ? { text: login.resting ? 'Resting' : 'On', sub: login.resting ? 'Too many wrong tries' : lastSeen(login), tone: login.resting ? 'amber' : 'green', wrap: 'words' }
          : { text: 'Off', sub: "Can't sign in", tone: 'red' },
      ]} />
      {error && <div style={{ color: 'var(--red-text)', fontSize: 13 }}>{error}</div>}
      <button type="button" className="line-row add" onClick={() => { setF({ login: login.login, password: '' }); setEditing(true); }}><KeyRound size={13} /> Change username or password</button>
      <button type="button" className="line-row add" disabled={busy} onClick={() => run(() => setPupilLoginActive(student.id, !login.active))}>
        <Power size={13} /> {login.active ? 'Switch off' : 'Switch back on'}
      </button>
      {!confirmRemove
        ? <button type="button" className="line-row add ct-delete" onClick={() => setConfirmRemove(true)}><Trash2 size={13} /> Remove login</button>
        : <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', fontSize: 13 }}>
            Remove {student.forename}'s login?
            <button className="btn" onClick={() => setConfirmRemove(false)}>Cancel</button>
            <button className="btn btn-danger" disabled={busy} onClick={() => run(() => removePupilLogin(student.id))}>Remove</button>
          </div>}
    </div>
  );
}

// A spreadsheet's rows → { rows: [{ studentId, name, login, password }], missed: [{ name, reason }] }. Headings are found
// by name: First name + Surname (or one Name column), Username, Password, and an optional Class to tell apart two
// pupils with the same name.
const plain = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
function readSheet(text, students) {
  const lines = String(text || '').split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { error: 'Paste the headings row and at least one pupil.' };
  const sep = lines[0].includes('\t') ? '\t' : ',';
  const cells = l => l.split(sep).map(c => c.trim().replace(/^"|"$/g, ''));
  const head = cells(lines[0]).map(h => h.toLowerCase());
  const col = re => head.findIndex(h => re.test(h));
  const first = col(/first|forename|given/), sur = col(/surname|last|family/), name = col(/^(full )?name$|^pupil|^student|^child/);
  const user = col(/user|login|e-?mail/), pass = col(/pass/), cls = col(/class|form/);
  if (user < 0 || pass < 0 || (name < 0 && (first < 0 || sur < 0))) {
    return { error: 'The first row needs headings: First name and Surname (or Name), Username and Password.' };
  }
  const active = students.filter(s => s.status === 'Active');
  const rows = [], missed = [];
  lines.slice(1).forEach(l => {
    const c = cells(l);
    const full = name >= 0 ? c[name] : `${c[first] || ''} ${c[sur] || ''}`.trim();
    if (!full) return;
    const login = c[user] || '', password = c[pass] || '';
    if (!login || !password) { missed.push({ name: full, reason: 'No username or password' }); return; }
    let hits = active.filter(s => plain(`${s.forename}${s.surname}`) === plain(full));
    if (hits.length > 1 && cls >= 0 && c[cls]) hits = hits.filter(s => plain(s.class) === plain(c[cls]));
    if (hits.length !== 1) { missed.push({ name: full, reason: hits.length ? 'Two pupils with this name — add a Class column' : 'No pupil with this name' }); return; }
    rows.push({ studentId: hits[0].id, name: `${hits[0].forename} ${hits[0].surname}`, className: hits[0].class, login, password });
  });
  return { rows, missed };
}

function ImportModal({ students, logins, onClose, onDone }) {
  const close = useBackToClose(true, onClose);
  const [text, setText] = useState('');
  const [read, setRead] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  async function fromFile(file) {
    if (!file) return;
    setError('');
    try { setText(/\.xlsx$/i.test(file.name) ? await xlsxToText(file) : await file.text()); setRead(null); }
    catch { setError("Couldn't read that file — save it as .xlsx or .csv, or copy the rows and paste them below."); }
  }
  async function save() {
    setBusy(true); setError('');
    try { setResult(await importPupilLogins(read.rows.map(({ studentId, login, password }) => ({ studentId, login, password })))); await onDone(); }
    catch (e) { setError(e.message || 'Could not import'); }
    setBusy(false);
  }
  const have = new Set(logins.map(l => l.studentId));
  const nameOf = id => { const s = students.find(x => x.id === id); return s ? `${s.forename} ${s.surname}` : 'A pupil'; };
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && close()}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <div className="modal-title">Pupil logins</div>
          <button className="btn btn-icon" onClick={close}><X size={16} /></button>
        </div>
        <div className="modal-body" style={{ display: 'grid', gap: 12 }}>
          {result ? (
            <>
              <BoxRow columns="repeat(3, minmax(0, 1fr))" cells={[
                { text: result.added, sub: 'Added', tone: result.added ? 'green' : undefined },
                { text: result.changed, sub: 'Changed', tone: result.changed ? 'blue' : undefined },
                { text: result.skipped.length, sub: 'Skipped', tone: result.skipped.length ? 'amber' : undefined },
              ]} />
              {result.skipped.map((s, i) => <div key={i} style={{ fontSize: 13 }}><b>{nameOf(s.studentId)}</b> ({s.login}): {s.reason}</div>)}
            </>
          ) : (
            <>
              <div className="text-muted" style={{ fontSize: 13 }}>
                Each pupil's username and password from your school. Use a spreadsheet with the headings <b>First name</b>, <b>Surname</b>, <b>Username</b> and <b>Password</b> (a <b>Class</b> column helps when two pupils share a name). Upload it, or copy the rows and paste them below. A pupil who already has a login gets the new username and password.
              </div>
              <label className="line-row add" style={{ cursor: 'pointer' }}>
                <Upload size={13} /> Upload a spreadsheet (.xlsx or .csv)
                <input type="file" accept=".xlsx,.csv,text/csv" style={{ display: 'none' }} onChange={e => fromFile(e.target.files[0])} />
              </label>
              <textarea id="pupil-logins-paste" rows={6} value={text} onChange={e => { setText(e.target.value); setRead(null); }}
                placeholder={'First name\tSurname\tClass\tUsername\tPassword\nAisha\tKhan\t6A\taisha.k\tgreen-tiger-42'} style={{ fontFamily: 'monospace', fontSize: 12.5 }} />
              {read?.error && <div style={{ color: 'var(--red-text)', fontSize: 13 }}>{read.error}</div>}
              {read && !read.error && (
                <div style={{ display: 'grid', gap: 6 }}>
                  <BoxRow columns="repeat(3, minmax(0, 1fr))" cells={[
                    { text: read.rows.filter(r => !have.has(r.studentId)).length, sub: 'New logins', tone: 'green' },
                    { text: read.rows.filter(r => have.has(r.studentId)).length, sub: 'Will change' },
                    { text: read.missed.length, sub: 'Not matched', tone: read.missed.length ? 'amber' : undefined },
                  ]} />
                  {read.missed.map((m, i) => <div key={i} style={{ fontSize: 13 }}><b>{m.name}</b>: {m.reason}</div>)}
                  {read.rows.slice(0, 40).map(r => (
                    <div key={r.studentId} style={{ fontSize: 13, display: 'flex', justifyContent: 'space-between', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 4 }}>
                      <span>{r.name} <span className="text-muted">· {r.className}</span></span><span style={{ overflowWrap: 'anywhere' }}>{r.login}</span>
                    </div>
                  ))}
                  {read.rows.length > 40 && <div className="text-muted" style={{ fontSize: 12.5 }}>… and {read.rows.length - 40} more</div>}
                </div>
              )}
            </>
          )}
          {error && <div style={{ color: 'var(--red-text)', fontSize: 13 }}>{error}</div>}
        </div>
        <div className="modal-footer">
          {result ? <button className="btn btn-primary" onClick={close}>Done</button> : <>
            <button className="btn" onClick={close}>Cancel</button>
            {read && !read.error && read.rows.length > 0
              ? <button className="btn btn-primary" disabled={busy} onClick={save}><Save size={13} />{busy ? 'Saving…' : `Save ${read.rows.length} login${read.rows.length === 1 ? '' : 's'}`}</button>
              : <button className="btn btn-primary" disabled={!text.trim()} onClick={() => setRead(readSheet(text, students))}>Check the list</button>}
          </>}
        </div>
      </div>
    </div>
  );
}

// At the bottom of a school's Pupils page (head): how many pupils have a login, and the import.
export function PupilLoginsLine({ students, logins, demo, onChanged }) {
  const [open, setOpen] = useState(false);
  const active = students.filter(s => s.status === 'Active');
  const have = active.filter(s => logins.some(l => l.studentId === s.id)).length;
  return (
    <div className="card" style={{ marginTop: 12 }}>
      <button type="button" className="line-row" onClick={() => setOpen(true)} disabled={demo}>
        <KeyRound size={15} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="line-row-name" style={{ display: 'block' }}>Pupil logins</span>
          <span className="line-row-sub" style={{ display: 'block', whiteSpace: 'normal' }}>{have} of {active.length} pupils have one{demo ? ' · can\'t be changed in the demo' : ' · import a class from a spreadsheet'}</span>
        </span>
      </button>
      {open && <ImportModal students={students} logins={logins} onClose={() => setOpen(false)} onDone={onChanged} />}
    </div>
  );
}
