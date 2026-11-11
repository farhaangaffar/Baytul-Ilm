import React, { useState, useEffect, useCallback } from 'react';
import BoxRow from './BoxRow';
import { useBackToClose } from '../lib/useBackToClose';
import { getSchoolHomework, saveSchoolHomework, deleteSchoolHomework } from '../lib/store';
import { ChoiceBoxes } from './StudentDetails';
import { X, Save, Trash2, Pencil, Plus, ChevronRight } from 'lucide-react';

// A school's homework (Islamic Studies, stage 4 — server/routes/school-homework.js). Text only: what to do, a due date,
// for the whole class or chosen pupils, usually on a surah, du'aa or practical (its links go with it to the pupils).
// Teachers set it for their own classes (Set homework inside an item, or the Homework tab); they change their own, the
// head any. Pupils tick it done; parents see it without the links.

const DAY = 864e5;
const isoIn = n => new Date(Date.now() + n * DAY).toISOString().slice(0, 10);
export function niceDue(d) {
  if (!d) return '';
  const date = new Date(`${d}T12:00:00`);
  const days = Math.round((date - new Date(new Date().toDateString())) / DAY);
  const day = date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  return days === 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : days < 0 ? `Was due ${day}` : `Due ${day}`;
}

// Setting (or changing) a piece of homework.
const KINDS = [['surah', 'Surah'], ['duaa', "Du'aa"], ['practical', 'Practical'], ['', 'Something else']];

export function HomeworkModal({ className, items, pupils, item, homework, yearGroup, onClose, onSaved }) {
  const close = useBackToClose(true, onClose);
  const startItem = items.find(i => i.id === (homework ? homework.itemId : item?.id));
  const [kind, setKind] = useState(startItem ? startItem.kind : 'surah');
  const [f, setF] = useState({
    itemId: homework ? homework.itemId || '' : item?.id || '',
    text: homework?.text || '',
    due: homework ? homework.due || '' : isoIn(7),
    who: homework && !homework.allPupils ? 'Chosen pupils' : 'Whole class',
    ids: homework && !homework.allPupils ? homework.studentIds : [],
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toggle = id => setF(x => ({ ...x, ids: x.ids.includes(id) ? x.ids.filter(i => i !== id) : [...x.ids, id] }));
  const picked = items.find(i => i.id === f.itemId);
  async function save() {
    setBusy(true); setError('');
    try {
      await saveSchoolHomework({ id: homework?.id, className, itemId: (item || kind) ? f.itemId || null : null, text: f.text, due: f.due || null,
        studentIds: f.who === 'Chosen pupils' ? f.ids : [] });
      await onSaved();
    } catch (e) { setError(e.message || 'Could not save'); setBusy(false); }
  }
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && close()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <div className="modal-title">{homework ? 'Change homework' : `Homework for ${className}`}</div>
          <button className="btn btn-icon" onClick={close}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            {!item && <>
              {/* One kind at a time — surahs, du'aas or practicals — this year's first, then earlier years (the owner's ask). */}
              <div className="form-group"><label>Type of homework</label>
                <ChoiceBoxes columns={2} options={KINDS.map(k => k[1])} value={(KINDS.find(k => k[0] === kind) || KINDS[3])[1]}
                  onChange={v => { const k = KINDS.find(x => x[1] === v); if (!k) return; setKind(k[0]); setF(x => ({ ...x, itemId: '' })); }} /></div>
              {kind && (() => {
                const mine = items.filter(i => i.kind === kind);
                const now = mine.filter(i => yearGroup === null || yearGroup === undefined || i.yearGroup === yearGroup);
                const earlier = mine.filter(i => !now.includes(i));
                const word = (KINDS.find(k => k[0] === kind) || KINDS[0])[1].toLowerCase();
                return (
                  <div className="form-group"><label htmlFor="hw-item">Which {word}</label>
                    <select id="hw-item" value={f.itemId} onChange={e => setF(x => ({ ...x, itemId: e.target.value }))}
                      style={f.itemId ? undefined : { color: 'var(--text-muted)' }}>
                      <option value="">Choose a {word}…</option>
                      {now.length > 0 && <optgroup label="This year">{now.map(i => <option key={i.id} value={i.id} style={{ color: 'var(--ink)' }}>{i.name}</option>)}</optgroup>}
                      {earlier.length > 0 && <optgroup label="Earlier years">{earlier.map(i => <option key={i.id} value={i.id} style={{ color: 'var(--ink)' }}>{i.name}</option>)}</optgroup>}
                    </select></div>
                );
              })()}
            </>}
            {item && <div className="text-muted" style={{ fontSize: 13 }}>On <b style={{ color: 'var(--ink)' }}>{item.name}</b> — its links go with it.</div>}
            <div className="form-group"><label htmlFor="hw-text">What to do</label>
              <textarea id="hw-text" rows={4} maxLength={2000} autoFocus value={f.text} onChange={e => setF(x => ({ ...x, text: e.target.value }))}
                placeholder={picked ? (picked.kind === 'surah' ? `e.g. Learn aayahs 1–4 of ${picked.name} by heart` : `e.g. Learn ${picked.name} by heart and say it at home`)
                  : { surah: 'e.g. Learn aayahs 1–4 by heart', duaa: "e.g. Learn the du'aa by heart and say it at home", practical: 'e.g. Practise it at home with your family' }[kind] || 'e.g. Ask someone at home about the story of the Prophet ﷺ'} /></div>
            <div className="form-group"><label htmlFor="hw-due">Due</label>
              <input id="hw-due" type="date" value={f.due} onChange={e => setF(x => ({ ...x, due: e.target.value }))} /></div>
            <div className="form-group"><label>For</label>
              <ChoiceBoxes options={['Whole class', 'Chosen pupils']} value={f.who} onChange={v => setF(x => ({ ...x, who: v }))} /></div>
            {f.who === 'Chosen pupils' && (
              <div className="hw-pick">
                {pupils.map(p => (
                  <label key={p.id} className={`hw-pick-row ${f.ids.includes(p.id) ? 'on' : ''}`}>
                    <input type="checkbox" checked={f.ids.includes(p.id)} onChange={() => toggle(p.id)} /> {p.name}
                  </label>
                ))}
              </div>
            )}
          </div>
          {error && <div style={{ color: 'var(--red-text)', fontSize: 13, marginTop: 10 }}>{error}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={close}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !f.text.trim() || (f.who === 'Chosen pupils' && !f.ids.length) || (!item && kind && !f.itemId)} onClick={save}>
            <Save size={13} />{homework ? 'Save' : 'Set homework'}</button>
        </div>
      </div>
    </div>
  );
}

// One piece of homework: what to do, the item's links, and who has ticked it done.
function HomeworkSheet({ homework: h, pupils, links, onEdit, onRemoved, onClose }) {
  const close = useBackToClose(true, onClose);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const forThem = h.allPupils ? pupils : pupils.filter(p => h.studentIds.includes(p.id));
  const done = forThem.filter(p => h.done.includes(p.id)), notYet = forThem.filter(p => !h.done.includes(p.id));
  async function remove() { setBusy(true); try { await deleteSchoolHomework(h.id); await onRemoved(); } catch { setBusy(false); } }
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && close()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <div><div className="modal-title">{h.itemName || 'Homework'}</div><div className="text-muted text-sm">{niceDue(h.due) || 'No due date'} · set by {h.setBy}</div></div>
          <button className="btn btn-icon" onClick={close}><X size={16} /></button>
        </div>
        <div className="modal-body" style={{ display: 'grid', gap: 12 }}>
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{h.text}</div>
          {links.length > 0 && <div className="text-muted" style={{ fontSize: 12.5 }}>Pupils also get {links.length === 1 ? 'its link' : `its ${links.length} links`}: {links.map(l => l.name).join(', ')}</div>}
          <BoxRow columns="repeat(3, minmax(0, 1fr))" cells={[
            { text: forThem.length, sub: h.allPupils ? 'Whole class' : 'Chosen pupils', label: true },
            { text: done.length, sub: 'Done', tone: done.length ? 'green' : undefined },
            { text: notYet.length, sub: 'Not yet', tone: notYet.length ? 'amber' : undefined },
          ]} />
          {notYet.length > 0 && <div style={{ fontSize: 13 }}><b>Not yet:</b> {notYet.map(p => p.name).join(', ')}</div>}
          {done.length > 0 && <div style={{ fontSize: 13 }}><b>Done:</b> {done.map(p => p.name).join(', ')}</div>}
        </div>
        <div className="modal-footer">
          {h.canEdit && !confirm && <button className="btn" style={{ marginRight: 'auto', color: 'var(--red-text)' }} onClick={() => setConfirm(true)}><Trash2 size={13} />Remove</button>}
          {confirm && <><span style={{ marginRight: 'auto', fontSize: 13 }}>Remove this homework?</span>
            <button className="btn" onClick={() => setConfirm(false)}>Keep</button>
            <button className="btn btn-danger" disabled={busy} onClick={remove}>Remove</button></>}
          {!confirm && h.canEdit && <button className="btn" onClick={onEdit}><Pencil size={13} />Change</button>}
          {!confirm && <button className="btn" onClick={close}>Close</button>}
        </div>
      </div>
    </div>
  );
}

// The Homework tab on Islamic Studies: "Set homework", then a line per piece of homework, newest first.
export function HomeworkTab({ className, items, pupils, links, yearGroup }) {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null); // { kind: 'set', homework? } | { kind: 'view', homework }
  const load = useCallback(() => getSchoolHomework(className).then(l => { setList(l); setError(''); }).catch(e => setError(e.message || 'Could not load')), [className]);
  useEffect(() => { setList(null); load(); }, [load]);
  const count = h => (h.allPupils ? pupils.length : h.studentIds.length);
  return (
    <div className="card" style={{ display: 'grid', gap: 6 }}>
      <div className="card-title" style={{ marginBottom: 4 }}>Homework · {className}</div>
      <button type="button" className="line-row add" onClick={() => setModal({ kind: 'set' })}><Plus size={13} /> Add homework</button>
      {error && <div style={{ color: 'var(--red-text)', fontSize: 13 }}>{error}</div>}
      {!list && !error && <div className="text-muted" style={{ fontSize: 13 }}>Loading…</div>}
      {list && !list.length && <div className="text-muted" style={{ fontSize: 13 }}>No homework yet. Tap "Add homework" — as many as you like — or open a surah, du'aa or practical and tap "Set homework".</div>}
      {list && list.map(h => {
        const doneN = h.done.filter(id => h.allPupils || h.studentIds.includes(id)).length;
        return (
          <button key={h.id} type="button" className="line-row" onClick={() => setModal({ kind: 'view', homework: h })}>
            <span className="ct-two">
              <span className="line-row-name">{h.itemName || 'Homework'}{!h.allPupils ? ` · ${h.studentIds.length} pupil${h.studentIds.length === 1 ? '' : 's'}` : ''}</span>
              <span className="line-row-sub">{[niceDue(h.due), `${doneN} of ${count(h)} done`].filter(Boolean).join(' · ')}</span>
            </span>
            <ChevronRight size={16} />
          </button>
        );
      })}
      {modal?.kind === 'set' && (
        <HomeworkModal className={className} items={items} pupils={pupils} homework={modal.homework} yearGroup={yearGroup}
          onClose={() => setModal(null)} onSaved={async () => { setModal(null); await load(); }} />
      )}
      {modal?.kind === 'view' && (
        <HomeworkSheet homework={modal.homework} pupils={pupils} links={links.filter(l => l.itemId === modal.homework.itemId)}
          onEdit={() => setModal({ kind: 'set', homework: modal.homework })}
          onRemoved={async () => { setModal(null); await load(); }} onClose={() => setModal(null)} />
      )}
    </div>
  );
}
