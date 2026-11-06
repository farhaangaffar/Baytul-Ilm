const { query, transaction } = require('../db');
const { requireAuth, isOwner, accessScope, whoName } = require('../auth');
const { STARTER } = require('../studiesStarter');

// A school's Islamic Studies trackers (madaaris.kind = 'school'; src/pages/Studies.js): its own lists of surahs,
// du'aas and practicals (is_items — each with the year group it's learnt in, Reception = 0 … Year 13), and where each
// pupil is with each one (is_progress, the school's own 1-2-3: 1 = Incomplete, 2 = Completed with help, 3 = Achieved; no row =
// Not assessed yet). A class sees the items of its year group and the years before (classes.year_group). A surah item can
// carry its surah number (is_items.surah), so the class's weekly tracker — which aayahs the class has covered — can show its
// aayahs (is_class_ayahs). Head: everything, and edits the lists; teachers: their own classes. Parents see their child's in
// the portal (forParent, routes/parent.js).
//
// GET                         → { items }  (the first time, the starter lists are added)
// GET ?class=<name>           → { yearGroup, items, pupils, progress, ayahs: { itemId: [aayah numbers covered] } }
// GET ?studentId=             → { pupil, items, progress, ayahs (their class's), classAverage: { kind: % achieved of assessed } }
// GET ?action=summary         → [{ class, yearGroup, teacher, pupils, items, achieved, withHelp, incomplete }] (the Dashboard:
//                               each class's own year's items — pupil × item counts)
// POST ?action=mark           { itemId, studentIds, level: 0 (Not assessed) | 1 | 2 | 3 }
// POST ?action=ayahs          { className, itemId, ayahs: [numbers] } — the class has covered these aayahs
// POST ?action=import         { marks: [{ studentId, itemId, level 1|2|3 }] } (head) — marks from the school's own sheets
// POST ?action=item           { id?, kind, name, detail, yearGroup, surah? }   (head) → { id }
// DELETE ?action=item&id=     (head) — with its marks
// POST ?action=starter        (head) — adds starter items not already there (matched by kind + name)
// GET ?action=new-year       (head) → { classes: [{ id, name, yearGroup, pupils }], lastMove: { id, movedOn, count } | null }
// POST ?action=new-year       (head) { moves: [{ from: classId, to }] } — the new school year: each class's pupils go
//                               to another class ({ classId }), a new one ({ name }), stay with the class a year up
//                               ({ up: true }), into "Not in a class" to place one by one ({ sort: true }), leave the
//                               school ({ left: true }) or stay as they are ({ stay: true }). Marks stay with each
//                               pupil; logged in is_year_moves so it can be undone.
// POST ?action=undo-year      (head) — puts the last move back (pupils not changed since; new classes left empty go)
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
    level       SMALLINT NOT NULL,          -- 1 Incomplete, 2 Completed with help, 3 Achieved
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by  TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (student_id, item_id)
  )`);
  await query('CREATE INDEX IF NOT EXISTS idx_is_progress_madrasah ON is_progress (madrasah_id, item_id)');
  await query('ALTER TABLE is_items ADD COLUMN IF NOT EXISTS surah INTEGER'); // a surah item's number (1–114), for its aayahs
  await query(`CREATE TABLE IF NOT EXISTS is_class_ayahs (
    madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
    class_id    TEXT NOT NULL,
    item_id     BIGINT NOT NULL,
    ayahs       INTEGER[] NOT NULL DEFAULT '{}',   -- the aayahs the class has covered
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by  TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (class_id, item_id)
  )`);
  await query('CREATE INDEX IF NOT EXISTS idx_is_class_ayahs_madrasah ON is_class_ayahs (madrasah_id)');
  // Each new-school-year move, so it can be undone: changes = { students: [{ id, fromClass, toClass, fromStatus,
  // toStatus, fromLeave, toLeave, fromSheet, toSheet }], created: [classId], bumped: [{ id, from, to }], classes: the classes
// as they were (so undo brings back any deleted since) }.
  await query(`CREATE TABLE IF NOT EXISTS is_year_moves (
    id          BIGSERIAL PRIMARY KEY,
    madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
    moved_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    undone      BOOLEAN NOT NULL DEFAULT false,
    changes     JSONB NOT NULL
  )`);
  ready = true;
}

const ITEM_COLS = `id::text AS id, kind, name, detail, year_group AS "yearGroup", surah`;
const surahOf = v => { const n = Math.round(Number(v)); return n >= 1 && n <= 114 ? n : null; };
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
  for (const [i, [kind, name, detail, year, surah]] of STARTER.entries()) {
    if (have.has(`${kind}|${name.toLowerCase()}`)) continue;
    await c.query('INSERT INTO is_items (madrasah_id, kind, name, detail, year_group, sort, surah) VALUES ($1,$2,$3,$4,$5,$6,$7)', [mid, kind, name, detail, year, i, surah || null]);
    added++;
  }
  return added;
}

// Surahs in the order they're usually taught: Al-Faatihah first, then An-Naas back towards An-Naba (114 → 78 …),
// then any that aren't a whole surah (e.g. Ayat al-Kursi). Du'aas and practicals keep their own order.
const SURAH_ORDER = `CASE WHEN kind <> 'surah' OR surah = 1 THEN 0 WHEN surah IS NOT NULL THEN 115 - surah ELSE 200 END`;

async function items(mid, upToYear = null) {
  const { rows } = await query(
    `SELECT ${ITEM_COLS} FROM is_items WHERE madrasah_id = $1 ${upToYear === null ? '' : 'AND year_group <= $2'}
     ORDER BY year_group, ${SURAH_ORDER}, sort, id`, upToYear === null ? [mid] : [mid, upToYear]);
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

// The aayahs a class has covered, by item id.
async function classAyahs(mid, className) {
  const { rows } = await query(
    `SELECT a.item_id::text AS id, a.ayahs FROM is_class_ayahs a JOIN classes c ON c.id = a.class_id AND c.madrasah_id = a.madrasah_id
     WHERE a.madrasah_id = $1 AND c.name = $2`, [mid, className]);
  return Object.fromEntries(rows.map(r => [r.id, r.ayahs]));
}

const handler = requireAuth(async (req, res) => {
  const mid = req.user.madrasahId;
  await ensure();
  if (!(await isSchool(mid))) { res.status(403).json({ error: 'This is only for a school.' }); return; }
  const action = req.query.action;

  if (action === 'backup' && req.method === 'GET') {
    if (!isOwner(req)) { res.status(403).json({ error: "You don't have access to this." }); return; }
    const { rows: list } = await query('SELECT id::text AS id, kind, name, detail, year_group, sort, surah FROM is_items WHERE madrasah_id = $1 ORDER BY id', [mid]);
    const { rows: marks } = await query('SELECT student_id, item_id::text AS item_id, level, updated_by, updated_at FROM is_progress WHERE madrasah_id = $1', [mid]);
    const { rows: ayahs } = await query('SELECT class_id, item_id::text AS item_id, ayahs, updated_by, updated_at FROM is_class_ayahs WHERE madrasah_id = $1', [mid]);
    res.status(200).json({ items: list, progress: marks, ayahs, reports: await require('./school-reports').backup(mid) });
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
      await c.query('DELETE FROM is_class_ayahs WHERE madrasah_id = $1', [mid]);
      await c.query('DELETE FROM is_items WHERE madrasah_id = $1', [mid]);
      const ids = {}; // each item gets a new number; the marks follow it
      for (const it of Array.isArray(b.items) ? b.items : []) {
        if (!KINDS.includes(it.kind) || !str(it.name, 120)) continue;
        const { rows: [n] } = await c.query('INSERT INTO is_items (madrasah_id, kind, name, detail, year_group, sort, surah) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
          [mid, it.kind, str(it.name, 120), str(it.detail), yearOf(it.year_group) ?? 0, Number(it.sort) || 0, surahOf(it.surah)]);
        ids[it.id] = n.id;
      }
      for (const p of Array.isArray(b.progress) ? b.progress : []) {
        if (!ids[p.item_id] || !pupils.has(String(p.student_id)) || ![1, 2, 3].includes(Number(p.level))) continue;
        await c.query('INSERT INTO is_progress (madrasah_id, student_id, item_id, level, updated_by, updated_at) VALUES ($1,$2,$3,$4,$5,COALESCE($6::timestamptz, now())) ON CONFLICT DO NOTHING',
          [mid, String(p.student_id), ids[p.item_id], Number(p.level), str(p.updated_by), p.updated_at || null]);
      }
      const { rows: cls } = await c.query('SELECT id FROM classes WHERE madrasah_id = $1', [mid]);
      const classIds = new Set(cls.map(r => r.id));
      for (const a of Array.isArray(b.ayahs) ? b.ayahs : []) {
        if (!ids[a.item_id] || !classIds.has(String(a.class_id)) || !Array.isArray(a.ayahs)) continue;
        await c.query('INSERT INTO is_class_ayahs (madrasah_id, class_id, item_id, ayahs, updated_by, updated_at) VALUES ($1,$2,$3,$4,$5,COALESCE($6::timestamptz, now())) ON CONFLICT DO NOTHING',
          [mid, String(a.class_id), ids[a.item_id], a.ayahs.map(Number).filter(n => n >= 1 && n <= 286), str(a.updated_by), a.updated_at || null]);
      }
      // Assessment points and reports (older backups have none — leave them alone).
      if (b.reports) await require('./school-reports').restore(c, mid, b.reports, Object.fromEntries(Object.entries(ids).map(([k, v]) => [String(k), String(v)])));
      await c.query('UPDATE settings SET studies_seeded = true WHERE madrasah_id = $1', [mid]);
    });
    res.status(200).json({ ok: true });
    return;
  }

  if (action === 'new-year' || action === 'undo-year') {
    if (!isOwner(req)) { res.status(403).json({ error: 'Only the head can move classes up.' }); return; }
    if (req.method === 'GET') {
      const { rows: classes } = await query(
        `SELECT c.id, c.name, c.year_group AS "yearGroup",
           (SELECT count(*)::int FROM students s WHERE s.madrasah_id = c.madrasah_id AND s.class = c.name AND s.status = 'Active') AS pupils
         FROM classes c WHERE c.madrasah_id = $1 ORDER BY c.year_group NULLS LAST, c.name`, [mid]);
      const { rows: [move] } = await query(
        `SELECT id::text, to_char(moved_at AT TIME ZONE 'Europe/London', 'YYYY-MM-DD') AS "movedOn", jsonb_array_length(changes->'students') AS count
         FROM is_year_moves WHERE madrasah_id = $1 AND NOT undone ORDER BY id DESC LIMIT 1`, [mid]);
      res.status(200).json({ classes, lastMove: move || null });
      return;
    }
    if (req.method === 'POST' && action === 'new-year') {
      const moves = Array.isArray((req.body || {}).moves) ? req.body.moves : [];
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
      const result = await transaction(async c => {
        const { rows: classes } = await c.query('SELECT id, name, year_group, teacher_id FROM classes WHERE madrasah_id = $1 FOR UPDATE', [mid]);
        const byId = new Map(classes.map(k => [k.id, k]));
        const byName = new Map(classes.map(k => [k.name.toLowerCase(), k]));
        // Who is in each class now — taken before anything moves, so 6A → 7A and 7A → 8A both work.
        const { rows: pupils } = await c.query(
          `SELECT id, class, status, to_char(leave_date, 'YYYY-MM-DD') AS leave, sheet_class FROM students
           WHERE madrasah_id = $1 AND status = 'Active'`, [mid]);
        const created = [], bumped = [], changes = [];
        const seen = new Set();
        for (const m of moves) {
          const from = byId.get(String(m?.from || ''));
          const to = m?.to || {};
          if (!from || seen.has(from.id) || to.stay) continue;
          seen.add(from.id);
          const up = from.year_group === null ? null : Math.min(13, from.year_group + 1);
          let target = null; // the class name they go to
          if (to.classId) target = byId.get(String(to.classId))?.name || null;
          else if (to.name) {
            const name = str(to.name, 60);
            if (!name) continue;
            let k = byName.get(name.toLowerCase());
            if (!k) {
              k = { id: 'C' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, year_group: up };
              await c.query('INSERT INTO classes (id, madrasah_id, name, year_group) VALUES ($1, $2, $3, $4)', [k.id, mid, k.name, k.year_group]);
              byId.set(k.id, k); byName.set(name.toLowerCase(), k); created.push(k.id);
            }
            target = k.name;
          } else if (to.up) {
            if (up !== null && up !== from.year_group) {
              await c.query('UPDATE classes SET year_group = $1 WHERE id = $2 AND madrasah_id = $3', [up, from.id, mid]);
              await c.query('DELETE FROM is_class_ayahs WHERE madrasah_id = $1 AND class_id = $2', [mid, from.id]); // a new year's surahs
              bumped.push({ id: from.id, from: from.year_group, to: up });
            }
            continue; // the pupils stay in the class
          }
          for (const p of pupils.filter(x => x.class === from.name)) {
            const base = { id: p.id, fromClass: p.class, fromStatus: p.status, fromLeave: p.leave, fromSheet: p.sheet_class };
            if (to.left) changes.push({ ...base, toClass: p.class, toStatus: 'Inactive', toLeave: today, toSheet: p.sheet_class });
            else if (to.sort) changes.push({ ...base, toClass: '', toStatus: 'Active', toLeave: p.leave, toSheet: `Last year: ${from.name}`.slice(0, 60) });
            else if (target && target !== p.class) changes.push({ ...base, toClass: target, toStatus: 'Active', toLeave: p.leave, toSheet: p.sheet_class });
          }
        }
        if (!changes.length && !bumped.length) return { error: 'Nothing to move.' };
        for (const ch of changes) {
          await c.query('UPDATE students SET class = $1, status = $2, leave_date = $3, sheet_class = $4 WHERE id = $5 AND madrasah_id = $6',
            [ch.toClass, ch.toStatus, ch.toLeave, ch.toSheet, ch.id, mid]);
        }
        await c.query('INSERT INTO is_year_moves (madrasah_id, changes) VALUES ($1, $2)', [mid, JSON.stringify({ students: changes, created, bumped, classes })]);
        // Classes nobody is in any more, to mention (the head deletes them on Classes & Teachers if they're not needed).
        const { rows: empty } = await c.query(
          `SELECT c.id, c.name FROM classes c WHERE c.madrasah_id = $1
             AND NOT EXISTS (SELECT 1 FROM students s WHERE s.madrasah_id = c.madrasah_id AND s.class = c.name AND s.status = 'Active')
           ORDER BY c.year_group NULLS LAST, c.name`, [mid]);
        return {
          moved: changes.filter(ch => ch.toStatus === 'Active' && ch.toClass).length,
          toSort: changes.filter(ch => ch.toStatus === 'Active' && !ch.toClass).length,
          left: changes.filter(ch => ch.toStatus === 'Inactive').length,
          newClasses: created.map(id => byId.get(id).name),
          emptyClasses: empty,
        };
      });
      if (result.error) { res.status(400).json({ error: result.error }); return; }
      res.status(200).json({ ok: true, ...result });
      return;
    }
    if (req.method === 'POST' && action === 'undo-year') {
      const result = await transaction(async c => {
        const { rows: [move] } = await c.query(
          'SELECT id, changes FROM is_year_moves WHERE madrasah_id = $1 AND NOT undone ORDER BY id DESC LIMIT 1 FOR UPDATE', [mid]);
        if (!move) return { error: 'There is no move to undo.' };
        const { students = [], created = [], bumped = [], classes = [] } = move.changes;
        // Classes deleted since (e.g. the empty ones after the move) come back first, as they were.
        for (const k of classes) {
          await c.query(
            `INSERT INTO classes (id, madrasah_id, name, year_group, teacher_id)
             SELECT $1, $2, $3, $4, (SELECT id FROM teachers WHERE id = $5 AND madrasah_id = $2)
             WHERE NOT EXISTS (SELECT 1 FROM classes WHERE madrasah_id = $2 AND (id = $1 OR name = $3))`,
            [k.id, mid, k.name, k.year_group, k.teacher_id]);
        }
        let n = 0;
        for (const ch of students) {
          const { rowCount } = await c.query(
            `UPDATE students SET class = $1, status = $2, leave_date = $3, sheet_class = $4
             WHERE id = $5 AND madrasah_id = $6 AND class = $7 AND status = $8 AND leave_date IS NOT DISTINCT FROM $9::date`,
            [ch.fromClass, ch.fromStatus, ch.fromLeave, ch.fromSheet || '', ch.id, mid, ch.toClass, ch.toStatus, ch.toLeave]);
          n += rowCount;
        }
        for (const b of bumped) await c.query('UPDATE classes SET year_group = $1 WHERE id = $2 AND madrasah_id = $3 AND year_group = $4', [b.from, b.id, mid, b.to]);
        // New classes go again if no one is in them now.
        for (const id of created) {
          await c.query(
            `DELETE FROM classes c WHERE c.id = $1 AND c.madrasah_id = $2
               AND NOT EXISTS (SELECT 1 FROM students s WHERE s.madrasah_id = c.madrasah_id AND s.class = c.name)
               AND NOT EXISTS (SELECT 1 FROM users u WHERE u.madrasah_id = c.madrasah_id AND u.class_id = c.id)`, [id, mid]);
        }
        await c.query('UPDATE is_year_moves SET undone = true WHERE id = $1 AND madrasah_id = $2', [move.id, mid]);
        return { restored: n, skipped: students.length - n };
      });
      if (result.error) { res.status(400).json({ error: result.error }); return; }
      res.status(200).json({ ok: true, ...result });
      return;
    }
  }

  if (req.method === 'GET') {
    await seedOnce(mid);
    if (action === 'summary') {
      const scope = await accessScope(req);
      const { rows } = await query(
        `SELECT c.name AS class, c.year_group AS "yearGroup", t.name AS teacher,
           (SELECT count(*)::int FROM students s WHERE s.madrasah_id = c.madrasah_id AND s.class = c.name AND s.status = 'Active') AS pupils,
           (SELECT count(*)::int FROM is_items i WHERE i.madrasah_id = c.madrasah_id AND i.year_group = c.year_group) AS items,
           p.achieved, p.with_help AS "withHelp", p.incomplete
         FROM classes c LEFT JOIN teachers t ON t.id = c.teacher_id AND t.madrasah_id = c.madrasah_id
         LEFT JOIN LATERAL (
           SELECT count(*) FILTER (WHERE p.level = 3)::int AS achieved, count(*) FILTER (WHERE p.level = 2)::int AS with_help,
                  count(*) FILTER (WHERE p.level = 1)::int AS incomplete
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
      // The class's average for each list (achieved of what's been assessed, their year and earlier), to compare with.
      const { rows: avg } = await query(
        `SELECT i.kind, count(*) FILTER (WHERE p.level = 3)::int AS achieved, count(*)::int AS assessed
         FROM is_progress p JOIN students s ON s.id = p.student_id AND s.madrasah_id = p.madrasah_id
         JOIN is_items i ON i.id = p.item_id AND i.madrasah_id = p.madrasah_id
         WHERE p.madrasah_id = $1 AND s.class = $2 AND s.status = 'Active' AND ($3::int IS NULL OR i.year_group <= $3) GROUP BY i.kind`, [mid, p.class, year]);
      res.status(200).json({ pupil: { ...p, yearGroup: year }, items: await items(mid, year), progress, ayahs: await classAyahs(mid, p.class),
        classAverage: (() => {
          const sum = k => avg.reduce((t, a) => t + a[k], 0);
          return { ...Object.fromEntries(avg.map(a => [a.kind, a.assessed ? Math.round((a.achieved / a.assessed) * 100) : null])),
            all: sum('assessed') ? Math.round((sum('achieved') / sum('assessed')) * 100) : null }; // every list together
        })() });
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
      res.status(200).json({ yearGroup: year, items: await items(mid, year), pupils, progress, ayahs: await classAyahs(mid, cls) });
      return;
    }
    res.status(200).json({ items: await items(mid) });
    return;
  }

  if (action === 'mark' && req.method === 'POST') {
    const b = req.body || {};
    const level = Number(b.level);
    if (![0, 1, 2, 3].includes(level)) { res.status(400).json({ error: 'Choose Incomplete, Completed with help or Achieved.' }); return; }
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

  // The class's weekly tracker: which aayahs of a surah it has covered (its own teacher or the head).
  if (action === 'ayahs' && req.method === 'POST') {
    const b = req.body || {};
    const scope = await accessScope(req);
    const cls = String(b.className || '');
    if (scope.classNames && !scope.classNames.includes(cls)) { res.status(403).json({ error: "You don't have access to this class." }); return; }
    const { rows: [c] } = await query('SELECT id FROM classes WHERE madrasah_id = $1 AND name = $2', [mid, cls]);
    const { rows: [item] } = await query("SELECT id FROM is_items WHERE id = $1 AND madrasah_id = $2 AND kind = 'surah'", [String(b.itemId || '0').replace(/\D/g, '') || '0', mid]);
    if (!c || !item) { res.status(404).json({ error: 'Not found' }); return; }
    const ayahs = [...new Set((Array.isArray(b.ayahs) ? b.ayahs : []).map(n => Math.round(Number(n))).filter(n => n >= 1 && n <= 286))].sort((x, y) => x - y);
    await query(
      `INSERT INTO is_class_ayahs (madrasah_id, class_id, item_id, ayahs, updated_by) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (class_id, item_id) DO UPDATE SET ayahs = EXCLUDED.ayahs, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [mid, c.id, item.id, ayahs, await whoName(req.user)]);
    res.status(200).json({ ok: true });
    return;
  }

  // Changing the lists, and importing marks, is the head's.
  if (!isOwner(req)) { res.status(403).json({ error: 'Only the head can change the lists.' }); return; }

  // Marks from the school's own spreadsheets (src/components/StudiesImport.js matches the pupils and columns first).
  if (action === 'import' && req.method === 'POST') {
    const list = Array.isArray((req.body || {}).marks) ? req.body.marks.slice(0, 20000) : [];
    const scope = await accessScope(req);
    const { rows: known } = await query('SELECT id::text AS id FROM is_items WHERE madrasah_id = $1', [mid]);
    const itemIds = new Set(known.map(r => r.id));
    const ok = list.filter(m => scope.studentIds.has(String(m.studentId)) && itemIds.has(String(m.itemId)) && [1, 2, 3].includes(Number(m.level)));
    for (let i = 0; i < ok.length; i += 1000) {
      const part = ok.slice(i, i + 1000);
      await query(
        `INSERT INTO is_progress (madrasah_id, student_id, item_id, level, updated_by)
         SELECT $1, s, i::bigint, l, 'Imported' FROM unnest($2::text[], $3::text[], $4::smallint[]) AS t(s, i, l)
         ON CONFLICT (student_id, item_id) DO UPDATE SET level = EXCLUDED.level, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [mid, part.map(m => String(m.studentId)), part.map(m => String(m.itemId)), part.map(m => Number(m.level))]);
    }
    res.status(200).json({ imported: ok.length, skipped: list.length - ok.length });
    return;
  }

  if (action === 'item' && req.method === 'POST') {
    const b = req.body || {};
    const name = str(b.name, 120);
    const year = yearOf(b.yearGroup) ?? 0;
    if (!KINDS.includes(b.kind)) { res.status(400).json({ error: 'Choose surah, du\'aa or practical.' }); return; }
    if (!name) { res.status(400).json({ error: 'Type its name.' }); return; }
    if (b.id) {
      const { rowCount } = await query('UPDATE is_items SET kind = $1, name = $2, detail = $3, year_group = $4, surah = $5 WHERE id = $6 AND madrasah_id = $7',
        [b.kind, name, str(b.detail), year, b.kind === 'surah' ? surahOf(b.surah) : null, String(b.id).replace(/\D/g, '') || '0', mid]);
      if (!rowCount) { res.status(404).json({ error: 'That item has been removed.' }); return; }
      res.status(200).json({ ok: true, id: String(b.id) });
      return;
    }
    const { rows: [{ s }] } = await query('SELECT COALESCE(max(sort), 0) + 1 AS s FROM is_items WHERE madrasah_id = $1', [mid]);
    const { rows: [n] } = await query('INSERT INTO is_items (madrasah_id, kind, name, detail, year_group, sort, surah) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id::text AS id',
      [mid, b.kind, name, str(b.detail), year, s, b.kind === 'surah' ? surahOf(b.surah) : null]);
    res.status(200).json({ ok: true, id: n.id });
    return;
  }
  if (action === 'item' && req.method === 'DELETE') {
    const id = String(req.query.id || '0').replace(/\D/g, '') || '0';
    await transaction(async c => {
      await c.query('DELETE FROM is_progress WHERE madrasah_id = $1 AND item_id = $2', [mid, id]);
      await c.query('DELETE FROM is_class_ayahs WHERE madrasah_id = $1 AND item_id = $2', [mid, id]);
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
  return {
    yearGroup: year, items: await items(mid, year), progress: progress.map(({ updatedBy, ...p }) => p), ayahs: await classAyahs(mid, student.class),
    // Reports the school has sent to parents (routes/school-reports.js), with every item so older years' marks show.
    reports: await require('./school-reports').forParent(mid, student.id), allItems: await items(mid),
  };
}

module.exports = handler;
module.exports.ensure = ensure;
module.exports.forParent = forParent;
module.exports.addStarter = addStarter;
