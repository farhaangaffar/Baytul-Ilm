// A school's new school year (Pupils page, head): one pop-up saying where each class's pupils go — up into the next
// class (6A → 7A, made if it isn't there yet), into any class, staying together a year up (a class named after its
// teacher), into "Not in a class" to be placed one by one (classes mixed up for the new year), or leaving the school.
// Their Islamic Studies marks stay with each pupil. The last move can be undone (server/routes/studies.js ?action=new-year).
import React, { useState, useEffect } from 'react';
import { X, CalendarPlus, Undo2, Check } from 'lucide-react';
import { getSchoolYearMove, moveSchoolYear, undoSchoolYear, deleteClass, formatDateGB } from '../lib/store';
import { yearLabel } from '../lib/studies';
import { useBackToClose } from '../lib/useBackToClose';

// The class a year up, by name: "6A" → "7A", "Year 6 Boys" → "Year 7 Boys", "Reception" → "Year 1".
function nextName(name, yg) {
  if (/reception/i.test(name)) return name.replace(/reception/i, 'Year 1');
  if (yg === null || yg === undefined) return null;
  const re = new RegExp(`(^|\\D)${yg}(?!\\d)`);
  return re.test(name) ? name.replace(re, `$1${yg + 1}`) : null;
}

// Where a class goes unless the head picks otherwise.
function guess(c, classes) {
  if (c.yearGroup === null) return { pick: 'stay' };
  const higher = classes.some(k => k.yearGroup === c.yearGroup + 1);
  if ([6, 11, 13].includes(c.yearGroup) && !higher) return { pick: 'left' }; // the school's last year
  const nm = nextName(c.name, c.yearGroup);
  if (!nm) return { pick: 'up' };
  const there = classes.find(k => k.name.toLowerCase() === nm.toLowerCase());
  return there ? { pick: `c:${there.id}` } : { pick: 'new', name: nm };
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
            <span className="line-row-sub" style={{ display: 'block', whiteSpace: 'normal' }}>Move every class up at once — marks stay with each pupil</span>
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
  const [plan, setPlan] = useState({}); // class id → { pick, name }
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
  const set = (id, patch) => setPlan(p => ({ ...p, [id]: { ...p[id], ...patch } }));
  const count = k => withPupils.filter(c => plan[c.id]?.pick === k || (k === 'move' && /^c:|^new$/.test(plan[c.id]?.pick || ''))).reduce((t, c) => t + c.pupils, 0);

  async function run() {
    setBusy(true); setError('');
    try {
      const moves = withPupils.map(c => {
        const p = plan[c.id] || {};
        const to = p.pick?.startsWith('c:') ? { classId: p.pick.slice(2) } : p.pick === 'new' ? { name: p.name || '' }
          : p.pick === 'up' ? { up: true } : p.pick === 'sort' ? { sort: true } : p.pick === 'left' ? { left: true } : { stay: true };
        return { from: c.id, to };
      });
      setDone(await moveSchoolYear(moves));
      await onDone?.();
    } catch (e) { setError(e.message || 'Could not move them'); }
    setBusy(false);
  }
  // The classes nobody is in after the move (keep any you'll use again — e.g. next year's Reception).
  async function deleteEmpty() {
    if (!window.confirm(`Delete ${done.emptyClasses.map(e => e.name).join(', ')}? Keep any you'll use again (e.g. Reception for new pupils).`)) return;
    setBusy(true); setError('');
    let n = 0;
    try { for (const e of done.emptyClasses) { await deleteClass(e.id); n++; } }
    catch (e) { setError(e.message || 'Could not delete them all'); }
    setDone(d => ({ ...d, deleted: n })); await onDone?.();
    setBusy(false);
  }
  async function undo() {
    if (!window.confirm('Put everyone back where they were before the last move?')) return;
    setBusy(true); setError('');
    try { const r = await undoSchoolYear(); setDone({ undone: r }); await onDone?.(); }
    catch (e) { setError(e.message || 'Could not undo'); }
    setBusy(false);
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !busy && close()}>
      <div className="modal" style={{ maxWidth: 560 }}>
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
              <div style={{ color: 'var(--green-text)' }}><Check size={15} style={{ verticalAlign: -2 }} /> Done{done.moved ? ` — ${done.moved} pupils moved into their new classes` : ''}.</div>
              {done.toSort > 0 && <div>{done.toSort} pupils are under <b>Not in a class</b> at the top of this page — tick them and move them into their classes.</div>}
              {done.left > 0 && <div>{done.left} pupils are now under <b>Left</b>.</div>}
              {done.newClasses?.length > 0 && <div>New classes: {done.newClasses.join(', ')} — give them a teacher on Classes &amp; Teachers.</div>}
              {done.emptyClasses?.length > 0 && (done.deleted ? <div className="text-muted" style={{ fontSize: 13 }}>Deleted {done.deleted} empty classes.</div> : (
                <div style={{ display: 'grid', gap: 6 }}>
                  <div className="text-muted" style={{ fontSize: 13 }}>No one is in {done.emptyClasses.map(e => e.name).join(', ')} now.</div>
                  <button type="button" className="btn btn-sm" style={{ justifySelf: 'start' }} disabled={busy} onClick={deleteEmpty}>Delete the {done.emptyClasses.length} empty classes</button>
                </div>
              ))}
              <div className="text-muted" style={{ fontSize: 13 }}>Made a mistake? Open New school year again and tap Undo.</div>
            </div>
          )) : !data ? (error ? null : <div className="text-muted" style={{ fontSize: 13 }}>Loading…</div>) : <>
            <div className="text-muted" style={{ fontSize: 13 }}>Choose where each class goes. Every pupil keeps their marks. Classes mixed up for the new year? Choose "Place them one by one".</div>
            {data.lastMove && (
              <button type="button" className="line-row" onClick={undo} disabled={busy}>
                <Undo2 size={16} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="line-row-name" style={{ display: 'block' }}>Undo the last move</span>
                  <span className="line-row-sub" style={{ display: 'block' }}>{formatDateGB(data.lastMove.movedOn)} · {data.lastMove.count} pupils</span>
                </span>
              </button>
            )}
            {withPupils.map(c => {
              const p = plan[c.id] || {};
              return (
                <div key={c.id} className="ny-row">
                  <div className="ny-from"><b>{c.name}</b><span className="text-muted"> · {c.pupils} pupils · {yearLabel(c.yearGroup)}</span></div>
                  <select value={p.pick || 'stay'} onChange={e => set(c.id, { pick: e.target.value, name: p.name || nextName(c.name, c.yearGroup) || '' })}>
                    <option value="new">Into a new class{p.pick === 'new' && p.name ? `: ${p.name}` : ''}</option>
                    {data.classes.filter(k => k.id !== c.id).map(k => <option key={k.id} value={`c:${k.id}`}>Into {k.name}</option>)}
                    {c.yearGroup !== null && c.yearGroup < 13 && <option value="up">Stay together as {c.name}, now {yearLabel(c.yearGroup + 1)}</option>}
                    <option value="sort">Place them one by one</option>
                    <option value="left">They've left the school</option>
                    <option value="stay">Leave as it is</option>
                  </select>
                  {p.pick === 'new' && (
                    <input value={p.name || ''} maxLength={60} placeholder="New class name, e.g. 7A" onChange={e => set(c.id, { name: e.target.value })} />
                  )}
                </div>
              );
            })}
            {!withPupils.length && <div className="text-muted" style={{ fontSize: 13 }}>No pupils in classes yet.</div>}
            {withPupils.length > 0 && (
              <div className="text-muted" style={{ fontSize: 12.5 }}>
                {[count('move') && `${count('move')} move class`, count('up') && `${count('up')} stay together a year up`, count('sort') && `${count('sort')} to place one by one`, count('left') && `${count('left')} leave`].filter(Boolean).join(' · ') || 'Nothing will change yet.'}
              </div>
            )}
          </>}
          {error && <div style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={close} disabled={busy}>{done ? 'Close' : 'Cancel'}</button>
          {!done && data && withPupils.length > 0 && (
            <button className="btn btn-primary" onClick={run} disabled={busy || withPupils.every(c => (plan[c.id]?.pick || 'stay') === 'stay')}>{busy ? 'Moving…' : 'Move everyone'}</button>
          )}
        </div>
      </div>
    </div>
  );
}
