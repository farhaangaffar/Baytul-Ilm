// A school's quizzes (Islamic Studies, stage 4b): a quiz is a piece of homework (is_homework.kind = 'quiz') whose
// questions and settings live in is_homework.quiz (JSONB). Pupils hand in attempts (is_quiz_attempts); everything that
// can be marked is marked here, on the server — pupils are never sent the right answers until (and unless) the teacher
// lets them see them. Long answers wait for the teacher.
//
// A question: { type, text, points, options?, answer?, answers?, accepted? }
//   one        options [..], answer: index          (one answer)
//   many       options [..], answers: [indexes]     (tick boxes — points for each right tick, a wrong tick takes one away)
//   choose     columns: [x, y], rows: [..], answers: [column per row]  (a list, each row x or y — points for each row right)
//   truefalse  answer: true | false
//   short      accepted: ['One', 'The One']         (marked by matching, ignoring case, spaces and punctuation)
//   long       (the teacher marks it, 0 to points)
// Settings: { tries: 'one' | 'many', shuffle: bool, scoreNow: bool, showAnswers: bool }

const TYPES = ['one', 'many', 'truefalse', 'short', 'long', 'choose'];
const str = (v, n) => String(v ?? '').trim().slice(0, n);

// A teacher's quiz as sent → a clean one, or { error }.
function cleanQuiz(q) {
  const list = Array.isArray(q?.questions) ? q.questions.slice(0, 60) : [];
  const questions = [];
  for (const [i, raw] of list.entries()) {
    const n = i + 1;
    const type = TYPES.includes(raw?.type) ? raw.type : null;
    const text = str(raw?.text, 1000);
    if (!type) return { error: `Question ${n}: choose what kind of question it is.` };
    if (!text) return { error: `Question ${n}: write the question.` };
    const points = Math.max(1, Math.min(100, Math.round(Number(raw.points) || 1)));
    const out = { type, text, points };
    if (type === 'one' || type === 'many') {
      const options = (Array.isArray(raw.options) ? raw.options : []).map(o => str(o, 300)).filter(Boolean).slice(0, 10);
      if (options.length < 2) return { error: `Question ${n}: give at least two answers to choose from.` };
      out.options = options;
      if (type === 'one') {
        const a = Number(raw.answer);
        if (!Number.isInteger(a) || a < 0 || a >= options.length) return { error: `Question ${n}: tap the right answer.` };
        out.answer = a;
      } else {
        const a = [...new Set((Array.isArray(raw.answers) ? raw.answers : []).map(Number).filter(x => Number.isInteger(x) && x >= 0 && x < options.length))].sort((x, y) => x - y);
        if (!a.length) return { error: `Question ${n}: tick the right answers.` };
        out.answers = a;
      }
    } else if (type === 'choose') {
      const columns = (Array.isArray(raw.columns) ? raw.columns : []).map(c => str(c, 60)).slice(0, 2);
      if (columns.length < 2 || !columns[0] || !columns[1]) return { error: `Question ${n}: name the two choices (e.g. Sunnah and Fardh).` };
      const rows = [], answers = [];
      (Array.isArray(raw.rows) ? raw.rows : []).slice(0, 30).forEach((r, j) => {
        const t = str(r, 300);
        if (!t) return;
        const a = Number((raw.answers || [])[j]);
        rows.push(t); answers.push(a === 0 || a === 1 ? a : null);
      });
      if (rows.length < 1) return { error: `Question ${n}: add at least one line to the list.` };
      if (answers.some(a => a === null)) return { error: `Question ${n}: choose ${columns[0]} or ${columns[1]} for every line.` };
      Object.assign(out, { columns, rows, answers });
    } else if (type === 'truefalse') {
      if (typeof raw.answer !== 'boolean') return { error: `Question ${n}: choose True or False as the right answer.` };
      out.answer = raw.answer;
    } else if (type === 'short') {
      const accepted = (Array.isArray(raw.accepted) ? raw.accepted : []).map(a => str(a, 200)).filter(Boolean).slice(0, 20);
      if (!accepted.length) return { error: `Question ${n}: type at least one answer to accept.` };
      out.accepted = accepted;
    }
    questions.push(out);
  }
  if (!questions.length) return { error: 'Add at least one question.' };
  const s = q?.settings || {};
  return { title: str(q?.title, 120), questions, settings: { tries: s.tries === 'many' ? 'many' : 'one', shuffle: !!s.shuffle, scoreNow: s.scoreNow !== false, showAnswers: !!s.showAnswers } };
}

const plain = s => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9؀-ۿ]+/g, '');
// What a question is worth: tick boxes and two-choice lists give their points for each right answer.
const worth = q => (q.type === 'many' ? q.points * q.answers.length : q.type === 'choose' ? q.points * q.rows.length : q.points);
const maxOf = quiz => quiz.questions.reduce((t, q) => t + worth(q), 0);

// One question's mark: { got, of, auto } — got is null while a long answer waits for the teacher.
function markOne(q, given) {
  if (q.type === 'one') return { got: Number(given) === q.answer ? q.points : 0, of: q.points, auto: true };
  if (q.type === 'truefalse') return { got: given === q.answer ? q.points : 0, of: q.points, auto: true };
  if (q.type === 'many') { // each right tick earns its points; each wrong one takes a right one's away (never below 0)
    const g = [...new Set((Array.isArray(given) ? given : []).map(Number))];
    const right = g.filter(x => q.answers.includes(x)).length, wrong = g.length - right;
    return { got: Math.max(0, right - wrong) * q.points, of: worth(q), auto: true };
  }
  if (q.type === 'choose') {
    const g = Array.isArray(given) ? given : [];
    return { got: q.answers.filter((a, i) => Number(g[i]) === a && g[i] !== null).length * q.points, of: worth(q), auto: true };
  }
  if (q.type === 'short') return { got: q.accepted.some(a => plain(a) && plain(a) === plain(given)) ? q.points : 0, of: q.points, auto: true };
  return { got: null, of: q.points, auto: false }; // long: the teacher marks it
}

// A pupil's answers (by question number) → { answers, results: [{got, of, auto}], score, max, waiting }.
function markQuiz(quiz, given) {
  const answers = quiz.questions.map((q, i) => {
    const g = Array.isArray(given) ? given[i] : undefined;
    if (q.type === 'many') return Array.isArray(g) ? g.map(Number).filter(Number.isInteger).slice(0, 10) : [];
    if (q.type === 'choose') return q.rows.map((_, j) => (Array.isArray(g) && (g[j] === 0 || g[j] === 1) ? g[j] : null));
    if (q.type === 'truefalse') return typeof g === 'boolean' ? g : null;
    if (q.type === 'one') return Number.isInteger(Number(g)) && g !== null && g !== '' ? Number(g) : null;
    return str(g, q.type === 'long' ? 4000 : 300);
  });
  const results = quiz.questions.map((q, i) => markOne(q, answers[i]));
  return { answers, results, ...totals(results), max: maxOf(quiz) };
}
function totals(results) {
  return { score: results.reduce((t, r) => t + (r.got || 0), 0), waiting: results.filter(r => r.got === null).length };
}

// What a pupil is sent: the questions without their answers, in a shuffled order if the teacher chose that (the same
// order each time for that pupil — each question keeps its number `n`, so answers come back by number).
function forPupil(quiz, seed) {
  let qs = quiz.questions.map((q, n) => ({ n, type: q.type, text: q.text, points: q.points, worth: worth(q), ...(q.options ? { options: q.options } : {}),
    ...(q.type === 'choose' ? { columns: q.columns, rows: q.rows } : {}) }));
  if (quiz.settings.shuffle) {
    let h = 0; for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const rnd = () => { h = (h * 1103515245 + 12345) >>> 0; return h / 4294967296; };
    for (let i = qs.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [qs[i], qs[j]] = [qs[j], qs[i]]; }
  }
  return { title: quiz.title || '', questions: qs, settings: { tries: quiz.settings.tries, scoreNow: quiz.settings.scoreNow, showAnswers: quiz.settings.showAnswers }, max: maxOf(quiz) };
}

// The right answers, for a pupil once they're allowed to see them.
const rightAnswers = quiz => quiz.questions.map(q => (q.type === 'one' || q.type === 'truefalse' ? q.answer : q.type === 'many' || q.type === 'choose' ? q.answers : q.type === 'short' ? q.accepted[0] : null));

module.exports = { cleanQuiz, markQuiz, markOne, totals, forPupil, rightAnswers, maxOf, worth, TYPES };
