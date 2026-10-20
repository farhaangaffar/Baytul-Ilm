// A Darul Uloom's maintenance list (server/routes/maintenance.js): things to fix around the school. The head adds
// jobs (what, where, urgent or not, a note); the head and the staff ticked Maintenance on Classes & Staff see them
// and mark them done with a note. Figures on top, a line per job (urgent first, then oldest), done jobs behind one
// closed line; tap a job for its pop-up.
import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import { LoadingState, ErrorState } from '../components/DataState';
import BoxRow from '../components/BoxRow';
import PickField from '../components/PickField';
import { ChoiceBoxes, GrowingText } from '../components/StudentDetails';
import { getMaintenance, saveMaintenanceJob, markMaintenanceDone, reopenMaintenanceJob, deleteMaintenanceJob } from '../lib/store';
import { ChevronRight, ChevronDown, ChevronUp, Plus, X, Save, Trash2, Pencil, Check, RotateCcw } from 'lucide-react';

const dayOf = ts => new Date(ts);
const shortDate = ts => dayOf(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
// How long a job has been waiting: "Today", "Yesterday", "3 days", "2 weeks".
function waiting(ts) {
  const days = Math.floor((Date.now() - dayOf(ts).getTime()) / 86400000);
  if (days < 1) return 'Today';
  if (days < 2) return 'Yesterday';
  if (days < 14) return `${days} days`;
  return `${Math.floor(days / 7)} weeks`;
}

// Computer-wide screens (as the CSS's 900px): Done sits open beside the list.
function useWide() {
  const query = '(min-width: 900px)';
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

export default function Maintenance() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(null); // { kind: 'job', job } (head: add/edit) · { kind: 'view', id }
  const [showDone, setShowDone] = useState(false);
  const [toast, setToast] = useState('');
  const wide = useWide();

  const load = useCallback(async () => {
    setError(null);
    try { setData(await getMaintenance()); } catch (err) { setError(err); }
  }, []);
  useEffect(() => { load(); }, [load]);
  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 2800); }
  async function run(fn, msg) {
    try { await fn(); await load(); if (msg) showToast(msg); return true; }
    catch (err) { showToast(err.message || 'Something went wrong'); return false; }
  }

  const title = 'Maintenance';
  if (error) return <Layout title={title}><ErrorState error={error} onRetry={load} /></Layout>;
  if (!data) return <Layout title={title}><LoadingState /></Layout>;

  const { jobs, places, head } = data;
  const open = jobs.filter(j => !j.doneAt);
  const done = jobs.filter(j => j.doneAt).sort((a, b) => (a.doneAt < b.doneAt ? 1 : -1));
  const urgent = open.filter(j => j.urgent).length;
  const now = new Date();
  const doneThisMonth = done.filter(j => { const d = dayOf(j.doneAt); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); }).length;
  const viewing = modal?.kind === 'view' && jobs.find(j => j.id === modal.id);
  const doneLine = j => (
    <button key={j.id} type="button" className="line-row" onClick={() => setModal({ kind: 'view', id: j.id })}>
      <span className="ct-two">
        <span className="line-row-name">{j.what}</span>
        <span className="line-row-sub">{[j.place, `Done ${shortDate(j.doneAt)}${j.doneBy ? ` · ${j.doneBy}` : ''}`].filter(Boolean).join(' · ')}</span>
      </span>
      <Check size={15} style={{ color: 'var(--green)' }} />
    </button>
  );

  return (
    <Layout title={title} subtitle={open.length ? `${open.length} to do` : 'Nothing to fix'}>
      <div className="boarding-page">
        <BoxRow columns="repeat(3, minmax(0, 1fr))" cells={[
          { text: open.length, sub: 'To do', className: 'ct-figure' },
          urgent ? { text: urgent, sub: 'Urgent', tone: 'red' } : { text: 0, sub: 'Urgent', className: 'ct-figure' },
          { text: doneThisMonth, sub: 'Done this month', className: 'ct-figure', onClick: done.length ? () => setShowDone(true) : undefined },
        ]} />

        <div className="bd-two mt-cols">
        <div className="card">
          <div className="card-title" style={{ marginBottom: 10 }}>To do</div>
          <div className="course-lines">
            {open.map(j => (
              <button key={j.id} type="button" className="line-row" onClick={() => setModal({ kind: 'view', id: j.id })}>
                <span className="ct-two">
                  <span className="line-row-name">{j.what}</span>
                  <span className="line-row-sub">{j.urgent && <b className="mt-urgent">Urgent · </b>}{[j.place, waiting(j.addedAt)].filter(Boolean).join(' · ')}</span>
                </span>
                <ChevronRight size={16} />
              </button>
            ))}
            {!open.length && <div className="text-muted" style={{ fontSize: 13, padding: '4px 2px' }}>Nothing to fix right now.</div>}
            {head && <button type="button" className="line-row add" onClick={() => setModal({ kind: 'job', job: { what: '', place: '', urgent: false, note: '' } })}><Plus size={14} /> Add a job</button>}
          </div>
        </div>

        {/* Done: one closed line on phones; on computers, open beside the list. */}
        {done.length > 0 && wide && (
          <div className="card">
            <div className="card-title" style={{ marginBottom: 2 }}>Done</div>
            <div className="card-sub" style={{ marginBottom: 10 }}>{done.length} job{done.length === 1 ? '' : 's'} in the last year</div>
            <div className="course-lines">{done.map(doneLine)}</div>
          </div>
        )}
        {done.length > 0 && !wide && (
          <div className="card">
            <div className="course-lines">
              <button type="button" className={`line-row ${showDone ? 'on' : ''}`} onClick={() => setShowDone(s => !s)}>
                <span className="ct-two">
                  <span className="line-row-name">Done</span>
                  <span className="line-row-sub">{done.length} job{done.length === 1 ? '' : 's'} in the last year</span>
                </span>
                {showDone ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {showDone && <div className="course-open">{done.map(doneLine)}</div>}
            </div>
          </div>
        )}
        </div>
      </div>

      {viewing && (
        <JobSheet job={viewing} head={head} onClose={() => setModal(null)}
          onEdit={() => setModal({ kind: 'job', job: viewing })}
          onDone={async note => { if (await run(() => markMaintenanceDone(viewing.id, note), 'Marked done')) setModal(null); }}
          onReopen={async () => { if (await run(() => reopenMaintenanceJob(viewing.id), 'Back on the list')) setModal(null); }} />
      )}
      {modal?.kind === 'job' && (
        <JobModal job={modal.job} places={places} onClose={() => setModal(null)}
          onSave={async f => { if (await run(() => saveMaintenanceJob(f), f.id ? 'Saved' : 'Job added')) setModal(null); }}
          onDelete={async () => { if (await run(() => deleteMaintenanceJob(modal.job.id), 'Job deleted')) setModal(null); }} />
      )}
      {toast && <div className="toast">✓ {toast}</div>}
    </Layout>
  );
}

function Shell({ title, onClose, children, footer, width = 460 }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: width }}>
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button className="btn btn-icon" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-footer">{footer}</div>
      </div>
    </div>
  );
}

function useBusy() {
  const [busy, setBusy] = useState(false);
  const wrap = fn => async (...a) => { setBusy(true); try { await fn(...a); } finally { setBusy(false); } };
  return [busy, wrap];
}

// A job: where, when it was added, how urgent, the note — then "Mark done" (with what was done), or, once done,
// who did it and when. The head can edit it, or put a done job back on the list.
function JobSheet({ job, head, onClose, onEdit, onDone, onReopen }) {
  const [finishing, setFinishing] = useState(false);
  const [note, setNote] = useState('');
  const [busy, wrap] = useBusy();
  const isDone = !!job.doneAt;
  return (
    <Shell title={job.what} onClose={onClose}
      footer={<>
        {head && <button className="btn" style={{ marginRight: 'auto' }} onClick={onEdit}><Pencil size={13} />Edit</button>}
        {isDone
          ? (head ? <button className="btn" disabled={busy} onClick={wrap(onReopen)}><RotateCcw size={13} />Put back on the list</button>
            : <button className="btn btn-primary" onClick={onClose}>Done</button>)
          : finishing
            ? <button className="btn btn-primary" disabled={busy} onClick={wrap(() => onDone(note.trim()))}><Check size={13} />Save — it's done</button>
            : <button className="btn btn-primary" onClick={() => setFinishing(true)}><Check size={13} />Mark done</button>}
      </>}>
      <BoxRow columns="repeat(3, minmax(0, 1fr))" cells={[
        { text: job.place || '—', sub: 'Where', className: 'ct-figure', wrap: 'words' },
        { text: shortDate(job.addedAt), sub: job.addedBy ? `Added by ${job.addedBy}` : 'Added', className: 'ct-figure' },
        job.urgent ? { text: 'Urgent', sub: isDone ? 'Was' : waiting(job.addedAt), tone: 'red' } : { text: 'Normal', sub: isDone ? '' : waiting(job.addedAt), className: 'ct-figure' },
      ]} />
      {job.note && <div className="mt-note">{job.note}</div>}
      {isDone && (
        <>
          <BoxRow columns="repeat(2, minmax(0, 1fr))" cells={[
            { text: shortDate(job.doneAt), sub: 'Done', tone: 'green' },
            { text: job.doneBy || '—', sub: 'By', className: 'ct-figure' },
          ]} />
          {job.doneNote && <div className="mt-note">{job.doneNote}</div>}
        </>
      )}
      {!isDone && finishing && (
        <div className="form-group" style={{ marginTop: 10 }}>
          <label>What was done? (optional)</label>
          <GrowingText value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. New bulb fitted" maxLength={1000} autoFocus />
        </div>
      )}
    </Shell>
  );
}

// Add or change a job (head): what, where (past places suggested), urgent or not, a note.
function JobModal({ job, places, onClose, onSave, onDelete }) {
  const [f, setF] = useState({ id: job.id, what: job.what || '', place: job.place || '', urgent: !!job.urgent, note: job.note || '' });
  const [sure, setSure] = useState(false);
  const [busy, wrap] = useBusy();
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  return (
    <Shell title={f.id ? 'Edit job' : 'Add a job'} onClose={onClose}
      footer={<>
        {f.id && (sure
          ? <button className="btn" style={{ marginRight: 'auto', background: 'var(--red)', color: '#fff' }} disabled={busy} onClick={wrap(onDelete)}>Delete it</button>
          : <button className="btn" style={{ marginRight: 'auto', color: 'var(--red-text)' }} onClick={() => setSure(true)}><Trash2 size={13} />Delete</button>)}
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={busy || !f.what.trim()} onClick={wrap(() => onSave(f))}><Save size={13} />{f.id ? 'Save' : 'Add'}</button>
      </>}>
      <div className="form-grid">
        <div className="form-group"><label>What needs fixing?</label>
          <input value={f.what} onChange={e => set('what', e.target.value)} maxLength={200} placeholder="e.g. Light not working" autoFocus={!f.id} /></div>
        <div className="form-group"><label>Where?</label>
          <PickField value={f.place} onChange={v => set('place', v)} options={places} placeholder="e.g. 1st year classroom, Block A room 101" /></div>
        <div className="form-group"><label>How urgent?</label>
          <ChoiceBoxes options={['Normal', 'Urgent']} value={f.urgent ? 'Urgent' : 'Normal'} onChange={v => set('urgent', v === 'Urgent')} /></div>
        <div className="form-group"><label>Note (optional)</label>
          <GrowingText value={f.note} onChange={e => set('note', e.target.value)} placeholder="Anything that helps — e.g. the second tap from the left" maxLength={1000} /></div>
      </div>
    </Shell>
  );
}
