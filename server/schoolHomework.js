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
  ready = true;
}

// A pupil's homework (their current class's, for everyone or for them), newest first — with the item's links when asked
// (the pupil), without (the parent portal).
async function homeworkFor(mid, student, { links = false } = {}) {
  await ensureHomework();
  const { rows } = await query(
    `SELECT h.id::text AS id, h.item_id::text AS "itemId", i.name AS "itemName", i.kind AS "itemKind", h.text, h.due, h.set_by AS "setBy",
       h.set_at AS "setAt", d.done_at AS "doneAt"
     FROM is_homework h JOIN classes c ON c.id = h.class_id AND c.madrasah_id = h.madrasah_id
     LEFT JOIN is_items i ON i.id = h.item_id AND i.madrasah_id = h.madrasah_id
     LEFT JOIN is_homework_done d ON d.homework_id = h.id AND d.student_id = $2
     WHERE h.madrasah_id = $1 AND c.name = $3
       AND (h.all_pupils OR EXISTS (SELECT 1 FROM is_homework_pupils p WHERE p.homework_id = h.id AND p.student_id = $2))
     ORDER BY h.set_at DESC, h.id DESC LIMIT 60`, [mid, student.id, student.class]);
  if (links && rows.length) {
    const ids = [...new Set(rows.map(r => r.itemId).filter(Boolean))];
    const { rows: ls } = ids.length
      ? await query('SELECT item_id::text AS "itemId", name, url FROM is_links WHERE madrasah_id = $1 AND item_id = ANY($2::bigint[]) ORDER BY added_at, id', [mid, ids])
      : { rows: [] };
    rows.forEach(r => { r.links = ls.filter(l => l.itemId === r.itemId).map(({ name, url }) => ({ name, url })); });
  }
  return rows;
}

module.exports = { ensureHomework, homeworkFor };
