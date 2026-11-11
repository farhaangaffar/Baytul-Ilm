const { query } = require('./db');

// A school's homework (Islamic Studies, stage 4): text only — what to do — set by a teacher (or the head) for a class or
// chosen pupils, usually on a surah, du'aa or practical, whose lesson links (is_links) come with it for the pupil. Pupils
// tick "I've done it"; parents see the homework (never the links). Made on first use; db/migrate-044-school-homework.sql.
let ready = false;
async function ensureHomework() {
  if (ready) return;
  await query(`CREATE TABLE IF NOT EXISTS is_homework (
    id          BIGSERIAL PRIMARY KEY,
    madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
    class_id    TEXT NOT NULL,
    item_id     BIGINT,                      -- the surah, du'aa or practical it's on (NULL: something else)
    text        TEXT NOT NULL,               -- what to do, in the teacher's words
    due         DATE,
    all_pupils  BOOLEAN NOT NULL DEFAULT true, -- false: only the pupils in is_homework_pupils
    set_by      TEXT NOT NULL DEFAULT '',
    set_by_user TEXT NOT NULL DEFAULT '',
    set_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await query('CREATE INDEX IF NOT EXISTS idx_is_homework_class ON is_homework (madrasah_id, class_id)');
  await query(`CREATE TABLE IF NOT EXISTS is_homework_pupils (
    homework_id BIGINT NOT NULL REFERENCES is_homework(id) ON DELETE CASCADE,
    student_id  TEXT NOT NULL,
    madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
    PRIMARY KEY (homework_id, student_id)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS is_homework_done (
    homework_id BIGINT NOT NULL REFERENCES is_homework(id) ON DELETE CASCADE,
    student_id  TEXT NOT NULL,
    madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
    done_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (homework_id, student_id)
  )`);
  // Quizzes (stage 4b, server/schoolQuiz.js): a quiz is homework with kind 'quiz', its questions and settings in `quiz`;
  // a draft isn't shown to pupils or parents yet; scores_sent_at = the teacher sent the scores (when not shown straight away).
  await query("ALTER TABLE is_homework ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'task'");
  await query('ALTER TABLE is_homework ADD COLUMN IF NOT EXISTS quiz JSONB');
  await query('ALTER TABLE is_homework ADD COLUMN IF NOT EXISTS draft BOOLEAN NOT NULL DEFAULT false');
  await query('ALTER TABLE is_homework ADD COLUMN IF NOT EXISTS scores_sent_at TIMESTAMPTZ');
  // Each time a pupil hands a quiz in: their answers, each question's mark (results: [{got, of, auto}] — got null while a
  // long answer waits for the teacher) and the total.
  await query(`CREATE TABLE IF NOT EXISTS is_quiz_attempts (
    id           BIGSERIAL PRIMARY KEY,
    homework_id  BIGINT NOT NULL REFERENCES is_homework(id) ON DELETE CASCADE,
    student_id   TEXT NOT NULL,
    madrasah_id  INTEGER NOT NULL REFERENCES madaaris(id),
    answers      JSONB NOT NULL,
    results      JSONB NOT NULL,
    score        NUMERIC NOT NULL DEFAULT 0,
    max          NUMERIC NOT NULL DEFAULT 0,
    waiting      INTEGER NOT NULL DEFAULT 0,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await query('CREATE INDEX IF NOT EXISTS idx_is_quiz_attempts_hw ON is_quiz_attempts (homework_id, student_id)');
  ready = true;
}

// Whether a quiz's scores can be seen by its pupils (and their parents) yet.
const released = h => !!h.quiz && (h.quiz.settings?.scoreNow || !!h.scoresSentAt);

// A pupil's homework (their current class's, for everyone or for them), newest first — with the item's links when asked
// (the pupil), without (the parent portal).
// A quiz comes with the pupil's own attempts — the questions only for the pupil (without the right answers), the score only
// once released, the right answers only if the teacher lets them see them.
async function homeworkFor(mid, student, { links = false } = {}) {
  await ensureHomework();
  const { rows } = await query(
    `SELECT h.id::text AS id, h.item_id::text AS "itemId", i.name AS "itemName", i.kind AS "itemKind", h.text, h.due, h.set_by AS "setBy",
       h.set_at AS "setAt", d.done_at AS "doneAt", h.kind, h.quiz, h.scores_sent_at AS "scoresSentAt"
     FROM is_homework h JOIN classes c ON c.id = h.class_id AND c.madrasah_id = h.madrasah_id
     LEFT JOIN is_items i ON i.id = h.item_id AND i.madrasah_id = h.madrasah_id
     LEFT JOIN is_homework_done d ON d.homework_id = h.id AND d.student_id = $2
     WHERE h.madrasah_id = $1 AND c.name = $3 AND NOT h.draft
       AND (h.all_pupils OR EXISTS (SELECT 1 FROM is_homework_pupils p WHERE p.homework_id = h.id AND p.student_id = $2))
     ORDER BY h.set_at DESC, h.id DESC LIMIT 60`, [mid, student.id, student.class]);
  const quizIds = rows.filter(r => r.kind === 'quiz' && r.quiz).map(r => r.id);
  const { rows: tries } = quizIds.length
    ? await query(`SELECT homework_id::text AS hid, answers, results, score::float AS score, max::float AS max, waiting, submitted_at AS "submittedAt"
        FROM is_quiz_attempts WHERE madrasah_id = $1 AND student_id = $2 AND homework_id = ANY($3::bigint[]) ORDER BY id`, [mid, student.id, quizIds])
    : { rows: [] };
  const { forPupil, rightAnswers } = require('./schoolQuiz');
  rows.forEach(r => {
    const quiz = r.quiz; delete r.quiz;
    if (r.kind !== 'quiz' || !quiz) return;
    const show = released({ quiz, scoresSentAt: r.scoresSentAt });
    const mine = tries.filter(t => t.hid === r.id);
    const best = mine.reduce((b, t) => (!b || t.score > b.score ? t : b), null);
    r.tries = mine.length;
    r.title = quiz.title || '';
    r.score = show && best ? { score: best.score, max: best.max, waiting: best.waiting } : null;
    if (links) { // the pupil
      r.quiz = forPupil(quiz, `${student.id}:${r.id}`);
      const last = mine[mine.length - 1];
      if (last && show && quiz.settings.showAnswers) r.review = { answers: last.answers, results: last.results, right: rightAnswers(quiz) };
    }
  });
  if (links && rows.length) {
    const ids = [...new Set(rows.map(r => r.itemId).filter(Boolean))];
    const { rows: ls } = ids.length
      ? await query('SELECT item_id::text AS "itemId", name, url FROM is_links WHERE madrasah_id = $1 AND item_id = ANY($2::bigint[]) ORDER BY added_at, id', [mid, ids])
      : { rows: [] };
    rows.forEach(r => { r.links = ls.filter(l => l.itemId === r.itemId).map(({ name, url }) => ({ name, url })); });
  }
  return rows;
}

module.exports = { ensureHomework, homeworkFor, released };
