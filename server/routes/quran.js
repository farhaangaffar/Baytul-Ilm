const { query } = require('../db');
const { requireAuth, accessScope } = require('../auth');

// Qur'an progress (hifz, nazira, qaida), recorded by the teacher each day on the Daily
// records page. One entry per student per day per kind:
//   hifz:   sabaq (new lesson), sabqi (recent revision), manzil (older revision)
//   nazira: reading      qaida: lesson
// Positions are surah + ayah (Hafs numbering); a qaida lesson is free text (lesson or
// page). Each entry gets a grade — good / weak / repeat — and an optional note.
// quran_students.prior_juz holds the juz a student had already memorised before
// records started here, so their progress bar starts in the right place.
// Teachers reach their own classes' students only; everything is limited to the
// signed-in person's madrasah (see accessScope).

let ready = false;
async function ensureTables() {
  if (ready) return;
  await query(`
    CREATE TABLE IF NOT EXISTS quran_progress (
      id           BIGSERIAL PRIMARY KEY,
      madrasah_id  INTEGER NOT NULL REFERENCES madaaris(id),
      student_id   TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      date         DATE NOT NULL,
      kind         TEXT NOT NULL CHECK (kind IN ('sabaq','sabqi','manzil','reading','lesson')),
      from_surah   INTEGER, from_ayah INTEGER, to_surah INTEGER, to_ayah INTEGER,
      lesson       TEXT NOT NULL DEFAULT '',
      grade        TEXT CHECK (grade IN ('good','weak','repeat')),
      note         TEXT NOT NULL DEFAULT '',
      updated_at   TIMESTAMP NOT NULL DEFAULT now(),
      UNIQUE (student_id, date, kind)
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS idx_quran_progress_madrasah ON quran_progress (madrasah_id)');
  // How the teacher recorded it: by surah/ayah, or in juz quarters (the positions
  // still hold the quarters' first and last ayahs, so progress maths is the same).
  await query(`ALTER TABLE quran_progress ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT 'ayah'`);
  await query(`
    CREATE TABLE IF NOT EXISTS quran_students (
      student_id   TEXT PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
      madrasah_id  INTEGER NOT NULL REFERENCES madaaris(id),
      prior_juz    INTEGER[] NOT NULL DEFAULT '{}'
    )
  `);
  ready = true;
}

const KINDS = ['sabaq', 'sabqi', 'manzil', 'reading', 'lesson'];
const GRADES = ['good', 'weak', 'repeat'];
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const int = v => (Number.isInteger(Number(v)) ? Number(v) : NaN);
// Loose range check — the browser picks from the real surah list; this just keeps junk out.
const validPos = (s, a) => s >= 1 && s <= 114 && a >= 1 && a <= 286;

function toClient(r) {
  return {
    studentId: r.student_id, date: r.date, kind: r.kind,
    fromSurah: r.from_surah, fromAyah: r.from_ayah, toSurah: r.to_surah, toAyah: r.to_ayah,
    lesson: r.lesson, grade: r.grade, note: r.note, unit: r.unit || 'ayah',
  };
}

module.exports = requireAuth(async (req, res) => {
  await ensureTables();
  const mid = req.user.madrasahId;
  const scope = await accessScope(req);
  const forbidden = () => res.status(403).json({ error: "You don't have access to this." });

  if (req.method === 'GET') {
    // ?studentId= → that student's entries and prior juz. Without it → every entry the
    // signed-in person may see (for the class list and reports), keyed by student.
    const { studentId } = req.query;
    if (studentId) {
      if (!scope.studentIds.has(studentId)) { forbidden(); return; }
      const [{ rows }, { rows: prior }] = await Promise.all([
        query('SELECT * FROM quran_progress WHERE student_id = $1 AND madrasah_id = $2 ORDER BY date, kind', [studentId, mid]),
        query('SELECT prior_juz FROM quran_students WHERE student_id = $1 AND madrasah_id = $2', [studentId, mid]),
      ]);
      res.status(200).json({ entries: rows.map(toClient), priorJuz: prior[0]?.prior_juz || [] });
      return;
    }
    const [{ rows }, { rows: prior }] = await Promise.all([
      query('SELECT * FROM quran_progress WHERE madrasah_id = $1 ORDER BY date, kind', [mid]),
      query('SELECT student_id, prior_juz FROM quran_students WHERE madrasah_id = $1', [mid]),
    ]);
    const out = {};
    const slot = sid => (out[sid] = out[sid] || { entries: [], priorJuz: [] });
    rows.forEach(r => { if (scope.studentIds.has(r.student_id)) slot(r.student_id).entries.push(toClient(r)); });
    prior.forEach(p => { if (scope.studentIds.has(p.student_id)) slot(p.student_id).priorJuz = p.prior_juz; });
    res.status(200).json(out);
    return;
  }

  const b = req.body || {};
  if (!b.studentId) { res.status(400).json({ error: 'studentId is required' }); return; }
  if (!scope.studentIds.has(b.studentId)) { forbidden(); return; }

  if (req.method === 'PUT' && req.query.action === 'prior') {
    const juz = Array.isArray(b.priorJuz) ? [...new Set(b.priorJuz.map(int))].filter(j => j >= 1 && j <= 30).sort((x, y) => x - y) : null;
    if (!juz) { res.status(400).json({ error: 'priorJuz[] is required' }); return; }
    await query(
      `INSERT INTO quran_students (student_id, madrasah_id, prior_juz) VALUES ($1, $2, $3)
       ON CONFLICT (student_id) DO UPDATE SET prior_juz = EXCLUDED.prior_juz`,
      [b.studentId, mid, juz]
    );
    res.status(200).json({ ok: true, priorJuz: juz });
    return;
  }

  if (!ISO.test(String(b.date || '')) || !KINDS.includes(b.kind)) { res.status(400).json({ error: 'date and kind are required' }); return; }

  if (req.method === 'PUT') {
    if (b.grade != null && !GRADES.includes(b.grade)) { res.status(400).json({ error: 'Unknown grade' }); return; }
    let pos = [null, null, null, null];
    if (b.kind !== 'lesson') {
      pos = [int(b.fromSurah), int(b.fromAyah), int(b.toSurah), int(b.toAyah)];
      if (!validPos(pos[0], pos[1]) || !validPos(pos[2], pos[3])) { res.status(400).json({ error: 'Choose a surah and ayah for from and to.' }); return; }
    }
    const unit = b.unit === 'quarter' && b.kind !== 'lesson' ? 'quarter' : 'ayah';
    await query(
      `INSERT INTO quran_progress (madrasah_id, student_id, date, kind, from_surah, from_ayah, to_surah, to_ayah, lesson, grade, note, unit, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now())
       ON CONFLICT (student_id, date, kind) DO UPDATE SET
         from_surah = EXCLUDED.from_surah, from_ayah = EXCLUDED.from_ayah, to_surah = EXCLUDED.to_surah, to_ayah = EXCLUDED.to_ayah,
         lesson = EXCLUDED.lesson, grade = EXCLUDED.grade, note = EXCLUDED.note, unit = EXCLUDED.unit, updated_at = now()`,
      [mid, b.studentId, b.date, b.kind, ...pos, String(b.lesson || '').slice(0, 200), b.grade || null, String(b.note || '').slice(0, 1000), unit]
    );
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'DELETE') {
    await query('DELETE FROM quran_progress WHERE student_id = $1 AND date = $2 AND kind = $3 AND madrasah_id = $4', [b.studentId, b.date, b.kind, mid]);
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}, { teacher: true });
