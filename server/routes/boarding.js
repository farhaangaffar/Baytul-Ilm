const { query, transaction } = require('../db');
const { requireAuth, isOwner, whoName } = require('../auth');

// A Darul Uloom's boarding (the Boarding page, src/pages/Boarding.js). Boarders are the Active
// children whose details say "Boarder". The head, and the teachers ticked for boarding duty
// (teachers.boarding_duty, on Classes & Teachers), use it; everyone else gets 403, as does a maktab.
//   Rooms — each madrasah's own, laid out as it likes: a section (whatever it calls it — "Block A", "East Wing",
//     "Dorm 3"; stored as `block`), a level, then the room's number or name and its beds (and the teacher in
//     charge); a boarder has one room (du_room_places).
//   Night register — each boarder In / Away / Sick for a night (du_night_register). A boarder signed out
//     (going home) shows as Home that night and isn't marked.
//   Going home — signing a boarder out (who collected them, when they're due back) and back in (du_leaves);
//     the madrasah's own home weekends (du_home_weekends), which parents see in the portal. Everyone is assumed to
//     go home: staff mark only who's staying (du_weekend_answers, going = false); at its leave time everyone not
//     staying is signed out by itself (applyWeekends(), run when boarding is next opened — no timer), and staff
//     handle the exceptions (not collected yet). Marking a boarder In on the night
//     register signs them back in.
//   Sick & medicine — when a boarder was unwell or given medicine (du_health_log).
//
// GET ?date=YYYY-MM-DD → { today, date, head, boarders, rooms, teachers, register, leaves, homeWeekends, health }
// GET ?action=student&studentId= → { room, leaves, health } — one boarder (their profile)
// POST ?action=room {id?, block, level, name, beds, teacherId} (head)  · DELETE ?action=room&id= (head)
// POST ?action=rooms {block, level, teacherId, rooms: [{name, beds}]} (head) → several rooms on one level at once
// POST ?action=rename {what: 'block'|'level', block, level?, to} (head) → renames a section, or a level in a section
// POST ?action=place {studentIds[], roomId|null}         (head)  → puts them in a room (or none)
// POST ?action=register {date, studentIds[], status: 'in'|'away'|'sick'|null} — 'in' tonight also signs them back in
// POST ?action=out {studentIds[], collectedBy, reason, backDue} → signs them out (going home)
// POST ?action=answer {weekendId, studentIds[], going} → staff mark staying (going: false) or back to going home
// POST ?action=not-collected {weekendId, studentId} → still here after the weekend's sign-out (waiting to be collected)
// POST ?action=collected {weekendId, studentId, collectedBy?} → a waiting boarder has now been collected
// POST ?action=back {leaveIds[]}                         → signs them back in
// DELETE ?action=leave&id=                               (head)  → a sign-out made by mistake
// POST ?action=home-weekend {id?, name, starts, leaveTime, ends, returnTime} (head) · DELETE ?action=home-weekend&id= (head)
// POST ?action=health {studentId, kind: 'unwell'|'medicine', note, medicine, dose, at?}
// DELETE ?action=health&id=                              (head)

let ready = false;
async function ensure() {
  if (ready) return;
  await require('./teachers').ensure(); // teachers.boarding_duty
  await require('./students').ensure(); // students.boarding
  await query(`CREATE TABLE IF NOT EXISTS du_rooms (
    id          BIGSERIAL PRIMARY KEY,
    madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
    name        TEXT NOT NULL,
    beds        INTEGER NOT NULL DEFAULT 0,
    teacher_id  TEXT,
    sort_order  INTEGER NOT NULL DEFAULT 0
  )`);
  await query(`CREATE TABLE IF NOT EXISTS du_room_places (
    student_id  TEXT PRIMARY KEY,
    madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
    room_id     BIGINT NOT NULL
  )`);
  await query(`CREATE TABLE IF NOT EXISTS du_night_register (
    madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
    student_id  TEXT NOT NULL,
    date        DATE NOT NULL,
    status      TEXT NOT NULL,
    marked_by   TEXT NOT NULL DEFAULT '',
    marked_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (student_id, date)
  )`);
  await query('CREATE INDEX IF NOT EXISTS du_night_register_madrasah_date ON du_night_register (madrasah_id, date)');
  await query(`CREATE TABLE IF NOT EXISTS du_home_weekends (
    id          BIGSERIAL PRIMARY KEY,
    madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
    name        TEXT NOT NULL DEFAULT '',
    starts      DATE NOT NULL,
    leave_time  TEXT NOT NULL DEFAULT '',
    ends        DATE NOT NULL,
    return_time TEXT NOT NULL DEFAULT ''
  )`);
  await query(`CREATE TABLE IF NOT EXISTS du_leaves (
    id           BIGSERIAL PRIMARY KEY,
    madrasah_id  INTEGER NOT NULL REFERENCES madaaris(id),
    student_id   TEXT NOT NULL,
    reason       TEXT NOT NULL DEFAULT '',
    collected_by TEXT NOT NULL DEFAULT '',
    out_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    out_by       TEXT NOT NULL DEFAULT '',
    back_due     DATE,
    back_at      TIMESTAMPTZ,
    back_by      TEXT NOT NULL DEFAULT ''
  )`);
  await query('CREATE INDEX IF NOT EXISTS du_leaves_madrasah ON du_leaves (madrasah_id, out_at)');
  await query(`CREATE TABLE IF NOT EXISTS du_health_log (
    id          BIGSERIAL PRIMARY KEY,
    madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
    student_id  TEXT NOT NULL,
    at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    kind        TEXT NOT NULL,
    note        TEXT NOT NULL DEFAULT '',
    medicine    TEXT NOT NULL DEFAULT '',
    dose        TEXT NOT NULL DEFAULT '',
    by_name     TEXT NOT NULL DEFAULT ''
  )`);
  await query('CREATE INDEX IF NOT EXISTS du_health_log_madrasah ON du_health_log (madrasah_id, at)');
  await query(`CREATE TABLE IF NOT EXISTS du_weekend_answers (
    madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
    weekend_id  BIGINT NOT NULL,
    student_id  TEXT NOT NULL,
    going       BOOLEAN NOT NULL,
    collector   TEXT NOT NULL DEFAULT '',
    answered_by TEXT NOT NULL DEFAULT '',
    answered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    waiting     BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (weekend_id, student_id)
  )`);
  await query('ALTER TABLE du_home_weekends ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ');
  await query('ALTER TABLE du_leaves ADD COLUMN IF NOT EXISTS weekend_id BIGINT');
  await query(`ALTER TABLE du_rooms ADD COLUMN IF NOT EXISTS block TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS level TEXT NOT NULL DEFAULT ''`);
  ready = true;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
// "Block A · Level 1 · Room 12" — the section as typed; a short level or room gets its word in front
// (src/lib/boardingRooms.js does the same).
const short = s => /^[A-Za-z0-9-]{1,4}$/.test(s);
const roomTitle = r => [r.block,
  r.level && (short(r.level) ? `Level ${r.level}` : r.level), short(r.name) ? `Room ${r.name}` : r.name].filter(Boolean).join(' · ');
const TIME = /^\d{2}:\d{2}$/;
const ukToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
const str = (v, n = 200) => String(v ?? '').trim().slice(0, n);
// Times are shown as the UK clock reads them.
const LONDON = col => `to_char(${col} AT TIME ZONE 'Europe/London', 'YYYY-MM-DD HH24:MI')`;
const LEAVE_COLS = `id::text AS id, student_id AS "studentId", reason, collected_by AS "collectedBy", ${LONDON('out_at')} AS "outAt",
  out_by AS "outBy", to_char(back_due, 'YYYY-MM-DD') AS "backDue", ${LONDON('back_at')} AS "backAt", back_by AS "backBy"`;
const HEALTH_COLS = `id::text AS id, student_id AS "studentId", ${LONDON('at')} AS at, kind, note, medicine, dose, by_name AS "by"`;
const WEEKEND_COLS = `id::text AS id, name, to_char(starts, 'YYYY-MM-DD') AS starts, leave_time AS "leaveTime",
  to_char(ends, 'YYYY-MM-DD') AS ends, return_time AS "returnTime", applied_at IS NOT NULL AS started`;
// The moment a home weekend's boarders leave, as a timestamp (UK time; 16:00 if no time was set).
const LEAVE_MOMENT = `((starts + COALESCE(NULLIF(leave_time, ''), '16:00')::time) AT TIME ZONE 'Europe/London')`;
// A home weekend still to come or going on now — the one parents answer about and staff work from.
const CURRENT_WEEKEND = `SELECT ${WEEKEND_COLS} FROM du_home_weekends WHERE madrasah_id = $1 AND ends >= $2 ORDER BY starts LIMIT 1`;
const ANSWER_COLS = `student_id AS "studentId", going, collector, answered_by AS "by", waiting`;

// Signs everyone out for a home weekend once its leave time has passed: every Active boarder except
// those staying (or still waiting to be collected) and anyone already out. Done once per weekend.
async function applyWeekends(mid) {
  const { rows } = await query(
    `SELECT id, to_char(ends, 'YYYY-MM-DD') AS ends, ${LEAVE_MOMENT} AS leave_at FROM du_home_weekends
     WHERE madrasah_id = $1 AND applied_at IS NULL AND ${LEAVE_MOMENT} <= now()`, [mid]);
  for (const w of rows) {
    await transaction(async c => {
      const { rowCount } = await c.query('UPDATE du_home_weekends SET applied_at = now() WHERE id = $1 AND madrasah_id = $2 AND applied_at IS NULL', [w.id, mid]);
      if (!rowCount || w.ends < ukToday()) return; // someone else just did it, or it's already over
      await c.query(
        `INSERT INTO du_leaves (madrasah_id, student_id, reason, collected_by, out_at, out_by, back_due, weekend_id)
         SELECT $1, s.id, 'Home weekend', COALESCE(a.collector, ''), $3, 'Home weekend', $4, $2
         FROM students s LEFT JOIN du_weekend_answers a ON a.weekend_id = $2 AND a.student_id = s.id AND a.madrasah_id = $1
         WHERE s.madrasah_id = $1 AND s.status = 'Active' AND s.boarding = 'Boarder'
           AND (a.student_id IS NULL OR (a.going AND NOT a.waiting))
           AND NOT EXISTS (SELECT 1 FROM du_leaves l WHERE l.madrasah_id = $1 AND l.student_id = s.id AND l.back_at IS NULL)`,
        [mid, w.id, w.leave_at, w.ends]);
    });
  }
}

// May this person use Boarding? The head of a Darul Uloom, or a teacher of one ticked for boarding duty.
async function access(req) {
  const mid = req.user.madrasahId;
  const { rows: [m] } = await query('SELECT kind FROM madaaris WHERE id = $1', [mid]);
  if (m?.kind !== 'darul_uloom') return false;
  if (isOwner(req)) return true;
  if (!req.user.teacherId) return false;
  const { rows } = await query('SELECT boarding_duty FROM teachers WHERE id = $1 AND madrasah_id = $2', [req.user.teacherId, mid]);
  return !!rows[0]?.boarding_duty;
}

async function boarderIds(mid) {
  const { rows } = await query(`SELECT id FROM students WHERE madrasah_id = $1 AND status = 'Active' AND boarding = 'Boarder'`, [mid]);
  return new Set(rows.map(r => r.id));
}

// The parent portal's part (server/routes/parent.js): the next home weekends, and this boarder's
// recent going-home record. Nothing about rooms, the night register or health.
async function forParent(mid, s) {
  if (s.boarding !== 'Boarder') return null;
  await ensure();
  await applyWeekends(mid);
  const [weekends, leaves] = await Promise.all([
    query(`SELECT ${WEEKEND_COLS} FROM du_home_weekends WHERE madrasah_id = $1 AND ends >= $2 ORDER BY starts LIMIT 3`, [mid, ukToday()]),
    query(`SELECT ${LEAVE_COLS} FROM du_leaves WHERE madrasah_id = $1 AND student_id = $2 ORDER BY out_at DESC LIMIT 10`, [mid, s.id]),
  ]);
  return {
    homeWeekends: weekends.rows.map(({ started, ...w }) => w),
    leaves: leaves.rows.map(({ outBy, backBy, ...l }) => l),
  };
}


const handler = requireAuth(async (req, res) => {
  await ensure();
  if (!(await access(req))) { res.status(403).json({ error: "You don't have access to this." }); return; }
  const mid = req.user.madrasahId;
  const head = isOwner(req);
  const action = req.query.action || '';
  const headOnly = () => { if (!head) res.status(403).json({ error: 'Only the head can change this.' }); return !head; };
  await applyWeekends(mid);

  if (req.method === 'GET' && action === 'student') {
    const sid = String(req.query.studentId || '');
    const { rows: st } = await query('SELECT 1 FROM students WHERE id = $1 AND madrasah_id = $2', [sid, mid]);
    if (!st.length) { res.status(404).json({ error: 'Not found' }); return; }
    const [room, leaves, health] = await Promise.all([
      query(`SELECT r.block, r.level, r.name FROM du_room_places p JOIN du_rooms r ON r.id = p.room_id AND r.madrasah_id = p.madrasah_id
             WHERE p.student_id = $1 AND p.madrasah_id = $2`, [sid, mid]),
      query(`SELECT ${LEAVE_COLS} FROM du_leaves WHERE madrasah_id = $1 AND student_id = $2 ORDER BY out_at DESC LIMIT 30`, [mid, sid]),
      query(`SELECT ${HEALTH_COLS} FROM du_health_log WHERE madrasah_id = $1 AND student_id = $2 ORDER BY at DESC LIMIT 30`, [mid, sid]),
    ]);
    res.status(200).json({ room: room.rows[0] ? roomTitle(room.rows[0]) : '', leaves: leaves.rows, health: health.rows });
    return;
  }

  if (req.method === 'GET') {
    const today = ukToday();
    const date = ISO.test(String(req.query.date || '')) && req.query.date <= today ? req.query.date : today;
    const [boarders, rooms, places, teachers, register, leaves, weekends, health] = await Promise.all([
      query(`SELECT id, forename, surname, class, allergies, medical, medication, parent1_name AS "parent1Name", parent1_phone AS "parent1Phone" FROM students
             WHERE madrasah_id = $1 AND status = 'Active' AND boarding = 'Boarder' ORDER BY forename, surname`, [mid]),
      query('SELECT id::text AS id, block, level, name, beds, teacher_id AS "teacherId" FROM du_rooms WHERE madrasah_id = $1 ORDER BY sort_order, name', [mid]),
      query('SELECT student_id, room_id::text AS room_id FROM du_room_places WHERE madrasah_id = $1', [mid]),
      query('SELECT id, name, boarding_duty AS "boardingDuty" FROM teachers WHERE madrasah_id = $1 ORDER BY sort_order NULLS LAST, name', [mid]),
      query(`SELECT student_id AS "studentId", status, marked_by AS "by", to_char(marked_at AT TIME ZONE 'Europe/London', 'HH24:MI') AS "time"
             FROM du_night_register WHERE madrasah_id = $1 AND date = $2`, [mid, date]),
      // Everyone out now (each boarder's own history is under their name — ?action=student).
      query(`SELECT ${LEAVE_COLS}, weekend_id::text AS "weekendId" FROM du_leaves WHERE madrasah_id = $1 AND back_at IS NULL ORDER BY out_at DESC`, [mid]),
      query(`SELECT ${WEEKEND_COLS} FROM du_home_weekends WHERE madrasah_id = $1 AND ends >= ($2::date - 60) ORDER BY starts`, [mid, today]),
      query(`SELECT ${HEALTH_COLS} FROM du_health_log WHERE madrasah_id = $1 AND at > now() - interval '31 days' ORDER BY at DESC`, [mid]),
    ]);
    const roomOf = Object.fromEntries(places.rows.map(p => [p.student_id, p.room_id]));
    // The home weekend to come (or on now), with everyone's answers and who has come back from it.
    const { rows: [weekend] } = await query(CURRENT_WEEKEND, [mid, today]);
    if (weekend) {
      const [answers, back] = await Promise.all([
        query(`SELECT ${ANSWER_COLS} FROM du_weekend_answers WHERE madrasah_id = $1 AND weekend_id = $2`, [mid, weekend.id]),
        query(`SELECT student_id FROM du_leaves WHERE madrasah_id = $1 AND weekend_id = $2 AND back_at IS NOT NULL`, [mid, weekend.id]),
      ]);
      weekend.answers = answers.rows;
      weekend.backIds = back.rows.map(r => r.student_id);
    }
    res.status(200).json({
      today, date, head, weekend: weekend || null,
      boarders: boarders.rows.map(s => ({ ...s, roomId: roomOf[s.id] || '' })),
      rooms: rooms.rows,
      teachers: teachers.rows,
      register: register.rows,
      leaves: leaves.rows,
      homeWeekends: weekends.rows,
      health: health.rows,
    });
    return;
  }

  if (req.method === 'POST' && action === 'rename') {
    if (headOnly()) return;
    const b = req.body || {};
    const to = str(b.to, 40);
    if (b.what === 'block') {
      await query('UPDATE du_rooms SET block = $1 WHERE madrasah_id = $2 AND block = $3', [to, mid, str(b.block, 40)]);
    } else if (b.what === 'level') {
      await query('UPDATE du_rooms SET level = $1 WHERE madrasah_id = $2 AND block = $3 AND level = $4', [to, mid, str(b.block, 40), str(b.level, 40)]);
    } else { res.status(400).json({ error: 'Rename what?' }); return; }
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'POST' && action === 'rooms') {
    if (headOnly()) return;
    const b = req.body || {};
    const block = str(b.block, 40), level = str(b.level, 40);
    const list = (Array.isArray(b.rooms) ? b.rooms : []).map(r => ({ name: str(r.name, 40), beds: Math.max(0, Math.min(500, parseInt(r.beds, 10) || 0)) }))
      .filter(r => r.name);
    if (!list.length) { res.status(400).json({ error: 'Write at least one room number.' }); return; }
    const names = list.map(r => r.name.toLowerCase());
    if (new Set(names).size !== names.length) { res.status(400).json({ error: 'The same room number is there twice.' }); return; }
    const teacherId = b.teacherId ? String(b.teacherId) : null;
    if (teacherId) {
      const { rows } = await query('SELECT 1 FROM teachers WHERE id = $1 AND madrasah_id = $2', [teacherId, mid]);
      if (!rows.length) { res.status(400).json({ error: 'Teacher not found.' }); return; }
    }
    const { rows: taken } = await query('SELECT name FROM du_rooms WHERE madrasah_id = $1 AND lower(block) = lower($2) AND lower(level) = lower($3) AND lower(name) = ANY($4)',
      [mid, block, level, names]);
    if (taken.length) { res.status(409).json({ error: `There is already a room ${taken.map(t => t.name).join(', ')} there.` }); return; }
    await transaction(async c => {
      for (const r of list) {
        await c.query(`INSERT INTO du_rooms (madrasah_id, block, level, name, beds, teacher_id, sort_order)
                       VALUES ($1,$2,$3,$4,$5,$6, (SELECT COALESCE(max(sort_order), 0) + 1 FROM du_rooms WHERE madrasah_id = $1))`,
          [mid, block, level, r.name, r.beds, teacherId]);
      }
    });
    res.status(200).json({ ok: true, added: list.length });
    return;
  }

  if (req.method === 'POST' && action === 'room') {
    if (headOnly()) return;
    const b = req.body || {};
    const name = str(b.name, 40);
    const block = str(b.block, 40), level = str(b.level, 40);
    const beds = Math.max(0, Math.min(500, parseInt(b.beds, 10) || 0));
    if (!name) { res.status(400).json({ error: 'Give the room a number or name.' }); return; }
    const teacherId = b.teacherId ? String(b.teacherId) : null;
    if (teacherId) {
      const { rows } = await query('SELECT 1 FROM teachers WHERE id = $1 AND madrasah_id = $2', [teacherId, mid]);
      if (!rows.length) { res.status(400).json({ error: 'Teacher not found.' }); return; }
    }
    const { rows: same } = await query('SELECT id::text AS id FROM du_rooms WHERE madrasah_id = $1 AND lower(block) = lower($2) AND lower(level) = lower($3) AND lower(name) = lower($4)',
      [mid, block, level, name]);
    if (same.some(r => r.id !== String(b.id || ''))) { res.status(409).json({ error: `There is already a room ${name} there.` }); return; }
    if (b.id) {
      const { rows: inRoom } = await query('SELECT count(*)::int AS n FROM du_room_places WHERE room_id = $1 AND madrasah_id = $2', [b.id, mid]);
      if (beds < inRoom[0].n) { res.status(400).json({ error: `${inRoom[0].n} boarders are in this room — move some out first.` }); return; }
      const { rowCount } = await query('UPDATE du_rooms SET name = $1, beds = $2, teacher_id = $3, block = $4, level = $5 WHERE id = $6 AND madrasah_id = $7',
        [name, beds, teacherId, block, level, b.id, mid]);
      if (!rowCount) { res.status(404).json({ error: 'Room not found.' }); return; }
    } else {
      await query(`INSERT INTO du_rooms (madrasah_id, name, beds, teacher_id, block, level, sort_order)
                   VALUES ($1,$2,$3,$4,$5,$6, (SELECT COALESCE(max(sort_order), 0) + 1 FROM du_rooms WHERE madrasah_id = $1))`, [mid, name, beds, teacherId, block, level]);
    }
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'DELETE' && action === 'room') {
    if (headOnly()) return;
    await transaction(async c => {
      await c.query('DELETE FROM du_room_places WHERE room_id = $1 AND madrasah_id = $2', [req.query.id, mid]);
      await c.query('DELETE FROM du_rooms WHERE id = $1 AND madrasah_id = $2', [req.query.id, mid]);
    });
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'POST' && action === 'place') {
    if (headOnly()) return;
    const b = req.body || {};
    const mine = await boarderIds(mid);
    const ids = (Array.isArray(b.studentIds) ? b.studentIds : []).map(String).filter(id => mine.has(id));
    if (!ids.length) { res.status(400).json({ error: 'Choose the boarders.' }); return; }
    if (!b.roomId) {
      await query('DELETE FROM du_room_places WHERE student_id = ANY($1) AND madrasah_id = $2', [ids, mid]);
      res.status(200).json({ ok: true });
      return;
    }
    const { rows: [room] } = await query('SELECT id, block, level, name, beds FROM du_rooms WHERE id = $1 AND madrasah_id = $2', [b.roomId, mid]);
    if (!room) { res.status(404).json({ error: 'Room not found.' }); return; }
    const { rows: [{ n }] } = await query('SELECT count(*)::int AS n FROM du_room_places WHERE room_id = $1 AND madrasah_id = $2 AND NOT (student_id = ANY($3))', [room.id, mid, ids]);
    if (n + ids.length > room.beds) {
      res.status(400).json({ error: `${roomTitle(room)} has ${room.beds} bed${room.beds === 1 ? "" : "s"} and ${n} ${n === 1 ? "is" : "are"} taken — room for ${Math.max(0, room.beds - n)} more.` });
      return;
    }
    await query(`INSERT INTO du_room_places (student_id, madrasah_id, room_id) SELECT unnest($1::text[]), $2, $3
                 ON CONFLICT (student_id) DO UPDATE SET room_id = EXCLUDED.room_id WHERE du_room_places.madrasah_id = EXCLUDED.madrasah_id`, [ids, mid, room.id]);
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'POST' && action === 'register') {
    const b = req.body || {};
    const today = ukToday();
    if (!ISO.test(String(b.date || '')) || b.date > today) { res.status(400).json({ error: 'Choose a night.' }); return; }
    if (b.status && !['in', 'away', 'sick'].includes(b.status)) { res.status(400).json({ error: 'In, Away or Sick.' }); return; }
    const mine = await boarderIds(mid);
    const ids = (Array.isArray(b.studentIds) ? b.studentIds : []).map(String).filter(id => mine.has(id));
    if (!ids.length) { res.status(400).json({ error: 'Choose the boarders.' }); return; }
    if (!b.status) {
      await query('DELETE FROM du_night_register WHERE student_id = ANY($1) AND date = $2 AND madrasah_id = $3', [ids, b.date, mid]);
    } else {
      const by = await whoName(req.user);
      await query(`INSERT INTO du_night_register (madrasah_id, student_id, date, status, marked_by) SELECT $1, unnest($2::text[]), $3, $4, $5
                   ON CONFLICT (student_id, date) DO UPDATE SET status = EXCLUDED.status, marked_by = EXCLUDED.marked_by, marked_at = now()
                   WHERE du_night_register.madrasah_id = EXCLUDED.madrasah_id`, [mid, ids, b.date, b.status, by]);
      // In tonight = back: anyone still signed out is signed back in.
      if (b.status === 'in' && b.date === today) {
        await query('UPDATE du_leaves SET back_at = now(), back_by = $1 WHERE madrasah_id = $2 AND student_id = ANY($3) AND back_at IS NULL', [by, mid, ids]);
      }
    }
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'POST' && action === 'out') {
    const b = req.body || {};
    const mine = await boarderIds(mid);
    const ids = (Array.isArray(b.studentIds) ? b.studentIds : []).map(String).filter(id => mine.has(id));
    if (!ids.length) { res.status(400).json({ error: 'Choose the boarders.' }); return; }
    const backDue = ISO.test(String(b.backDue || '')) ? b.backDue : null;
    const by = await whoName(req.user);
    // Anyone already out isn't signed out twice.
    const { rowCount } = await query(
      `INSERT INTO du_leaves (madrasah_id, student_id, reason, collected_by, out_by, back_due)
       SELECT $1, s, $3, $4, $5, $6 FROM unnest($2::text[]) AS s
       WHERE NOT EXISTS (SELECT 1 FROM du_leaves l WHERE l.madrasah_id = $1 AND l.student_id = s AND l.back_at IS NULL)`,
      [mid, ids, str(b.reason, 120), str(b.collectedBy, 120), by, backDue]);
    res.status(200).json({ ok: true, signedOut: rowCount });
    return;
  }

  if (req.method === 'POST' && ['answer', 'not-collected', 'collected'].includes(action)) {
    const b = req.body || {};
    const { rows: [w] } = await query(`SELECT id, to_char(ends, 'YYYY-MM-DD') AS ends, applied_at IS NOT NULL AS started FROM du_home_weekends WHERE id = $1 AND madrasah_id = $2`, [b.weekendId, mid]);
    if (!w) { res.status(404).json({ error: 'Home weekend not found.' }); return; }
    const mine = await boarderIds(mid);
    const ids = (Array.isArray(b.studentIds) ? b.studentIds : [b.studentId]).map(String).filter(id => mine.has(id));
    if (!ids.length) { res.status(400).json({ error: 'Choose the boarders.' }); return; }
    const by = await whoName(req.user);
    const upsert = (going, collector, waiting) => query(
      `INSERT INTO du_weekend_answers (madrasah_id, weekend_id, student_id, going, collector, answered_by, waiting)
       SELECT $1, $2, unnest($3::text[]), $4, $5, $6, $7
       ON CONFLICT (weekend_id, student_id) DO UPDATE SET going = EXCLUDED.going,
         collector = CASE WHEN EXCLUDED.collector = '' THEN du_weekend_answers.collector ELSE EXCLUDED.collector END,
         answered_by = EXCLUDED.answered_by, answered_at = now(), waiting = EXCLUDED.waiting
       WHERE du_weekend_answers.madrasah_id = EXCLUDED.madrasah_id`, [mid, w.id, ids, going, collector, by, waiting]);
    // Their sign-out from this weekend, if it's been made and they're not back.
    const dropLeave = () => query('DELETE FROM du_leaves WHERE madrasah_id = $1 AND weekend_id = $2 AND student_id = ANY($3) AND back_at IS NULL', [mid, w.id, ids]);
    if (action === 'answer') {
      if (typeof b.going !== 'boolean') { res.status(400).json({ error: 'Coming home or staying?' }); return; }
      await upsert(b.going, b.going ? str(b.collector, 120) : '', false);
      if (!b.going) await dropLeave();
    } else if (action === 'not-collected') {
      await dropLeave();
      await upsert(true, '', true);
    } else {
      await upsert(true, str(b.collectedBy, 120), false);
      await query(
        `INSERT INTO du_leaves (madrasah_id, student_id, reason, collected_by, out_by, back_due, weekend_id)
         SELECT $1, s, 'Home weekend', COALESCE((SELECT collector FROM du_weekend_answers WHERE weekend_id = $2 AND student_id = s), ''), $4, $5, $2
         FROM unnest($3::text[]) AS s
         WHERE NOT EXISTS (SELECT 1 FROM du_leaves l WHERE l.madrasah_id = $1 AND l.student_id = s AND l.back_at IS NULL)`,
        [mid, w.id, ids, by, w.ends]);
    }
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'POST' && action === 'back') {
    const b = req.body || {};
    const ids = (Array.isArray(b.leaveIds) ? b.leaveIds : []).map(String).filter(id => /^\d+$/.test(id));
    if (!ids.length) { res.status(400).json({ error: 'Choose who is back.' }); return; }
    const by = await whoName(req.user);
    const { rowCount } = await query(
      'UPDATE du_leaves SET back_at = now(), back_by = $1 WHERE id = ANY($2::bigint[]) AND madrasah_id = $3 AND back_at IS NULL', [by, ids, mid]);
    res.status(200).json({ ok: true, signedIn: rowCount });
    return;
  }

  if (req.method === 'DELETE' && action === 'leave') {
    if (headOnly()) return;
    await query('DELETE FROM du_leaves WHERE id = $1 AND madrasah_id = $2', [req.query.id, mid]);
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'POST' && action === 'home-weekend') {
    if (headOnly()) return;
    const b = req.body || {};
    if (!ISO.test(String(b.starts || '')) || !ISO.test(String(b.ends || '')) || b.ends < b.starts) {
      res.status(400).json({ error: 'Choose the day they go home and the day they come back.' }); return;
    }
    const vals = [str(b.name, 80) || 'Home weekend', b.starts, TIME.test(String(b.leaveTime || '')) ? b.leaveTime : '',
      b.ends, TIME.test(String(b.returnTime || '')) ? b.returnTime : ''];
    if (b.id) {
      const { rowCount } = await query(
        'UPDATE du_home_weekends SET name = $1, starts = $2, leave_time = $3, ends = $4, return_time = $5 WHERE id = $6 AND madrasah_id = $7', [...vals, b.id, mid]);
      if (!rowCount) { res.status(404).json({ error: 'Not found.' }); return; }
    } else {
      await query('INSERT INTO du_home_weekends (name, starts, leave_time, ends, return_time, madrasah_id) VALUES ($1,$2,$3,$4,$5,$6)', [...vals, mid]);
    }
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'DELETE' && action === 'home-weekend') {
    if (headOnly()) return;
    await query('DELETE FROM du_home_weekends WHERE id = $1 AND madrasah_id = $2', [req.query.id, mid]);
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'POST' && action === 'health') {
    const b = req.body || {};
    const mine = await boarderIds(mid);
    if (!mine.has(String(b.studentId || ''))) { res.status(400).json({ error: 'Choose the boarder.' }); return; }
    if (!['unwell', 'medicine'].includes(b.kind)) { res.status(400).json({ error: 'Unwell or medicine?' }); return; }
    if (b.kind === 'medicine' && !str(b.medicine)) { res.status(400).json({ error: 'Which medicine was given?' }); return; }
    if (b.kind === 'unwell' && !str(b.note)) { res.status(400).json({ error: 'Say what was wrong.' }); return; }
    const at = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(String(b.at || '')) ? b.at : null;
    const by = await whoName(req.user);
    await query(
      `INSERT INTO du_health_log (madrasah_id, student_id, at, kind, note, medicine, dose, by_name)
       VALUES ($1,$2, COALESCE($3::timestamp AT TIME ZONE 'Europe/London', now()), $4,$5,$6,$7,$8)`,
      [mid, b.studentId, at, b.kind, str(b.note, 500), str(b.medicine, 120), str(b.dose, 80), by]);
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'DELETE' && action === 'health') {
    if (headOnly()) return;
    await query('DELETE FROM du_health_log WHERE id = $1 AND madrasah_id = $2', [req.query.id, mid]);
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}, { teacher: true });

module.exports = handler;
module.exports.ensure = ensure;
module.exports.forParent = forParent;
