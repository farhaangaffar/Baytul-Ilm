import React, { useState, useEffect, useCallback } from 'react';
import BoxRow from './BoxRow';
import { useBackToClose } from '../lib/useBackToClose';
import { getSchoolHomework, saveSchoolHomework, deleteSchoolHomework } from '../lib/store';
import { ChoiceBoxes } from './StudentDetails';
import { QuizEditor, QuizSection, QuizResults, SheetFrame, DEFAULT_SETTINGS, scoreTone, quizName } from './SchoolQuiz';
import { X, Save, Trash2, Pencil, Plus, ChevronRight, Clock, Copy } from 'lucide-react';

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
  // A plain task or a quiz (stage 4b): chosen when it's new; a quiz has its questions and settings (SchoolQuiz.js).
  const [what, setWhat] = useState(homework?.kind === 'quiz' ? 'Quiz' : 'Task');
  const isQuiz = what === 'Quiz';
  const [quiz, setQuiz] = useState(homework?.quiz || { questions: [], settings: DEFAULT_SETTINGS });
  // Once a pupil has handed a quiz in its questions are locked (their marks depend on them) — the owner's choice: a clear
  // notice, and "Copy this quiz" to make a changed version (a new quiz, set to the same class).
  const [copying, setCopying] = useState(false);
  const editing = homework && !copying ? homework : null;
  const locked = isQuiz && (editing?.handedIn || []).length > 0;
  function copyQuiz() {
    setCopying(true);
    setQuiz(q => ({ ...q, title: `${quizName(homework)} (copy)` }));
    setF(x => ({ ...x, due: isoIn(7) }));
  }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toggle = id => setF(x => ({ ...x, ids: x.ids.includes(id) ? x.ids.filter(i => i !== id) : [...x.ids, id] }));
  const picked = items.find(i => i.id === f.itemId);
  async function save(draft = false) {
    setBusy(true); setError('');
    try {
      await saveSchoolHomework({ id: editing?.id, className, itemId: isQuiz ? item?.id || homework?.itemId || null : (item || kind) ? f.itemId || null : null, text: f.text, due: f.due || null,
        studentIds: f.who === 'Chosen pupils' ? f.ids : [], ...(isQuiz ? { kind: 'quiz', quiz, draft } : {}) });
      await onSaved();
    } catch (e) { setError(e.message || 'Could not save'); setBusy(false); }
  }
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && close()}>
      <div className="modal" style={{ maxWidth: 620 }}>
        <div className="modal-header">
          <div className="modal-title">{copying ? `Copy of the quiz for ${className}` : homework ? (isQuiz ? 'Change the quiz' : 'Change homework') : `${isQuiz ? 'Quiz' : 'Homework'} for ${className}`}</div>
          <button className="btn btn-icon" onClick={close}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            {locked && (
              <div className="qz-locked">
                <div><b>Pupils have already handed this quiz in.</b> Its questions can't be changed now, because their marks depend
                  on them. You can still change the name, due date and settings. To change the questions, make a copy.</div>
                <button type="button" className="btn" onClick={copyQuiz}><Copy size={13} />Copy this quiz</button>
              </div>
            )}
            {copying && <div className="qz-copied">This is a copy. Change the questions as you like. Setting it makes a new quiz, and the old one keeps its marks.</div>}
            {!homework && <div className="form-group"><label>Homework or a quiz?</label>
              <ChoiceBoxes options={['Task', 'Quiz']} value={what} onChange={v => v && setWhat(v)} /></div>}
            {isQuiz ? <>
              {/* A quiz has its own name instead of the surah / du'aa / practical choice (the owner found both confusing), and
                  its parts in three clear sections. */}
              <QuizSection>
                <div className="form-group"><label htmlFor="qz-title">Name of the quiz</label>
                  <input id="qz-title" dir="auto" maxLength={120} value={quiz.title || ''} onChange={e => setQuiz(x => ({ ...x, title: e.target.value }))}
                    placeholder={item ? `e.g. ${item.name} quiz` : 'e.g. Surah Al-Ikhlaas quiz'} /></div>
            {item && <div className="text-muted" style={{ fontSize: 13 }}>On <b style={{ color: 'var(--ink)' }}>{item.name}</b> — pupils get its links with the quiz.</div>}
            <div className="form-group"><label htmlFor="hw-text">{isQuiz ? <>Instructions for pupils <span className="text-muted" style={{ fontWeight: 400 }}>· if you like</span></> : 'What to do'}</label>
              <textarea id="hw-text" rows={isQuiz ? 2 : 4} maxLength={2000} autoFocus={!isQuiz} value={f.text} onChange={e => setF(x => ({ ...x, text: e.target.value }))}
                placeholder={isQuiz ? 'e.g. Answer every question. You have one go.' : picked ? (picked.kind === 'surah' ? `e.g. Learn aayahs 1–4 of ${picked.name} by heart` : `e.g. Learn ${picked.name} by heart and say it at home`)
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
              </QuizSection>
              <QuizEditor quiz={quiz} onChange={setQuiz} locked={locked} />
            </> : <>
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
            <div className="form-group"><label htmlFor="hw-text">{isQuiz ? <>Instructions for pupils <span className="text-muted" style={{ fontWeight: 400 }}>· if you like</span></> : 'What to do'}</label>
              <textarea id="hw-text" rows={isQuiz ? 2 : 4} maxLength={2000} autoFocus={!isQuiz} value={f.text} onChange={e => setF(x => ({ ...x, text: e.target.value }))}
                placeholder={isQuiz ? 'e.g. Answer every question. You have one go.' : picked ? (picked.kind === 'surah' ? `e.g. Learn aayahs 1–4 of ${picked.name} by heart` : `e.g. Learn ${picked.name} by heart and say it at home`)
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
            </>}
          </div>
          {error && <div style={{ color: 'var(--red-text)', fontSize: 13, marginTop: 10 }}>{error}</div>}
        </div>
        <div className="modal-footer">
          {!isQuiz && <button className="btn" onClick={close}>Cancel</button>}
          {isQuiz ? <>
            {(!editing || editing.draft) && <button className="btn" disabled={busy || !quiz.questions.length} onClick={() => save(true)}>Save for later</button>}
            <button className="btn btn-primary" disabled={busy || !quiz.questions.length || (f.who === 'Chosen pupils' && !f.ids.length)} onClick={() => save(false)}>
              <Save size={13} />{editing && !editing.draft ? 'Save' : 'Set the quiz'}</button>
          </> : (
            <button className="btn btn-primary" disabled={busy || !f.text.trim() || (f.who === 'Chosen pupils' && !f.ids.length) || (!item && kind && !f.itemId)} onClick={() => save()}>
              <Save size={13} />{homework ? 'Save' : 'Set homework'}</button>
          )}
        </div>
      </div>
    </div>
  );
}

// One piece of homework: what to do, the item's links, and who has ticked it done.
function HomeworkSheet({ homework: h, pupils, links, onEdit, onRemoved, onClose, inline }) {
  const close = useBackToClose(!inline, onClose);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const forThem = h.allPupils ? pupils : pupils.filter(p => h.studentIds.includes(p.id));
  const done = forThem.filter(p => h.done.includes(p.id)), notYet = forThem.filter(p => !h.done.includes(p.id));
  // Three boxes to tap (the owner's pick, A): everyone, done, or not yet — "Not done", in red, once the due date has passed.
  const late = h.due && h.due < new Date().toISOString().slice(0, 10);
  const [show, setShow] = useState(notYet.length ? 'not' : 'all');
  const names = show === 'done' ? done : show === 'not' ? notYet : forThem;
  async function remove() { setBusy(true); try { await deleteSchoolHomework(h.id); await onRemoved(); } catch { setBusy(false); } }
  return (
    <SheetFrame inline={inline} close={close}>
        <div className="modal-header">
          <div><div className="modal-title">{h.itemName || 'Homework'}</div><div className="text-muted text-sm">{niceDue(h.due) || 'No due date'} · set by {h.setBy}</div></div>
          {!inline && <button className="btn btn-icon" onClick={close}><X size={16} /></button>}
        </div>
        <div className="modal-body" style={{ display: 'grid', gap: 12 }}>
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{h.text}</div>
          {links.length > 0 && <div className="text-muted" style={{ fontSize: 12.5 }}>Pupils also get {links.length === 1 ? 'its link' : `its ${links.length} links`}: {links.map(l => l.name).join(', ')}</div>}
          <BoxRow columns="repeat(3, minmax(0, 1fr))" cells={[
            { text: forThem.length, sub: h.allPupils ? 'Whole class' : 'Chosen pupils', label: true, onClick: () => setShow('all'), className: show === 'all' ? 'hw-shown' : '' },
            { text: done.length, sub: 'Done', tone: done.length ? 'green' : undefined, onClick: () => setShow('done'), className: show === 'done' ? 'hw-shown' : '' },
            { text: notYet.length, sub: late ? 'Not done' : 'Not yet', tone: notYet.length ? (late ? 'red' : 'amber') : undefined, onClick: () => setShow('not'), className: show === 'not' ? 'hw-shown' : '' },
          ]} />
          <div className="hw-names">
            {names.map(p => {
              const ticked = h.done.includes(p.id);
              // Each name in its box's colour: green done, amber not yet — red once the due date has passed.
              return <div key={p.id} className={`hw-name ${ticked ? 'done' : late ? 'late' : 'notyet'}`}>{p.name}</div>;
            })}
            {!names.length && <div className="text-muted" style={{ fontSize: 13 }}>{show === 'done' ? 'No one yet.' : 'Everyone has done it.'}</div>}
          </div>
        </div>
        <div className="modal-footer">
          {h.canEdit && !confirm && <button className="btn" style={{ marginRight: 'auto', color: 'var(--red-text)' }} onClick={() => setConfirm(true)}><Trash2 size={13} />Remove</button>}
          {confirm && <><span style={{ marginRight: 'auto', fontSize: 13 }}>Remove this homework?</span>
            <button className="btn" onClick={() => setConfirm(false)}>Keep</button>
            <button className="btn btn-danger" disabled={busy} onClick={remove}>Remove</button></>}
          {!confirm && h.canEdit && <button className="btn" onClick={onEdit}><Pencil size={13} />Change</button>}
          {!confirm && !inline && <button className="btn" onClick={close}>Close</button>}
        </div>
    </SheetFrame>
  );
}

// The Homework tab on Islamic Studies: "Set homework", then a line per piece of homework, newest first.
// On a computer (wide, from Studies.js) the lines are a list on the left and the picked homework — who has done it, or a
// quiz's results — is the panel on the right (the owner's ask, like the surahs); phones open it as a pop-up.
export function HomeworkTab({ className, items, pupils, links, yearGroup, wide }) {
  const [pick, setPick] = useState(null);
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null); // { kind: 'set', homework? } | { kind: 'view', homework }
  const load = useCallback(() => getSchoolHomework(className).then(l => { setList(l); setError(''); }).catch(e => setError(e.message || 'Could not load')), [className]);
  useEffect(() => { setList(null); load(); }, [load]);
  const isDraft = h => h.kind === 'quiz' && h.draft;
  const selected = wide && list ? (list.find(h => h.id === pick && !isDraft(h)) || list.find(h => !isDraft(h)) || null) : null;
  const panel = selected && (selected.kind === 'quiz'
    ? <QuizResults key={selected.id} inline homework={selected} pupils={pupils}
        onEdit={() => setModal({ kind: 'view', homework: selected, editing: true })} onChanged={load}
        onRemoved={async () => { setPick(null); await load(); }} onClose={() => {}} />
    : <HomeworkSheet key={selected.id} inline homework={selected} pupils={pupils} links={links.filter(l => l.itemId === selected.itemId)}
        onEdit={() => setModal({ kind: 'view', homework: selected, editing: true })}
        onRemoved={async () => { setPick(null); await load(); }} onClose={() => {}} />);
  const listCard = (
    <div className="card" style={{ display: 'grid', gap: 6 }}>
      <div className="card-title" style={{ marginBottom: 4 }}>Homework · {className}</div>
      <button type="button" className="line-row add" onClick={() => setModal({ kind: 'set' })}><Plus size={13} /> Add homework</button>
      {error && <div style={{ color: 'var(--red-text)', fontSize: 13 }}>{error}</div>}
      {!list && !error && <div className="text-muted" style={{ fontSize: 13 }}>Loading…</div>}
      {list && !list.length && <div className="text-muted" style={{ fontSize: 13 }}>No homework yet. Tap "Add homework" — a task or a quiz, as many as you like — or open a surah, du'aa or practical and tap "Set homework".</div>}
      {list && list.map(h => {
        const quiz = h.kind === 'quiz';
        // A quiz: "Draft" until it's set, then its due date with the class average (or how many to mark) beside it; a draft
        // opens straight in the editor.
        // Just the due date — who has done it or handed it in is inside (the owner's ask).
        const sub = quiz && h.draft ? ['Draft — pupils can\'t see it yet'] : [niceDue(h.due) || 'No due date'];
        return (
          <button key={h.id} type="button" className={`line-row ${selected && selected.id === h.id ? 'on' : ''}`}
            onClick={() => (quiz && h.draft ? setModal({ kind: 'set', homework: h }) : wide ? setPick(h.id) : setModal({ kind: 'view', homework: h }))}>
            <span className="ct-two">
              <span className="line-row-name">{quiz ? quizName(h) : h.itemName || 'Homework'}{!h.allPupils ? ` · ${h.studentIds.length} pupil${h.studentIds.length === 1 ? '' : 's'}` : ''}</span>
              <span className="line-row-sub">{sub.filter(Boolean).join(' · ')}</span>
            </span>
            {quiz && h.draft && <span className="qz-score grey">Draft</span>}
            {quiz && !h.draft && h.toMark > 0 && <span className="qz-score amber"><Clock size={11} /> {h.toMark} to mark</span>}
            {quiz && !h.draft && !h.toMark && h.average !== null && h.average !== undefined && <span className={`qz-score ${scoreTone(h.average, 100)}`}>{h.average}%</span>}
            {!wide && <ChevronRight size={16} />}
          </button>
        );
      })}
    </div>
  );
  return (
    <div className={wide ? 'st-split' : undefined}>
      {listCard}
      {wide && (panel || <div className="card st-panel"><div className="text-muted" style={{ fontSize: 13 }}>Pick a piece of homework to see who has done it.</div></div>)}
      {modal?.kind === 'set' && (
        <HomeworkModal className={className} items={items} pupils={pupils} homework={modal.homework} yearGroup={yearGroup}
          onClose={() => setModal(null)} onSaved={async () => { setModal(null); await load(); }} />
      )}
      {modal?.kind === 'view' && !wide && modal.homework.kind === 'quiz' && (
        <QuizResults homework={modal.homework} pupils={pupils}
          onEdit={() => setModal(m => ({ ...m, editing: true }))} onChanged={load}
          onRemoved={async () => { setModal(null); await load(); }} onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'view' && !wide && modal.homework.kind !== 'quiz' && (
        <HomeworkSheet homework={modal.homework} pupils={pupils} links={links.filter(l => l.itemId === modal.homework.itemId)}
          onEdit={() => setModal(m => ({ ...m, editing: true }))}
          onRemoved={async () => { setModal(null); await load(); }} onClose={() => setModal(null)} />
      )}
      {/* Change opens on top of the homework (closing one pop-up to open another made the new one close too). */}
      {modal?.kind === 'view' && modal.editing && (
        <HomeworkModal className={className} items={items} pupils={pupils} homework={modal.homework} yearGroup={yearGroup}
          onClose={() => setModal(m => (m ? { ...m, editing: false } : m))} onSaved={async () => { setModal(null); await load(); }} />
      )}
    </div>
  );
}
