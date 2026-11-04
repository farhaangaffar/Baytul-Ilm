const { query, transaction } = require('../db');
const { requireAuth, isOwner, accessScope, whoName } = require('../auth');
const { STARTER } = require('../studiesStarter');

// A school's Islamic Studies trackers (madaaris.kind = 'school'; src/pages/Studies.js): its own lists of surahs,
// du'aas and practicals (is_items — each with the year group it's learnt in, Reception = 0 … Year 13), and where each
// pupil is with each one (is_progress: 1 = Working towards, 2 = Achieved; no row = Not yet). A class sees the items of
// its year group and the years before (classes.year_group). Head: everything, and edits the lists; teachers: their
// own classes. Parents see their child's in the portal (forParent, routes/parent.js).
//
// GET                         → { items }  (the first time, the starter lists are added)
// GET ?class=<name>           → { yearGroup, items, pupils, progress }
// GET ?studentId=             → { pupil, items, progress }
// GET ?action=summary         → [{ class, yearGroup, teacher, pupils, items, achieved, working }] (the Dashboard: each
//                               class's own year's items — achieved/working are pupil × item counts)
// POST ?action=mark           { itemId, studentIds, level: 0|1|2 }
// POST ?action=item           { id?, kind, name, detail, yearGroup }   (head)
// DELETE ?action=item&id=     (head) — with its marks
// POST ?action=starter        (head) — adds starter items not already there (matched by kind + name)
// GET ?action=backup / POST ?action=restore (head) — this school's lists and marks in Settings → Backup (classes'
//                               year groups come back with the classes themselves)

const KINDS = ['surah', 'duaa', 'practical'];
const str = (v, n = 200) => String(v ?? '').trim().slice(0, n);
const yearOf = v => (v === null || v === undefined || v === '' ? null : Math.max(0, Math.min(13, Math.round(Number(v)) || 0)));

let ready = false;
async function ensure() {
  if (ready) return;
  await query('ALTER TABLE classes ADD COLUMN IF NOT EXISTS year_group INTEGER'); // Reception = 0 … Year 13 (a school's classes)
  await query('ALTER TABLE settings ADD COLUMN IF NOT EXISTS studies_seeded BOOLEAN NOT NULL DEFAULT false');
  await query(`CREATE TABLE IF NOT EXISTS is_items (
    id          BIGSERIAL PRIMARY KEY,
    madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
    kind        TEXT NOT NULL,             -- 'surah' | 'duaa' | 'practical'
    name        TEXT NOT NULL,
    detail      TEXT NOT NULL DEFAULT '',
    year_group  INTEGER NOT NULL DEFAULT 0,
    sort        INTEGER NOT NULL DEFAULT 0
  )`);
  await query('CREATE INDEX IF NOT EXISTS idx_is_items_madrasah ON is_items (madrasah_id)');
  await query(`CREATE TABLE IF NOT EXISTS is_progress (
    madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
    student_id  TEXT NOT NULL,
    item_id     BIGINT NOT NULL,
    level       SMALLINT NOT NULL,          -- 1 Working towards, 2 Achieved
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by  TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (student_id, item_id)
  )`);
  await query('CREATE INDEX IF NOT EXISTS idx_is_progress_madrasah ON is_progress (madrasah_id, item_id)');
  ready = true;
}

const ITEM_COLS = `id::text AS id, kind, name, detail, year_group AS "yearGroup"`;
const PROGRESS_COLS = `student_id AS "studentId", item_id::text AS "itemId", level, updated_by AS "updatedBy", updated_at AS "updatedAt"`;

async function isSchool(mid) {
  const { rows: [m] } = await query('SELECT kind FROM madaaris WHERE id = $1', [mid]);
  return m?.kind === 'school';
}

// Adds the starter items a school hasn't got (matched by kind and name), in the starter's order.
async function addStarter(c, mid) {
  const { rows } = await c.query('SELECT kind, lower(name) AS name FROM is_items WHERE madrasah_id = $1', [mid]);
  const have = new Set(rows.map(r => `${r.kind}|${r.name}`));
  let added = 0;
  for (const [i, [kind, name, detail, year]] of STARTER.entries()) {
    if (have.has(`${kind}|${name.toLowerCase()}`)) continue;
    await c.query('INSERT INTO is_items (madrasah_id, kind, name, detail, year_group, sort) VALUES ($1,$2,$3,$4,$5,$6)', [mid, kind, name, detail, year, i]);
    added++;
  }
  return added;
}

async function items(mid, upToYear = null) {
  const { rows } = await query(
    `SELECT ${ITEM_COLS} FROM is_items WHERE madrasah_id = $1 ${upToYear === null ? '' : 'AND year_group <= $2'}
     ORDER BY year_group, sort, id`, upToYear === null ? [mid] : [mid, upToYear]);
  return rows;
}

// The first time a school opens Islamic Studies, its lists start as the starter lists.
async function seedOnce(mid) {
  const { rows: [s] } = await query('SELECT studies_seeded FROM settings WHERE madrasah_id = $1', [mid]);
  if (!s || s.studies_seeded) return;
  await transaction(async c => {
    const { rows: [again] } = await c.query('SELECT studies_seeded FROM settings WHERE madrasah_id = $1 FOR UPDATE', [mid]);
    if (again.studies_seeded) return;
    await addStarter(c, mid);
    await c.query('UPDATE settings SET studies_seeded = true WHERE madrasah_id = $1', [mid]);
  });
}

// A pupil's year group is their class's.
async function yearGroupOfClass(mid, className) {
  const { rows: [c] } = await query('SELECT year_group FROM classes WHERE madrasah_id = $1 AND name = $2', [mid, className]);
  return c?.year_group ?? null;
}

const handler = requireAuth(async (req, res) => {
  const mid = req.user.madrasahId;
  await ensure();
  if (!(await isSchool(mid))) { res.status(403).json({ error: 'This is only for a school.' }); return; }
  const action = req.query.action;

  if (action === 'backup' && req.method === 'GET') {
    if (!isOwner(req)) { res.status(403).json({ error: "You don't have access to this." }); return; }
    const { rows: list } = await query('SELECT id::text AS id, kind, name, detail, year_group, sort FROM is_items WHERE madrasah_id = $1 ORDER BY id', [mid]);
    const { rows: marks } = await query('SELECT student_id, item_id::text AS item_id, level, updated_by, updated_at FROM is_progress WHERE madrasah_id = $1', [mid]);
    res.status(200).json({ items: list, progress: marks });
    return;
  }
  if (action === 'restore' && req.method === 'POST') {
    if (!isOwner(req)) { res.status(403).json({ error: "You don't have access to this." }); return; }
    if (req.user.demo) { res.status(403).json({ error: 'Backups are switched off in the demo.' }); return; }
    const b = req.body || {};
    const { rows: known } = await query('SELECT id FROM students WHERE madrasah_id = $1', [mid]);
    const pupils = new Set(known.map(r => r.id));
    await transaction(async c => {
      await c.query('DELETE FROM is_progress WHERE madrasah_id = $1', [mid]);
      await c.query('DELETE FROM is_items WHERE madrasah_id = $1', [mid]);
      const ids = {}; // each item gets a new number; the marks follow it
      for (const it of Array.isArray(b.items) ? b.items : []) {
        if (!KINDS.includes(it.kind) || !str(it.name, 120)) continue;
        const { rows: [n] } = await c.query('INSERT INTO is_items (madrasah_id, kind, name, detail, year_group, sort) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
          [mid, it.kind, str(it.name, 120), str(it.detail), yearOf(it.year_group) ?? 0, Number(it.sort) || 0]);
        ids[it.id] = n.id;
      }
      for (const p of Array.isArray(b.progress) ? b.progress : []) {
        if (!ids[p.item_id] || !pupils.has(String(p.student_id)) || ![1, 2].includes(Number(p.level))) continue;
        await c.query('INSERT INTO is_progress (madrasah_id, student_id, item_id, level, updated_by, updated_at) VALUES ($1,$2,$3,$4,$5,COALESCE($6::timestamptz, now())) ON CONFLICT DO NOTHING',
          [mid, String(p.student_id), ids[p.item_id], Number(p.level), str(p.updated_by), p.updated_at || null]);
      }
      await c.query('UPDATE settings SET studies_seeded = true WHERE madrasah_id = $1', [mid]);
    });
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'GET') {
    await seedOnce(mid);
    if (action === 'summary') {
      const scope = await accessScope(req);
      const { rows } = await query(
        `SELECT c.name AS class, c.year_group AS "yearGroup", t.name AS teacher,
           (SELECT count(*)::int FROM students s WHERE s.madrasah_id = c.madrasah_id AND s.class = c.name AND s.status = 'Active') AS pupils,
           (SELECT count(*)::int FROM is_items i WHERE i.madrasah_id = c.madrasah_id AND i.year_group = c.year_group) AS items,
           p.achieved, p.working
         FROM classes c LEFT JOIN teachers t ON t.id = c.teacher_id AND t.madrasah_id = c.madrasah_id
         LEFT JOIN LATERAL (
           SELECT count(*) FILTER (WHERE p.level = 2)::int AS achieved, count(*) FILTER (WHERE p.level = 1)::int AS working
           FROM is_progress p JOIN students s ON s.id = p.student_id AND s.madrasah_id = p.madrasah_id
           JOIN is_items i ON i.id = p.item_id AND i.madrasah_id = p.madrasah_id
           WHERE p.madrasah_id = c.madrasah_id AND s.class = c.name AND s.status = 'Active' AND i.year_group = c.year_group) p ON true
         WHERE c.madrasah_id = $1 ${scope.classNames ? 'AND c.name = ANY($2)' : ''}
         ORDER BY c.year_group NULLS LAST, c.name`, scope.classNames ? [mid, scope.classNames] : [mid]);
      res.status(200).json(rows);
      return;
    }
    if (req.query.studentId) {
      const scope = await accessScope(req);
      const sid = String(req.query.studentId);
      if (!scope.studentIds.has(sid)) { res.status(404).json({ error: 'Pupil not found' }); return; }
      const { rows: [p] } = await query(
        `SELECT id, forename || ' ' || surname AS name, class FROM students WHERE id = $1 AND madrasah_id = $2`, [sid, mid]);
      const year = await yearGroupOfClass(mid, p.class);
      const { rows: progress } = await query(`SELECT ${PROGRESS_COLS} FROM is_progress WHERE madrasah_id = $1 AND student_id = $2`, [mid, sid]);
      res.status(200).json({ pupil: { ...p, yearGroup: year }, items: await items(mid, year), progress });
      return;
    }
    if (req.query.class !== undefined) {
      const cls = String(req.query.class);
      const scope = await accessScope(req);
      if (scope.classNames && !scope.classNames.includes(cls)) { res.status(403).json({ error: "You don't have access to this class." }); return; }
      const year = await yearGroupOfClass(mid, cls);
      const { rows: pupils } = await query(
        `SELECT id, forename || ' ' || surname AS name FROM students
         WHERE madrasah_id = $1 AND class = $2 AND status = 'Active' ORDER BY forename, surname`, [mid, cls]);
      const ids = pupils.map(p => p.id);
      const { rows: progress } = ids.length
        ? await query(`SELECT ${PROGRESS_COLS} FROM is_progress WHERE madrasah_id = $1 AND student_id = ANY($2)`, [mid, ids])
        : { rows: [] };
      res.status(200).json({ yearGroup: year, items: await items(mid, year), pupils, progress });
      return;
    }
    res.status(200).json({ items: await items(mid) });
    return;
  }

  if (action === 'mark' && req.method === 'POST') {
    const b = req.body || {};
    const level = Number(b.level);
    if (![0, 1, 2].includes(level)) { res.status(400).json({ error: 'Choose Not yet, Working towards or Achieved.' }); return; }
    const { rows: [item] } = await query('SELECT id FROM is_items WHERE id = $1 AND madrasah_id = $2', [String(b.itemId || '0').replace(/\D/g, '') || '0', mid]);
    if (!item) { res.status(404).json({ error: 'That item has been removed.' }); return; }
    const scope = await accessScope(req);
    const ids = [...new Set((Array.isArray(b.studentIds) ? b.studentIds : []).map(String))];
    if (!ids.length || ids.some(id => !scope.studentIds.has(id))) { res.status(403).json({ error: "You don't have access to one of these pupils." }); return; }
    const who = await whoName(req.user);
    if (level === 0) {
      await query('DELETE FROM is_progress WHERE madrasah_id = $1 AND item_id = $2 AND student_id = ANY($3)', [mid, item.id, ids]);
    } else {
      await query(
        `INSERT INTO is_progress (madrasah_id, student_id, item_id, level, updated_by)
         SELECT $1, sid, $2, $3, $4 FROM unnest($5::text[]) AS sid
         ON CONFLICT (student_id, item_id) DO UPDATE SET level = EXCLUDED.level, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [mid, item.id, level, who, ids]);
    }
    res.status(200).json({ ok: true });
    return;
  }

  // Changing the lists is the head's.
  if (!isOwner(req)) { res.status(403).json({ error: 'Only the head can change the lists.' }); return; }

  if (action === 'item' && req.method === 'POST') {
    const b = req.body || {};
    const name = str(b.name, 120);
    const year = yearOf(b.yearGroup) ?? 0;
    if (!KINDS.includes(b.kind)) { res.status(400).json({ error: 'Choose surah, du\'aa or practical.' }); return; }
    if (!name) { res.status(400).json({ error: 'Type its name.' }); return; }
    if (b.id) {
      const { rowCount } = await query('UPDATE is_items SET kind = $1, name = $2, detail = $3, year_group = $4 WHERE id = $5 AND madrasah_id = $6',
        [b.kind, name, str(b.detail), year, String(b.id).replace(/\D/g, '') || '0', mid]);
      if (!rowCount) { res.status(404).json({ error: 'That item has been removed.' }); return; }
    } else {
      const { rows: [{ s }] } = await query('SELECT COALESCE(max(sort), 0) + 1 AS s FROM is_items WHERE madrasah_id = $1', [mid]);
      await query('INSERT INTO is_items (madrasah_id, kind, name, detail, year_group, sort) VALUES ($1,$2,$3,$4,$5,$6)', [mid, b.kind, name, str(b.detail), year, s]);
    }
    res.status(200).json({ ok: true });
    return;
  }
  if (action === 'item' && req.method === 'DELETE') {
    const id = String(req.query.id || '0').replace(/\D/g, '') || '0';
    await transaction(async c => {
      await c.query('DELETE FROM is_progress WHERE madrasah_id = $1 AND item_id = $2', [mid, id]);
      await c.query('DELETE FROM is_items WHERE madrasah_id = $1 AND id = $2', [mid, id]);
    });
    res.status(200).json({ ok: true });
    return;
  }
  if (action === 'starter' && req.method === 'POST') {
    const added = await transaction(c => addStarter(c, mid));
    res.status(200).json({ added });
    return;
  }
  res.status(405).json({ error: 'Method not allowed' });
}, { teacher: true });

// The parent portal's Islamic Studies card: the child's lists (their year and earlier) and where they are with each.
async function forParent(mid, student) {
  if (!(await isSchool(mid))) return null;
  await ensure();
  await seedOnce(mid);
  const year = await yearGroupOfClass(mid, student.class);
  const { rows: progress } = await query(`SELECT ${PROGRESS_COLS} FROM is_progress WHERE madrasah_id = $1 AND student_id = $2`, [mid, student.id]);
  return { yearGroup: year, items: await items(mid, year), progress: progress.map(({ updatedBy, ...p }) => p) };
}

module.exports = handler;
module.exports.ensure = ensure;
module.exports.forParent = forParent;
module.exports.addStarter = addStarter;
