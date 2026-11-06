// A school's new school year (Pupils page, head), kept simple (the owner's ask): the school makes next year's classes
// first on Classes & Teachers, then one pop-up says, for each class, which class its pupils go into — or that they've
// left the school. Anyone going somewhere else (kept down, a different form) is moved on their own card afterwards.
// Their Islamic Studies marks stay with each pupil. The last move can be undone (server/routes/studies.js ?action=new-year).
import React, { useState, useEffect } from 'react';
import { X, CalendarPlus, Undo2, Check } from 'lucide-react';
import { getSchoolYearMove, moveSchoolYear, undoSchoolYear, formatDateGB } from '../lib/store';
import { useBackToClose } from '../lib/useBackToClose';

// The class a year up, by name: "6A" → "7A", "Year 6 Boys" → "Year 7 Boys", "Reception" → "Year 1".
function nextName(name, yg) {
  if (/reception/i.test(name)) return name.replace(/reception/i, 'Year 1');
  if (yg === null || yg === undefined) return null;
  const re = new RegExp(`(^|\\D)${yg}(?!\\d)`);
  return re.test(name) ? name.replace(re, `$1${yg + 1}`) : null;
}

// Where a class goes unless the head picks otherwise: the class a year up by name if it's there; the school's last
// year (no class above it) has left; otherwise nothing yet ('' = not moving).
function guess(c, classes) {
  const nm = nextName(c.name, c.yearGroup);
  const there = nm && classes.find(k => k.name.toLowerCase() === nm.toLowerCase());
  if (there) return `c:${there.id}`;
  if (c.yearGroup !== null && !classes.some(k => k.yearGroup > c.yearGroup)) return 'left';
  return '';
}

export default function SchoolYearLine({ onDone }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="card" style={{ marginTop: 20 }}>
        <button type="button" className="line-row" onClick={() => setOpen(true)}>
          <CalendarPlus size={16} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="line-row-name" style={{ display: 'block' }}>New school year</span>
            <span className="line-row-sub" style={{ display: 'block', whiteSpace: 'normal' }}>Move each class into next year's class — marks stay with each pupil</span>
          </span>
        </button>
      </div>
      {open && <NewYearModal onClose={() => setOpen(false)} onDone={onDone} />}
    </>
  );
}

function NewYearModal({ onClose, onDone }) {
  const close = useBackToClose(true, onClose);
  const [data, setData] = useState(null);
  const [plan, setPlan] = useState({}); // class id → 'c:<class id>' | 'left' | '' (not moving)
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);

  useEffect(() => {
    getSchoolYearMove().then(d => {
      setData(d);
      setPlan(Object.fromEntries(d.classes.map(c => [c.id, guess(c, d.classes)])));
    }).catch(e => setError(e.message || 'Could not load'));
  }, []);

  const withPupils = (data?.classes || []).filter(c => c.pupils > 0);
  const chosen = withPupils.filter(c => plan[c.id]);
  const moving = chosen.filter(c => plan[c.id] !== 'left').reduce((t, c) => t + c.pupils, 0);
  const leaving = chosen.filter(c => plan[c.id] === 'left').reduce((t, c) => t + c.pupils, 0);

  async function run() {
    setBusy(true); setError('');
    try {
      const moves = chosen.map(c => ({ from: c.id, to: plan[c.id] === 'left' ? { left: true } : { classId: plan[c.id].slice(2) } }));
      setDone(await moveSchoolYear(moves));
      await onDone?.();
    } catch (e) { setError(e.message || 'Could not move them'); }
    setBusy(false);
  }
  async function undo() {
    if (!window.confirm('Put everyone back in the classes they were in before the last move?')) return;
    setBusy(true); setError('');
    try { const r = await undoSchoolYear(); setDone({ undone: r }); await onDone?.(); }
    catch (e) { setError(e.message || 'Could not undo'); }
    setBusy(false);
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !busy && close()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <div className="modal-title">New school year</div>
          <button className="btn btn-icon" onClick={close} disabled={busy}><X size={16} /></button>
        </div>
        <div className="modal-body" style={{ display: 'grid', gap: 10 }}>
          {done ? (done.undone ? (
            <div style={{ fontSize: 14, color: 'var(--green-text)' }}><Check size={15} style={{ verticalAlign: -2 }} /> Put back {done.undone.restored} pupils.
              {done.undone.skipped ? ` ${done.undone.skipped} had been changed since, so they were left as they are.` : ''}</div>
          ) : (
            <div style={{ display: 'grid', gap: 8, fontSize: 14 }}>
              <div style={{ color: 'var(--green-text)' }}><Check size={15} style={{ verticalAlign: -2 }} /> Done
                {done.moved ? ` — ${done.moved} pupils are in their new classes` : ''}{done.left ? `${done.moved ? ', and' : ' —'} ${done.left} are under Left` : ''}.</div>
              <div className="text-muted" style={{ fontSize: 13 }}>Anyone going somewhere different (kept down a year, a different form)? Open them and choose "Move to another class".</div>
              <div className="text-muted" style={{ fontSize: 13 }}>Made a mistake? Open New school year again and tap Undo.</div>
            </div>
          )) : !data ? (error ? null : <div className="text-muted" style={{ fontSize: 13 }}>Loading…</div>) : <>
            <div className="text-muted" style={{ fontSize: 13 }}>
              First add next year's classes on Classes &amp; Teachers. Then choose where each class goes — every pupil keeps their marks.
            </div>
            {data.lastMove && (
              <button type="button" className="line-row" onClick={undo} disabled={busy}>
                <Undo2 size={16} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="line-row-name" style={{ display: 'block' }}>Undo the last move</span>
                  <span className="line-row-sub" style={{ display: 'block' }}>{formatDateGB(data.lastMove.movedOn)} · {data.lastMove.count} pupils</span>
                </span>
              </button>
            )}
            {withPupils.map(c => (
              <div key={c.id} className="ny-row">
                <div className="ny-from"><b>{c.name}</b><span className="text-muted"> · {c.pupils} pupils</span></div>
                <select value={plan[c.id] || ''} onChange={e => setPlan(p => ({ ...p, [c.id]: e.target.value }))}>
                  <option value="">Not moving</option>
                  {data.classes.filter(k => k.id !== c.id).map(k => <option key={k.id} value={`c:${k.id}`}>Into {k.name}</option>)}
                  <option value="left">Left the school</option>
                </select>
              </div>
            ))}
            {!withPupils.length && <div className="text-muted" style={{ fontSize: 13 }}>No pupils in classes yet.</div>}
            {withPupils.length > 0 && (
              <div className="text-muted" style={{ fontSize: 12.5 }}>
                {[moving && `${moving} pupils move class`, leaving && `${leaving} leave`].filter(Boolean).join(' · ') || 'Nothing chosen yet.'}
              </div>
            )}
          </>}
          {error && <div style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={close} disabled={busy}>{done ? 'Close' : 'Cancel'}</button>
          {!done && data && withPupils.length > 0 && (
            <button className="btn btn-primary" onClick={run} disabled={busy || !chosen.length}>{busy ? 'Moving…' : 'Move everyone'}</button>
          )}
        </div>
      </div>
    </div>
  );
}
