// A school's Islamic Studies reports (madaaris.kind 'school', src/pages/SchoolReports.js). The head takes an
// assessment point ("Autumn", "Spring", "Summer" — or "End of year" when the school reports once a year, Settings):
// it saves where every pupil is on their surahs, du'aas and practicals (is_progress) at that moment. Teachers rate each
// pupil's effort (Excellent / Good / Needs to improve); the report itself is just the stats (worked out in the browser,
// src/lib/studiesReport.js). "Send to parents" puts it in the parent portal with its PDF.
//
// GET                       → { period, year, assessments: [{ id, year, name, takenAt, publishedAt, pupils, rated }] }
// GET ?id=&class=           → { assessment, yearGroup, items, pupils: [{ id, name, marks, effort }], previous: { id: marks } | null }
// POST ?action=setting      { period: 'term' | 'year' } (head)
// POST ?action=take         { name } (head) — a new point for this academic year
// POST ?action=retake       { id } (head, not yet sent) — saves everyone's marks again (effort kept)
// POST ?action=effort       { id, studentId, effort } — the pupil's teacher or the head
// POST ?action=publish      { id, published } (head)
// DELETE ?id=               (head)
const { query, transaction } = require('../db');
const { requireAuth, isOwner, accessScope, whoName } = require('../auth');

const EFFORTS = ['Excellent', 'Good', 'Needs to improve'];

// The academic year a date is in ('26-27'), from 1 September (UK time).
function yearOf(d = new Date()) {
  const uk = new Date(d.toLocaleString('en-US', { timeZone: 'Europe/London' }));
  const y = uk.getFullYear(), start = uk.getMonth() >= 8 ? y : y - 1;
  return `${String(start).slice(2)}-${String(start + 1).slice(2)}`;
}
const ukToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());

let ready = false;
async function ensure() {
  if (ready) return;
  await require('./studies').ensure();
  await query("ALTER TABLE settings ADD COLUMN IF NOT EXISTS studies_reports TEXT NOT NULL DEFAULT 'term'");
  await query(`CREATE TABLE IF NOT EXISTS is_assessments (
    id           BIGSERIAL PRIMARY KEY,
    madrasah_id  INTEGER NOT NULL REFERENCES madaaris(id),
    year         TEXT NOT NULL,                -- the academic year, '26-27'
    name         TEXT NOT NULL,                -- 'Autumn', 'Spring', 'Summer', 'End of year' …
    taken_at     DATE NOT NULL,
    taken_by     TEXT NOT NULL DEFAULT '',
    published_at TIMESTAMPTZ                   -- sent to parents
  )`);
  await query('CREATE INDEX IF NOT EXISTS idx_is_assessments_madrasah ON is_assessments (madrasah_id, year)');
  await query(`CREATE TABLE IF NOT EXISTS is_assessment_pupils (
    assessment_id BIGINT NOT NULL,
    madrasah_id   INTEGER NOT NULL REFERENCES madaaris(id),
    student_id    TEXT NOT NULL,
    class         TEXT NOT NULL DEFAULT '',
    year_group    INTEGER,
    marks         JSONB NOT NULL DEFAULT '{}',  -- { itemId: 1|2|3 } at that moment
    effort        TEXT NOT NULL DEFAULT '',
    effort_by     TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (assessment_id, student_id)
  )`);
  await query('CREATE INDEX IF NOT EXISTS idx_is_assessment_pupils_madrasah ON is_assessment_pupils (madrasah_id)');
  ready = true;
}

async function isSchool(mid) {
  const { rows: [m] } = await query('SELECT kind FROM madaaris WHERE id = $1', [mid]);
  return m?.kind === 'school';
}

const A_COLS = `id::text, year, name, to_char(taken_at, 'YYYY-MM-DD') AS "takenAt", published_at AS "publishedAt"`;

// Every Active pupil in a class, with their marks now — saved into a point (c = a transaction client).
async function snapshot(c, mid, assessmentId) {
  await c.query(
    `INSERT INTO is_assessment_pupils (assessment_id, madrasah_id, student_id, class, year_group, marks)
     SELECT $1, s.madrasah_id, s.id, s.class, k.year_group,
            COALESCE((SELECT jsonb_object_agg(p.item_id::text, p.level) FROM is_progress p
                      WHERE p.madrasah_id = s.madrasah_id AND p.student_id = s.id), '{}'::jsonb)
     FROM students s JOIN classes k ON k.madrasah_id = s.madrasah_id AND k.name = s.class
     WHERE s.madrasah_id = $2 AND s.status = 'Active'
     ON CONFLICT (assessment_id, student_id) DO UPDATE
       SET class = EXCLUDED.class, year_group = EXCLUDED.year_group, marks = EXCLUDED.marks`, [assessmentId, mid]);
}

// The point before this one (same school, taken earlier), for "progress since last time".
async function previousOf(mid, a) {
  const { rows: [p] } = await query(
    `SELECT id::text FROM is_assessments WHERE madrasah_id = $1 AND (taken_at, id) < ($2::date, $3::bigint)
     ORDER BY taken_at DESC, id DESC LIMIT 1`, [mid, a.takenAt, a.id]);
  return p?.id || null;
}

const handler = requireAuth(async (req, res) => {
  const mid = req.user.madrasahId;
  if (!(await isSchool(mid))) { res.status(403).json({ error: 'This is only for a school.' }); return; }
  await ensure();
  const action = req.query.action;
  const head = isOwner(req);

  if (req.method === 'GET' && !req.query.id) {
    const scope = await accessScope(req);
    const { rows: [s] } = await query('SELECT studies_reports FROM settings WHERE madrasah_id = $1', [mid]);
    const { rows: assessments } = await query(
      `SELECT ${A_COLS},
         (SELECT count(*)::int FROM is_assessment_pupils p WHERE p.assessment_id = a.id AND p.madrasah_id = a.madrasah_id
            AND ($2::text[] IS NULL OR p.class = ANY($2))) AS pupils,
         (SELECT count(*)::int FROM is_assessment_pupils p WHERE p.assessment_id = a.id AND p.madrasah_id = a.madrasah_id
            AND p.effort <> '' AND ($2::text[] IS NULL OR p.class = ANY($2))) AS rated
       FROM is_assessments a WHERE a.madrasah_id = $1 ORDER BY a.taken_at DESC, a.id DESC`, [mid, scope.classNames || null]);
    res.status(200).json({ period: s?.studies_reports || 'term', year: yearOf(), assessments });
    return;
  }

  if (req.method === 'GET') {
    const id = String(req.query.id).replace(/\D/g, '') || '0';
    const cls = String(req.query.class || '');
    const scope = await accessScope(req);
    if (scope.classNames && !scope.classNames.includes(cls)) { res.status(403).json({ error: "You don't have access to this class." }); return; }
    const { rows: [a] } = await query(`SELECT ${A_COLS} FROM is_assessments WHERE id = $1 AND madrasah_id = $2`, [id, mid]);
    if (!a) { res.status(404).json({ error: 'Not found' }); return; }
    const { rows: pupils } = await query(
      `SELECT p.student_id AS id, s.forename || ' ' || s.surname AS name, p.year_group AS "yearGroup", p.marks, p.effort
       FROM is_assessment_pupils p JOIN students s ON s.id = p.student_id AND s.madrasah_id = p.madrasah_id
       WHERE p.assessment_id = $1 AND p.madrasah_id = $2 AND p.class = $3 ORDER BY s.forename, s.surname`, [id, mid, cls]);
    const prevId = await previousOf(mid, a);
    let previous = null;
    if (prevId && pupils.length) {
      const { rows } = await query(
        'SELECT student_id, marks FROM is_assessment_pupils WHERE assessment_id = $1 AND madrasah_id = $2 AND student_id = ANY($3)',
        [prevId, mid, pupils.map(p => p.id)]);
      previous = Object.fromEntries(rows.map(r => [r.student_id, r.marks]));
    }
    const yearGroup = pupils[0]?.yearGroup ?? null;
    const { rows: items } = await query(
      `SELECT id::text, kind, name, detail, year_group AS "yearGroup", surah FROM is_items WHERE madrasah_id = $1
       ORDER BY year_group, CASE WHEN kind <> 'surah' OR surah = 1 THEN 0 WHEN surah IS NOT NULL THEN 115 - surah ELSE 200 END, sort, id`, [mid]);
    res.status(200).json({ assessment: a, yearGroup, items, pupils, previous });
    return;
  }

  if (req.method === 'POST' && action === 'effort') {
    const b = req.body || {};
    const sid = String(b.studentId || '');
    const scope = await accessScope(req);
    if (!scope.studentIds.has(sid)) { res.status(403).json({ error: "You don't have access to this pupil." }); return; }
    const effort = EFFORTS.includes(b.effort) ? b.effort : '';
    const who = await whoName(req.user);
    const { rowCount } = await query(
      `UPDATE is_assessment_pupils SET effort = $1, effort_by = $2 WHERE assessment_id = $3 AND madrasah_id = $4 AND student_id = $5`,
      [effort, effort ? who : '', String(b.id || '0').replace(/\D/g, '') || '0', mid, sid]);
    if (!rowCount) { res.status(404).json({ error: 'Not found' }); return; }
    res.status(200).json({ ok: true });
    return;
  }

  if (!head) { res.status(403).json({ error: 'Only the head can do this.' }); return; }

  if (req.method === 'POST' && action === 'setting') {
    const period = (req.body || {}).period === 'year' ? 'year' : 'term';
    await query('UPDATE settings SET studies_reports = $1 WHERE madrasah_id = $2', [period, mid]);
    res.status(200).json({ ok: true, period });
    return;
  }

  if (req.method === 'POST' && action === 'take') {
    const name = String((req.body || {}).name || '').trim().slice(0, 40);
    if (!name) { res.status(400).json({ error: 'Give it a name, e.g. Autumn.' }); return; }
    const year = yearOf();
    const who = await whoName(req.user);
    const result = await transaction(async c => {
      const { rows: [dup] } = await c.query('SELECT 1 FROM is_assessments WHERE madrasah_id = $1 AND year = $2 AND lower(name) = lower($3)', [mid, year, name]);
      if (dup) return { error: `There's already a ${name} for this year.` };
      const { rows: [a] } = await c.query(
        'INSERT INTO is_assessments (madrasah_id, year, name, taken_at, taken_by) VALUES ($1, $2, $3, $4, $5) RETURNING id::text',
        [mid, year, name, ukToday(), who]);
      await snapshot(c, mid, a.id);
      return { id: a.id };
    });
    if (result.error) { res.status(400).json({ error: result.error }); return; }
    res.status(200).json({ ok: true, ...result });
    return;
  }

  const id = String((req.body || {}).id || req.query.id || '0').replace(/\D/g, '') || '0';
  const { rows: [a] } = await query('SELECT id, published_at FROM is_assessments WHERE id = $1 AND madrasah_id = $2', [id, mid]);
  if (!a) { res.status(404).json({ error: 'Not found' }); return; }

  if (req.method === 'POST' && action === 'retake') {
    if (a.published_at) { res.status(400).json({ error: 'This has been sent to parents — take it back first.' }); return; }
    await transaction(async c => {
      await c.query('UPDATE is_assessments SET taken_at = $1 WHERE id = $2 AND madrasah_id = $3', [ukToday(), id, mid]);
      // Pupils who have left or moved out of every class since drop out; everyone else's marks are saved again.
      await c.query(
        `DELETE FROM is_assessment_pupils p WHERE p.assessment_id = $1 AND p.madrasah_id = $2
           AND NOT EXISTS (SELECT 1 FROM students s JOIN classes k ON k.madrasah_id = s.madrasah_id AND k.name = s.class
                           WHERE s.id = p.student_id AND s.madrasah_id = p.madrasah_id AND s.status = 'Active')`, [id, mid]);
      await snapshot(c, mid, id);
    });
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'POST' && action === 'publish') {
    const on = (req.body || {}).published !== false;
    await query(`UPDATE is_assessments SET published_at = ${on ? 'now()' : 'NULL'} WHERE id = $1 AND madrasah_id = $2`, [id, mid]);
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'DELETE') {
    await transaction(async c => {
      await c.query('DELETE FROM is_assessment_pupils WHERE assessment_id = $1 AND madrasah_id = $2', [id, mid]);
      await c.query('DELETE FROM is_assessments WHERE id = $1 AND madrasah_id = $2', [id, mid]);
    });
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}, { teacher: true });

// A pupil's reports that have been sent to parents (routes/parent.js, via studies.forParent), newest first.
async function forParent(mid, studentId) {
  await ensure();
  const { rows } = await query(
    `SELECT a.id::text, a.year, a.name, to_char(a.taken_at, 'YYYY-MM-DD') AS "takenAt", p.class, p.year_group AS "yearGroup",
       p.marks, p.effort,
       (SELECT q.marks FROM is_assessment_pupils q JOIN is_assessments b ON b.id = q.assessment_id AND b.madrasah_id = q.madrasah_id
          WHERE q.student_id = p.student_id AND q.madrasah_id = p.madrasah_id AND (b.taken_at, b.id) < (a.taken_at, a.id)
          ORDER BY b.taken_at DESC, b.id DESC LIMIT 1) AS previous
     FROM is_assessment_pupils p JOIN is_assessments a ON a.id = p.assessment_id AND a.madrasah_id = p.madrasah_id
     WHERE p.madrasah_id = $1 AND p.student_id = $2 AND a.published_at IS NOT NULL
     ORDER BY a.taken_at DESC, a.id DESC`, [mid, studentId]);
  return rows;
}

// Settings → Backup (studies.js backup/restore carries these along).
async function backup(mid) {
  await ensure();
  const { rows: [s] } = await query('SELECT studies_reports FROM settings WHERE madrasah_id = $1', [mid]);
  const { rows: assessments } = await query(`SELECT ${A_COLS}, taken_by AS "takenBy" FROM is_assessments WHERE madrasah_id = $1 ORDER BY id`, [mid]);
  const { rows: pupils } = await query(
    `SELECT assessment_id::text AS "assessmentId", student_id AS "studentId", class, year_group AS "yearGroup", marks, effort, effort_by AS "effortBy"
     FROM is_assessment_pupils WHERE madrasah_id = $1`, [mid]);
  return { period: s?.studies_reports || 'term', assessments, pupils };
}
// itemIds: old item id → new (restore gives items new numbers); students must already be back.
async function restore(c, mid, data, itemIds = {}) {
  if (!data) return;
  await ensure();
  await c.query('UPDATE settings SET studies_reports = $1 WHERE madrasah_id = $2', [data.period === 'year' ? 'year' : 'term', mid]);
  await c.query('DELETE FROM is_assessment_pupils WHERE madrasah_id = $1', [mid]);
  await c.query('DELETE FROM is_assessments WHERE madrasah_id = $1', [mid]);
  const ids = {};
  for (const a of data.assessments || []) {
    const { rows: [n] } = await c.query(
      'INSERT INTO is_assessments (madrasah_id, year, name, taken_at, taken_by, published_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id::text',
      [mid, String(a.year || yearOf()).slice(0, 10), String(a.name || 'Assessment').slice(0, 40), a.takenAt, a.takenBy || '', a.publishedAt || null]);
    ids[a.id] = n.id;
  }
  const { rows: studs } = await c.query('SELECT id FROM students WHERE madrasah_id = $1', [mid]);
  const known = new Set(studs.map(s => s.id));
  for (const p of data.pupils || []) {
    if (!ids[p.assessmentId] || !known.has(p.studentId)) continue;
    const marks = Object.fromEntries(Object.entries(p.marks || {}).map(([k, v]) => [itemIds[k] || k, v]).filter(([k]) => /^\d+$/.test(k)));
    await c.query(
      `INSERT INTO is_assessment_pupils (assessment_id, madrasah_id, student_id, class, year_group, marks, effort, effort_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING`,
      [ids[p.assessmentId], mid, p.studentId, p.class || '', p.yearGroup ?? null, JSON.stringify(marks), EFFORTS.includes(p.effort) ? p.effort : '', p.effortBy || '']);
  }
}

module.exports = handler;
module.exports.ensure = ensure;
module.exports.forParent = forParent;
module.exports.backup = backup;
module.exports.restore = restore;
module.exports.yearOf = yearOf;
module.exports.EFFORTS = EFFORTS;
