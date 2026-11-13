import React, { useState, useEffect, useCallback } from 'react';
import BoxRow from './BoxRow';
import { useBackToClose } from '../lib/useBackToClose';
import { getQuizResults, markQuizAttempt, sendQuizScores, deleteSchoolHomework, submitQuiz } from '../lib/store';
import { ChoiceBoxes } from './StudentDetails';
import { X, Save, Trash2, Pencil, Plus, Check, Send, ChevronLeft, ChevronRight } from 'lucide-react';

// Quizzes (a school's Islamic Studies, stage 4b — server/schoolQuiz.js): a quiz is a piece of homework with questions.
// The teacher builds it in the homework pop-up (question cards, each opened in its own pop-up, and four settings), sees
// the results (QuizResults), marks long answers (AttemptModal) and sends the scores; the pupil takes it one question at a
// time (QuizTaker). Marking is done on the server — pupils are never sent the right answers until they may see them.

export const TYPE_LABELS = { one: 'One answer', many: 'Tick boxes', truefalse: 'True / false', choose: 'Two choices each', short: 'Short answer', long: 'Long answer' };
const TYPES = Object.keys(TYPE_LABELS);
export const DEFAULT_SETTINGS = { tries: 'one', shuffle: false, scoreNow: true, showAnswers: true };
const pts = n => `${n} point${n === 1 ? '' : 's'}`;
// What a question is worth (as the server works it out): tick boxes and two-choice lists give points for each right answer.
export const worthOf = q => q.worth ?? (q.type === 'many' ? q.points * (q.answers || []).length : q.type === 'choose' ? q.points * (q.rows || []).length : q.points);
// A quiz's name on a line: its own name, else what it's on.
export const quizName = h => h.quiz?.title || h.title || (h.itemName ? `Quiz · ${h.itemName}` : 'Quiz');
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
export const scoreTone = (score, max) => { const p = pct(score, max); return p >= 80 ? 'green' : p >= 50 ? 'amber' : 'red'; };

// What a pupil answered, and the right answer, in words.
function answerText(q, a) {
  if (q.type === 'one') return a === null || a === undefined || a === '' ? '' : q.options[a] ?? '';
  if (q.type === 'many') return (Array.isArray(a) ? a : []).map(i => q.options[i]).filter(Boolean).join(', ');
  if (q.type === 'truefalse') return a === true ? 'True' : a === false ? 'False' : '';
  return String(a ?? '');
}
function rightText(q, right) {
  if (q.type === 'short') return Array.isArray(q.accepted) ? q.accepted.join(' / ') : String(right ?? '');
  if (q.type === 'long') return '';
  return answerText(q, q.type === 'one' || q.type === 'truefalse' ? (right !== undefined ? right : q.answer) : (right !== undefined ? right : q.answers));
}

// The right answer of a full question (the teacher has it; a pupil is sent it separately, only when allowed).
const keyOf = q => (q.type === 'one' || q.type === 'truefalse' ? q.answer : q.type === 'many' || q.type === 'choose' ? q.answers : q.type === 'short' ? q.accepted : null);

// What was answered, shown against the right answer — no coloured side bars (the owner's ask): each choice is a row, the
// one picked tinted green ✓ (right) or red ✗ (wrong), a right one not picked outlined in green; a two-choice list shows
// each line's pick the same way; a short answer is one tinted box with the accepted answers under it.
const Mark = ({ ok }) => <span className={`qz-av-ic ${ok ? 'ok' : 'no'}`}>{ok ? <Check size={12} /> : <X size={12} />}</span>;
export function AnswerView({ q, given, answer, result }) {
  if (q.type === 'one' || q.type === 'many' || q.type === 'truefalse') {
    const opts = q.type === 'truefalse' ? ['True', 'False'] : q.options;
    const val = i => (q.type === 'truefalse' ? i === 0 : i);
    const picked = i => (q.type === 'many' ? (Array.isArray(given) ? given : []).includes(i) : given === val(i));
    const right = i => (q.type === 'many' ? (Array.isArray(answer) ? answer : []).includes(i) : answer === val(i));
    const none = !opts.some((_, i) => picked(i));
    return (
      <div className="qz-av">
        {none && <div className="qz-av-none">No answer</div>}
        {opts.map((o, i) => {
          const p = picked(i), r = right(i);
          return (
            <div key={i} className={`qz-av-row ${p ? (r ? 'good' : 'bad') : r ? 'missed' : ''}`} dir="auto">
              {p ? <Mark ok={r} /> : <span className="qz-av-ic blank" />}<span>{o}</span>
              {!p && r && <span className="qz-av-tag">Right answer</span>}
            </div>
          );
        })}
      </div>
    );
  }
  if (q.type === 'choose') {
    const g = Array.isArray(given) ? given : [];
    return (
      <div className="qz-av">
        {q.rows.map((row, i) => {
          const p = g[i], r = (answer || [])[i], blank = p !== 0 && p !== 1;
          return (
            <div key={i} className="qz-av-line">
              <span dir="auto">{row}</span>
              <span className="qz-av-picks">
                {blank ? <span className="qz-av-pick">No answer</span>
                  : <span className={`qz-av-pick ${p === r ? 'good' : 'bad'}`}><Mark ok={p === r} />{q.columns[p]}</span>}
                {p !== r && r !== undefined && <span className="qz-av-pick missed"><Check size={12} />{q.columns[r]}</span>}
              </span>
            </div>
          );
        })}
      </div>
    );
  }
  if (q.type === 'short') {
    const text = String(given ?? '').trim();
    const acc = Array.isArray(answer) ? answer.filter(Boolean) : [];
    const plain = v => String(v).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    const ok = result && result.got !== null && result.got !== undefined ? result.got > 0 : !!text && acc.some(a => plain(a) === plain(text));
    return (
      <div className="qz-av">
        {text ? <div className={`qz-av-row ${ok ? 'good' : 'bad'}`} dir="auto"><Mark ok={ok} /><span>{text}</span></div> : <div className="qz-av-none">No answer</div>}
        {!ok && acc.length > 0 && <div className="qz-av-row missed" dir="auto"><span className="qz-av-ic blank" /><span>{acc.join(' / ')}</span><span className="qz-av-tag">Right answer</span></div>}
      </div>
    );
  }
  const text = String(given ?? '').trim();
  return text ? <div className="qz-av-long" dir="auto">{text}</div> : <div className="qz-av-none">No answer</div>;
}

// ——— The teacher's builder ———

// One question in its pop-up: the kind, the question, points, and its answers (tap the right one — it turns green).
function QuestionModal({ question, number, onSave, onRemove, onClose }) {
  const close = useBackToClose(true, onClose);
  const [q, setQ] = useState(() => ({ type: 'one', text: '', points: 1, options: ['', ''], answer: null, answers: [], accepted: [''], columns: ['', ''], rows: [''],
    ...question, picks: question?.type === 'choose' ? question.answers : [], ...(question?.type === 'choose' ? { answers: [] } : {}) }));
  const [error, setError] = useState('');
  const set = (k, v) => setQ(x => ({ ...x, [k]: v }));
  const opts = q.options && q.options.length ? q.options : ['', ''];
  function setType(label) {
    const t = TYPES.find(k => TYPE_LABELS[k] === label);
    if (!t) return;
    setQ(x => ({ ...x, type: t, options: x.options?.length ? x.options : ['', ''], accepted: x.accepted?.length ? x.accepted : [''],
      columns: x.columns?.length === 2 ? x.columns : ['', ''], rows: x.rows?.length ? x.rows : [''],
      answer: t === 'truefalse' ? (typeof x.answer === 'boolean' ? x.answer : null) : t === 'one' ? (Number.isInteger(x.answer) ? x.answer : null) : x.answer }));
  }
  function setOption(i, v) { set('options', opts.map((o, j) => (j === i ? v : o))); }
  function removeOption(i) {
    setQ(x => ({ ...x, options: opts.filter((_, j) => j !== i),
      answer: Number.isInteger(x.answer) ? (x.answer === i ? null : x.answer > i ? x.answer - 1 : x.answer) : x.answer,
      answers: (x.answers || []).filter(a => a !== i).map(a => (a > i ? a - 1 : a)) }));
  }
  function tapRight(i) {
    if (q.type === 'one') set('answer', i);
    else set('answers', (q.answers || []).includes(i) ? q.answers.filter(a => a !== i) : [...(q.answers || []), i]);
  }
  function save() {
    const text = q.text.trim();
    if (!text) { setError('Write the question.'); return; }
    const out = { type: q.type, text, points: Math.max(1, Math.min(100, Math.round(Number(q.points) || 1))) };
    if (q.type === 'one' || q.type === 'many') {
      // Blank answers are left out, and the right answer(s) follow them.
      const keep = opts.map((o, i) => [o.trim(), i]).filter(([o]) => o);
      if (keep.length < 2) { setError('Give at least two answers to choose from.'); return; }
      out.options = keep.map(([o]) => o);
      const at = i => keep.findIndex(([, j]) => j === i);
      if (q.type === 'one') {
        if (!Number.isInteger(q.answer) || at(q.answer) < 0) { setError('Tap the right answer.'); return; }
        out.answer = at(q.answer);
      } else {
        const a = (q.answers || []).map(at).filter(i => i >= 0).sort((x, y) => x - y);
        if (!a.length) { setError('Tap the right answers.'); return; }
        out.answers = a;
      }
    } else if (q.type === 'choose') {
      const cols = q.columns.map(c => c.trim());
      if (!cols[0] || !cols[1]) { setError('Name the two choices (e.g. Sunnah and Fardh).'); return; }
      const keep = q.rows.map((r, i) => [r.trim(), q.picks[i]]).filter(([r]) => r);
      if (!keep.length) { setError('Add at least one line to the list.'); return; }
      if (keep.some(([, a]) => a !== 0 && a !== 1)) { setError(`Choose ${cols[0]} or ${cols[1]} for every line.`); return; }
      Object.assign(out, { columns: cols, rows: keep.map(([r]) => r), answers: keep.map(([, a]) => a) });
    } else if (q.type === 'truefalse') {
      if (typeof q.answer !== 'boolean') { setError('Tap True or False — the right answer.'); return; }
      out.answer = q.answer;
    } else if (q.type === 'short') {
      const acc = (q.accepted || []).map(a => a.trim()).filter(Boolean);
      if (!acc.length) { setError('Type at least one answer to accept.'); return; }
      out.accepted = acc;
    }
    onSave(out);
  }
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && close()}>
      <div className="modal qz-qmodal" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <div className="modal-title">{question ? `Question ${number}` : 'Add a question'}</div>
          <button className="btn btn-icon" onClick={close}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="form-group"><label>Kind of question</label>
              <ChoiceBoxes columns={3} options={TYPES.map(t => TYPE_LABELS[t])} value={TYPE_LABELS[q.type]} onChange={setType} /></div>
            <div className="form-group"><label htmlFor="qz-text">Question</label>
              <textarea id="qz-text" dir="auto" rows={3} maxLength={1000} autoFocus={!question} value={q.text} onChange={e => set('text', e.target.value)}
                placeholder="e.g. How many aayahs are in Surah Al-Ikhlaas?" /></div>
            {(q.type === 'one' || q.type === 'many') && (
              <div className="form-group"><label>Answers <span className="text-muted" style={{ fontWeight: 400 }}>· tap the {q.type === 'one' ? 'right one' : 'right ones'}</span></label>
                <div style={{ display: 'grid', gap: 6 }}>
                  {opts.map((o, i) => {
                    const right = q.type === 'one' ? q.answer === i : (q.answers || []).includes(i);
                    return (
                      <div key={i} className={`qz-edit-opt ${right ? 'right' : ''}`}>
                        <button type="button" className={`qz-mark ${q.type === 'many' ? 'sq' : ''}`} onClick={() => tapRight(i)} aria-label={right ? 'Right answer' : 'Mark as right'}>
                          {right && <Check size={13} />}</button>
                        <input dir="auto" value={o} maxLength={300} onChange={e => setOption(i, e.target.value)} placeholder={`Answer ${i + 1}`} />
                        {opts.length > 2 && <button type="button" className="btn btn-icon" onClick={() => removeOption(i)} aria-label="Remove"><X size={14} /></button>}
                      </div>
                    );
                  })}
                  {opts.length < 10 && <button type="button" className="line-row add" onClick={() => set('options', [...opts, ''])}><Plus size={13} /> Another answer</button>}
                </div></div>
            )}
            {q.type === 'truefalse' && (
              <div className="form-group"><label>The right answer</label>
                <div className="choice-boxes" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                  {[true, false].map(v => <button key={String(v)} type="button" className={q.answer === v ? 'on qz-right' : ''} onClick={() => set('answer', v)}>{v ? 'True' : 'False'}</button>)}
                </div></div>
            )}
            {q.type === 'short' && (
              <div className="form-group"><label>Answers to accept <span className="text-muted" style={{ fontWeight: 400 }}>· capitals, spaces and full stops don't matter</span></label>
                <div style={{ display: 'grid', gap: 6 }}>
                  {(q.accepted || ['']).map((a, i) => (
                    <div key={i} className="qz-edit-opt right">
                      <span className="qz-mark"><Check size={13} /></span>
                      <input dir="auto" value={a} maxLength={200} onChange={e => set('accepted', q.accepted.map((x, j) => (j === i ? e.target.value : x)))} placeholder={i ? 'Another way to write it' : 'e.g. One'} />
                      {q.accepted.length > 1 && <button type="button" className="btn btn-icon" onClick={() => set('accepted', q.accepted.filter((_, j) => j !== i))} aria-label="Remove"><X size={14} /></button>}
                    </div>
                  ))}
                  {q.accepted.length < 20 && <button type="button" className="line-row add" onClick={() => set('accepted', [...q.accepted, ''])}><Plus size={13} /> Another way to write it</button>}
                </div></div>
            )}
            {q.type === 'choose' && <>
              {/* A list on the left, and for each line one of two choices on the right (the owner's ask). */}
              <div className="form-group"><label>The two choices</label>
                <div className="qz-two">
                  {[0, 1].map(c => <input key={c} dir="auto" value={q.columns[c]} maxLength={60} placeholder={c ? 'e.g. Sunnah' : 'e.g. Fardh'}
                    onChange={e => set('columns', q.columns.map((x, j) => (j === c ? e.target.value : x)))} />)}
                </div></div>
              <div className="form-group"><label>The list <span className="text-muted" style={{ fontWeight: 400 }}>· tap the right choice for each line</span></label>
                <div style={{ display: 'grid', gap: 6 }}>
                  {q.rows.map((r, i) => (
                    <div key={i} className="qz-choose-edit">
                      <input dir="auto" value={r} maxLength={300} placeholder={`Line ${i + 1}`} onChange={e => set('rows', q.rows.map((x, j) => (j === i ? e.target.value : x)))} />
                      <div className="qz-xy">
                        {[0, 1].map(c => <button key={c} type="button" className={q.picks[i] === c ? 'right' : ''}
                          onClick={() => set('picks', q.rows.map((_, j) => (j === i ? c : q.picks[j] ?? null)))}>{q.columns[c].trim() || (c ? 'Choice 2' : 'Choice 1')}</button>)}
                      </div>
                      {q.rows.length > 1 && <button type="button" className="btn btn-icon" onClick={() => setQ(x => ({ ...x, rows: x.rows.filter((_, j) => j !== i), picks: x.rows.map((_, j) => x.picks[j] ?? null).filter((_, j) => j !== i) }))} aria-label="Remove"><X size={14} /></button>}
                    </div>
                  ))}
                  {q.rows.length < 30 && <button type="button" className="line-row add" onClick={() => set('rows', [...q.rows, ''])}><Plus size={13} /> Another line</button>}
                </div></div>
            </>}
            {q.type === 'long' && <div className="text-muted" style={{ fontSize: 13 }}>Pupils write their answer, and you give the mark when they've handed it in.</div>}
            <div className="form-group" style={{ maxWidth: 260 }}><label htmlFor="qz-pts">{q.type === 'many' ? 'Points for each right tick' : q.type === 'choose' ? 'Points for each line right' : 'Points'}</label>
              <input id="qz-pts" type="number" min={1} max={100} value={q.points} onChange={e => set('points', e.target.value)} style={{ maxWidth: 120 }} />
              {q.type === 'many' && <span className="text-muted" style={{ fontSize: 12 }}>A wrong tick takes one right tick's points away (never below 0).</span>}</div>
          </div>
          {error && <div style={{ color: 'var(--red-text)', fontSize: 13, marginTop: 10 }}>{error}</div>}
        </div>
        <div className="modal-footer">
          {onRemove && <button className="btn" style={{ marginRight: 'auto', color: 'var(--red-text)' }} onClick={onRemove}><Trash2 size={13} />Remove</button>}
          <button className="btn" onClick={close}>Cancel</button>
          <button className="btn btn-primary" onClick={save}><Save size={13} />{question ? 'Save' : 'Add'}</button>
        </div>
      </div>
    </div>
  );
}

// A question as a card in the builder: its kind and points, the question, and its answers with the right one(s) green.
function QuestionCard({ q, n, onOpen }) {
  const Tag = onOpen ? 'button' : 'div';
  return (
    <Tag type={onOpen ? 'button' : undefined} className="qz-card" onClick={onOpen}>
      <div className="qz-card-top"><span>{n} · {TYPE_LABELS[q.type]}</span><span>{pts(worthOf(q))}{onOpen && <Pencil size={12} style={{ marginLeft: 6 }} />}</span></div>
      <div className="qz-q" dir="auto">{q.text}</div>
      {(q.type === 'one' || q.type === 'many') && (
        <div className="qz-opts">{q.options.map((o, i) => {
          const right = q.type === 'one' ? q.answer === i : q.answers.includes(i);
          return <div key={i} className={`qz-opt ${right ? 'right' : ''}`} dir="auto">{right && <Check size={12} />}{o}</div>;
        })}</div>
      )}
      {q.type === 'truefalse' && <div className="qz-opts">{[true, false].map(v => <div key={String(v)} className={`qz-opt ${q.answer === v ? 'right' : ''}`}>{q.answer === v && <Check size={12} />}{v ? 'True' : 'False'}</div>)}</div>}
      {q.type === 'short' && <div className="qz-opts">{q.accepted.map((a, i) => <div key={i} className="qz-opt right" dir="auto"><Check size={12} />{a}</div>)}</div>}
      {q.type === 'choose' && (
        <div className="qz-list">{q.rows.map((r, i) => (
          <div key={i} className="qz-list-row"><span dir="auto">{r}</span><span className="qz-opt right"><Check size={12} />{q.columns[q.answers[i]]}</span></div>
        ))}</div>
      )}
      {q.type === 'long' && <div className="text-muted" style={{ fontSize: 12.5 }}>You mark this one</div>}
    </Tag>
  );
}

// The four settings, two boxes each (the owner's approved version).
const SETTING_ROWS = [
  ['tries', 'How many tries?', ['One try', 'Unlimited tries'], v => (v === 'many' ? 1 : 0), i => (i ? 'many' : 'one')],
  ['shuffle', 'Question order', ['As I wrote them', 'Shuffled'], v => (v ? 1 : 0), i => !!i],
  ['scoreNow', 'When do pupils see their score?', ['Straight away', 'When I send it'], v => (v ? 0 : 1), i => !i],
  ['showAnswers', 'Show the right answers after?', ['Yes', 'No'], v => (v ? 0 : 1), i => !i],
];

// The questions and settings, inside the homework pop-up. `locked`: pupils have handed it in, so the questions stay.
export function QuizEditor({ quiz, onChange, locked }) {
  const [open, setOpen] = useState(null); // { i } | { add: true }
  const qs = quiz.questions;
  const total = qs.reduce((t, q) => t + worthOf(q), 0);
  const s = { ...DEFAULT_SETTINGS, ...quiz.settings };
  return (
    <>
    <div className="qz-section s2">
      <div className="qz-section-head"><span className="qz-step">2</span><b>Questions</b><span className="text-muted" style={{ marginLeft: 'auto' }}>{qs.length ? `${qs.length} · ${pts(total)}` : ''}</span></div>
      {qs.map((q, i) => <QuestionCard key={i} q={q} n={i + 1} onOpen={locked ? undefined : () => setOpen({ i })} />)}
      {!locked && qs.length < 60 && <button type="button" className="line-row add" onClick={() => setOpen({ add: true })}><Plus size={13} /> Add a question</button>}
    </div>
    <div className="qz-section s3">
      <div className="qz-section-head"><span className="qz-step">3</span><b>Settings</b></div>
      <div className="qz-settings">
        {SETTING_ROWS.map(([k, label, opts, toIdx, fromIdx]) => (
          <div key={k} className="qz-set">
            <div className="qz-set-label">{label}</div>
            <ChoiceBoxes columns={2} options={opts} value={opts[toIdx(s[k])]}
              onChange={v => { const i = opts.indexOf(v); if (i < 0) return; onChange({ ...quiz, settings: { ...s, [k]: fromIdx(i) } }); }} />
          </div>
        ))}
      </div>
    </div>
    {/* Outside the coloured sections, so it keeps the normal pop-up look (inside one it picked up their all-white fields). */}
      {open && (
        <QuestionModal question={open.add ? null : qs[open.i]} number={open.add ? qs.length + 1 : open.i + 1}
          onClose={() => setOpen(null)}
          onRemove={open.add ? null : () => { onChange({ ...quiz, questions: qs.filter((_, j) => j !== open.i) }); setOpen(null); }}
          onSave={q => { onChange({ ...quiz, questions: open.add ? [...qs, q] : qs.map((x, j) => (j === open.i ? q : x)) }); setOpen(null); }} />
      )}
    </>
  );
}

// The quiz's own section 1 (in the homework pop-up): its name and what the pupils need to know.
export function QuizSection({ children }) {
  return (
    <div className="qz-section s1">
      <div className="qz-section-head"><span className="qz-step">1</span><b>About the quiz</b></div>
      <div className="form-grid">{children}</div>
    </div>
  );
}

// ——— The teacher's results ———

// Each pupil's best go (the one that counts).
function bestOf(attempts) {
  const best = {};
  for (const a of attempts) if (!best[a.studentId] || a.score > best[a.studentId].score) best[a.studentId] = a;
  return best;
}

// One pupil's answers: each question, what they said, the right answer and the mark — long answers are marked here (tap
// a number). With several goes, boxes choose which.
function AttemptModal({ quiz, name, attempts, onClose, onMarked }) {
  const close = useBackToClose(true, onClose);
  const [which, setWhich] = useState(() => {
    const w = attempts.findIndex(a => a.waiting > 0);
    return w >= 0 ? w : attempts.length - 1;
  });
  const a = attempts[which];
  const [marks, setMarks] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setMarks({}); }, [which]);
  const got = i => (marks[i] !== undefined ? marks[i] : a.results[i]?.got);
  const score = quiz.questions.reduce((t, _, i) => t + (got(i) || 0), 0);
  const waiting = quiz.questions.filter((_, i) => got(i) === null || got(i) === undefined).length;
  async function save() {
    setBusy(true); setError('');
    try { await markQuizAttempt(a.id, marks); await onMarked(); } catch (e) { setError(e.message || 'Could not save'); setBusy(false); }
  }
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && close()}>
      <div className="modal" style={{ maxWidth: 600 }}>
        <div className="modal-header">
          <div><div className="modal-title">{name}</div>
            <div className="text-muted text-sm">{score} / {a.max}{waiting ? ` so far · ${waiting} to mark` : ` · ${pct(score, a.max)}%`}</div></div>
          <button className="btn btn-icon" onClick={close}><X size={16} /></button>
        </div>
        <div className="modal-body" style={{ display: 'grid', gap: 10 }}>
          {attempts.length > 1 && (
            <div className="choice-boxes" style={{ gridTemplateColumns: `repeat(${Math.min(attempts.length, 4)}, minmax(0, 1fr))` }}>
              {attempts.map((t, i) => <button key={t.id} type="button" className={which === i ? 'on' : ''} onClick={() => setWhich(i)}>Go {i + 1} · {t.score}/{t.max}</button>)}
            </div>
          )}
          {quiz.questions.map((q, i) => {
            const g = got(i), of = a.results[i]?.of ?? worthOf(q);
            const tone = g === null || g === undefined ? 'amber' : g >= of ? 'green' : g > 0 ? 'amber' : 'red';
            return (
              <div key={i} className="qz-ans">
                <div className="qz-card-top"><span>{i + 1} · {TYPE_LABELS[q.type]}</span><span className={`qz-got ${tone}`}>{g === null || g === undefined ? 'To mark' : `${g} / ${of}`}</span></div>
                <div className="qz-q" dir="auto">{q.text}</div>
                <AnswerView q={q} given={a.answers[i]} answer={keyOf(q)} result={a.results[i]} />
                {q.type === 'long' && (
                  <div className="qz-pointboxes">
                    {Array.from({ length: Math.min(of, 20) + 1 }, (_, p) => (
                      <button key={p} type="button" className={g === p ? 'on' : ''} onClick={() => setMarks(m => ({ ...m, [i]: p }))}>{p}</button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {error && <div style={{ color: 'var(--red-text)', fontSize: 13 }}>{error}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={close}>Close</button>
          {quiz.questions.some(q => q.type === 'long') && <button className="btn btn-primary" disabled={busy || !Object.keys(marks).length} onClick={save}><Save size={13} />Save marks</button>}
        </div>
      </div>
    </div>
  );
}

// A quiz's results: who's handed in, the class average, long answers to mark; a line per pupil with their score (tap to
// see their answers and mark), a line per question ("7/9 right"), and "Send scores to pupils" when scores wait for it.
// A homework's or quiz's results: a pop-up on phones, or — on a computer, in Islamic Studies' Homework tab — the panel on
// the right of the list (inline; no close button, the list picks another).
export function SheetFrame({ inline, close, children, after }) {
  if (inline) return <div className="card st-panel hw-panel">{children}{after}</div>;
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && close()}>
      <div className="modal" style={{ maxWidth: 600 }}>{children}</div>
      {after}
    </div>
  );
}

export function QuizResults({ homework: h, pupils, onEdit, onRemoved, onChanged, onClose, inline }) {
  const close = useBackToClose(!inline, onClose);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [show, setShow] = useState('all');
  const [open, setOpen] = useState(null); // a pupil
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(!!h.scoresSentAt);
  const load = useCallback(() => getQuizResults(h.id).then(d => { setData(d); setError(''); }).catch(e => setError(e.message || 'Could not load')), [h.id]);
  useEffect(() => { load(); }, [load]);
  const forThem = h.allPupils ? pupils : pupils.filter(p => h.studentIds.includes(p.id));
  const quiz = data?.quiz || h.quiz;
  const attempts = data?.attempts || [];
  const best = bestOf(attempts);
  const inN = forThem.filter(p => best[p.id]);
  const notYet = forThem.filter(p => !best[p.id]);
  const toMark = forThem.filter(p => attempts.some(a => a.studentId === p.id && a.waiting > 0));
  const marked = inN.map(p => best[p.id]).filter(a => !a.waiting && a.max);
  const average = marked.length ? Math.round(marked.reduce((t, a) => t + a.score / a.max, 0) / marked.length * 100) : null;
  const late = h.due && h.due < new Date().toISOString().slice(0, 10);
  const names = show === 'in' ? inN : show === 'not' ? notYet : show === 'mark' ? toMark : forThem;
  const needsSending = quiz && !quiz.settings.scoreNow && !sent;
  async function remove() { setBusy(true); try { await deleteSchoolHomework(h.id); await onRemoved(); } catch { setBusy(false); } }
  async function send() { setBusy(true); try { await sendQuizScores(h.id); setSent(true); await onChanged(); } catch (e) { setError(e.message || 'Could not send'); } setBusy(false); }
  const shown = k => (show === k ? 'hw-shown' : '');
  return (
    <SheetFrame inline={inline} close={close} after={open && data && (
        <AttemptModal quiz={quiz} name={open.name} attempts={attempts.filter(a => a.studentId === open.id)}
          onClose={() => setOpen(null)} onMarked={async () => { setOpen(null); await load(); await onChanged(); }} />
      )}>
        <div className="modal-header">
          <div><div className="modal-title">{quizName(h)}</div>
            <div className="text-muted text-sm">{[niceDueShort(h.due), quiz ? `${quiz.questions.length} questions` : '', `set by ${h.setBy}`].filter(Boolean).join(' · ')}</div></div>
          {!inline && <button className="btn btn-icon" onClick={close}><X size={16} /></button>}
        </div>
        <div className="modal-body" style={{ display: 'grid', gap: 12 }}>
          {h.text && <div style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{h.text}</div>}
          <BoxRow columns="repeat(3, minmax(0, 1fr))" cells={[
            { text: forThem.length, sub: h.allPupils ? 'Whole class' : 'Chosen pupils', label: true, onClick: () => setShow('all'), className: shown('all') },
            { text: inN.length, sub: 'Handed in', tone: inN.length ? 'green' : undefined, onClick: () => setShow('in'), className: shown('in') },
            { text: notYet.length, sub: late ? 'Not done' : 'Not yet', tone: notYet.length ? (late ? 'red' : 'amber') : undefined, onClick: () => setShow('not'), className: shown('not') },
          ]} />
          <BoxRow columns="repeat(2, minmax(0, 1fr))" cells={[
            { text: average === null ? '—' : `${average}%`, sub: 'Class average', tone: average === null ? undefined : scoreTone(average, 100) },
            { text: toMark.length, sub: 'Long answers to mark', tone: toMark.length ? 'amber' : undefined, onClick: toMark.length ? () => setShow('mark') : undefined, className: shown('mark') },
          ]} />
          {needsSending && inN.length > 0 && (
            <button type="button" className="btn btn-primary" style={{ justifyContent: 'center' }} disabled={busy} onClick={send}><Send size={13} />Send scores to pupils</button>
          )}
          {quiz && !quiz.settings.scoreNow && sent && <div className="text-muted" style={{ fontSize: 12.5 }}>Scores sent — pupils and parents can see them.</div>}
          {error && <div style={{ color: 'var(--red-text)', fontSize: 13 }}>{error}</div>}
          {!data && !error && <div className="text-muted" style={{ fontSize: 13 }}>Loading…</div>}
          {data && (
            <div style={{ display: 'grid', gap: 6 }}>
              <div className="qz-head"><b>Pupils</b></div>
              {names.map(p => {
                const b = best[p.id];
                const waiting = attempts.some(a => a.studentId === p.id && a.waiting > 0);
                return (
                  <button key={p.id} type="button" className="line-row" disabled={!b} style={!b ? { cursor: 'default' } : undefined} onClick={() => b && setOpen(p)}>
                    <span className="line-row-name">{p.name}</span>
                    {b ? <span className={`qz-score ${waiting ? 'amber' : scoreTone(b.score, b.max)}`}>{waiting ? `${b.score}/${b.max} · to mark` : `${b.score}/${b.max}`}</span>
                      : <span className={`qz-score ${late ? 'red' : 'grey'}`}>{late ? 'Not done' : 'Not yet'}</span>}
                  </button>
                );
              })}
              {!names.length && <div className="text-muted" style={{ fontSize: 13 }}>{show === 'not' ? 'Everyone has handed it in.' : show === 'mark' ? 'Nothing to mark.' : 'No one yet.'}</div>}
              <div className="qz-head" style={{ marginTop: 8 }}><b>Questions</b></div>
              {quiz.questions.map((q, i) => {
                const rs = inN.map(p => best[p.id].results[i]).filter(Boolean);
                const done = rs.filter(r => r.got !== null && r.got !== undefined);
                const right = done.filter(r => r.got >= r.of).length;
                const label = !rs.length ? '—' : q.type === 'long' && done.length < rs.length ? `${rs.length - done.length} to mark` : `${right}/${done.length} right`;
                const tone = !done.length ? 'grey' : scoreTone(right, done.length);
                return (
                  <div key={i} className="line-row" style={{ cursor: 'default' }}>
                    <span className="ct-two"><span className="line-row-name" dir="auto">{i + 1}. {q.text}</span><span className="line-row-sub">{TYPE_LABELS[q.type]}{q.type !== 'long' && q.type !== 'choose' ? ` · ${rightText(q)}` : ''}</span></span>
                    <span className={`qz-score ${tone}`}>{label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="modal-footer">
          {h.canEdit && !confirm && <button className="btn" style={{ marginRight: 'auto', color: 'var(--red-text)' }} onClick={() => setConfirm(true)}><Trash2 size={13} />Remove</button>}
          {confirm && <><span style={{ marginRight: 'auto', fontSize: 13 }}>Remove this quiz and its results?</span>
            <button className="btn" onClick={() => setConfirm(false)}>Keep</button>
            <button className="btn btn-danger" disabled={busy} onClick={remove}>Remove</button></>}
          {!confirm && h.canEdit && <button className="btn" onClick={onEdit}><Pencil size={13} />Change</button>}
          {!confirm && !inline && <button className="btn" onClick={close}>Close</button>}
        </div>
    </SheetFrame>
  );
}

function niceDueShort(d) {
  if (!d) return '';
  return `Due ${new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`;
}

// ——— The pupil ———

// Taking a quiz: one question at a time, a bar along the top, Back / Next, then Hand in. Afterwards their score (if the
// teacher shows it straight away) and, if allowed, the right answers.
export function QuizTaker({ homework: h, onClose, onDone }) {
  const close = useBackToClose(true, onClose);
  const qs = h.quiz.questions;
  const [at, setAt] = useState(0);
  const [answers, setAnswers] = useState({}); // by question number n
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [check, setCheck] = useState(false);
  const [after, setAfter] = useState(null); // the homework once handed in
  const q = qs[at];
  const a = answers[q?.n];
  const set = v => setAnswers(x => ({ ...x, [q.n]: v }));
  const isBlank = (qq, v) => (qq.type === 'choose' && (!Array.isArray(v) || qq.rows.some((_, k) => v[k] !== 0 && v[k] !== 1))) || v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'string' && !v.trim());
  const blanks = qs.filter(qq => isBlank(qq, answers[qq.n])).length;
  async function handIn() {
    setBusy(true); setError('');
    const list = []; qs.forEach(qq => { list[qq.n] = answers[qq.n] ?? null; });
    try { const r = await submitQuiz(h.id, list); setAfter(r.homework || {}); await onDone(); } catch (e) { setError(e.message || 'Could not hand it in'); }
    setBusy(false); setCheck(false);
  }
  if (after) {
    return (
      <div className="modal-overlay">
        <div className="modal" style={{ maxWidth: 520 }}>
          <div className="modal-header"><div className="modal-title">Handed in</div><button className="btn btn-icon" onClick={close}><X size={16} /></button></div>
          <div className="modal-body" style={{ display: 'grid', gap: 12 }}>
            <QuizScore hw={after} />
            {after.review && <QuizReview hw={after} />}
          </div>
          <div className="modal-footer"><button className="btn btn-primary" onClick={close}>Done</button></div>
        </div>
      </div>
    );
  }
  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <div className="modal-title">{quizName(h)}</div>
          <button className="btn btn-icon" onClick={close}><X size={16} /></button>
        </div>
        <div className="modal-body" style={{ display: 'grid', gap: 14 }}>
          <div className="qz-progress"><span style={{ width: `${((at + 1) / qs.length) * 100}%` }} /></div>
          <div className="qz-card-top"><span>Question {at + 1} of {qs.length}</span><span>{pts(worthOf(q))}</span></div>
          <div className="qz-take-q" dir="auto">{q.text}</div>
          {(q.type === 'one' || q.type === 'many') && (
            <div style={{ display: 'grid', gap: 8 }}>
              {q.type === 'many' && <div className="text-muted" style={{ fontSize: 12.5 }}>Tick every right answer — a point for each one, but a wrong tick takes one away.</div>}
              {q.options.map((o, i) => {
                const on = q.type === 'one' ? a === i : (a || []).includes(i);
                return (
                  <button key={i} type="button" className={`qz-choice ${on ? 'on' : ''}`} dir="auto"
                    onClick={() => (q.type === 'one' ? set(i) : set(on ? a.filter(x => x !== i) : [...(a || []), i]))}>
                    <span className={`qz-mark ${q.type === 'many' ? 'sq' : ''}`}>{on && <Check size={13} />}</span><span>{o}</span>
                  </button>
                );
              })}
            </div>
          )}
          {q.type === 'truefalse' && (
            <div className="choice-boxes" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
              {[true, false].map(v => <button key={String(v)} type="button" className={a === v ? 'on' : ''} onClick={() => set(v)}>{v ? 'True' : 'False'}</button>)}
            </div>
          )}
          {q.type === 'choose' && (
            <div className="qz-list">
              {q.rows.map((row, j) => {
                const cur = Array.isArray(a) ? a[j] : null;
                return (
                  <div key={j} className="qz-list-row take">
                    <span dir="auto">{row}</span>
                    <div className="qz-xy">
                      {[0, 1].map(c => <button key={c} type="button" className={cur === c ? 'on' : ''} dir="auto"
                        onClick={() => set(q.rows.map((_, k) => (k === j ? c : Array.isArray(a) ? a[k] ?? null : null)))}>{q.columns[c]}</button>)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {/* Inside a form-group so they get the app's own field look (on their own they showed as bare browser boxes). */}
          {q.type === 'short' && <div className="form-group"><input id={`qz-a-${q.n}`} className="qz-answer" dir="auto" value={a || ''} maxLength={300} onChange={e => set(e.target.value)} placeholder="Your answer" /></div>}
          {q.type === 'long' && <div className="form-group"><textarea id={`qz-a-${q.n}`} className="qz-answer" dir="auto" rows={6} value={a || ''} maxLength={4000} onChange={e => set(e.target.value)} placeholder="Write your answer" /></div>}
          {check && (
            <div className="qz-check">{blanks ? `You haven't answered ${blanks} question${blanks === 1 ? '' : 's'}. Hand it in anyway?` : 'Ready to hand it in?'}
              {h.quiz.settings.tries !== 'many' && ' You only have one go.'}</div>
          )}
          {error && <div style={{ color: 'var(--red-text)', fontSize: 13 }}>{error}</div>}
        </div>
        <div className="modal-footer">
          {check ? <>
            <button className="btn" onClick={() => setCheck(false)}>Not yet</button>
            <button className="btn btn-primary" disabled={busy} onClick={handIn}><Send size={13} />Hand it in</button>
          </> : <>
            <button className="btn" style={{ marginRight: 'auto' }} disabled={!at} onClick={() => setAt(at - 1)}><ChevronLeft size={14} />Back</button>
            {at < qs.length - 1
              ? <button className="btn btn-primary" onClick={() => setAt(at + 1)}>Next<ChevronRight size={14} /></button>
              : <button className="btn btn-primary" onClick={() => setCheck(true)}><Send size={13} />Hand in</button>}
          </>}
        </div>
      </div>
    </div>
  );
}

// The pupil's score (when they may see it).
export function QuizScore({ hw }) {
  if (!hw.score) return <div className="text-muted" style={{ fontSize: 14 }}>Your teacher will send your score.</div>;
  const { score, max, waiting } = hw.score;
  return (
    <div className={`qz-big ${waiting ? 'amber' : scoreTone(score, max)}`}>
      <b>{score} / {max}</b><span>{waiting ? `so far — your teacher still has ${waiting} answer${waiting === 1 ? '' : 's'} to mark` : `${pct(score, max)}%`}</span>
    </div>
  );
}

// The pupil's last go with the right answers (only when the teacher allows it — the server sends `review` then).
export function QuizReview({ hw }) {
  const { answers, results, right } = hw.review;
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {hw.quiz.questions.map((q, num) => {
        const n = q.n, r = results[n] || {};
        const tone = r.got === null || r.got === undefined ? 'amber' : r.got >= r.of ? 'green' : r.got > 0 ? 'amber' : 'red';
        return (
          <div key={n} className="qz-ans">
            <div className="qz-card-top"><span>{num + 1} · {TYPE_LABELS[q.type]}</span><span className={`qz-got ${tone}`}>{r.got === null || r.got === undefined ? 'To mark' : `${r.got} / ${r.of}`}</span></div>
            <div className="qz-q" dir="auto">{q.text}</div>
            <AnswerView q={q} given={answers[n]} answer={q.type === 'short' ? [right[n]] : right[n]} result={r} />
          </div>
        );
      })}
    </div>
  );
}
