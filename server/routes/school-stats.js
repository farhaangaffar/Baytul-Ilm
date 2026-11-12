const { query } = require('../db');
const { requireAuth } = require('../auth');

// A school's Stats page (src/pages/SchoolStats.js; head only): the comparisons a madrasah's Stats page makes for attendance
// and fees, made for Islamic Studies — surahs, du'aas, practicals — and for homework. Everything is a percentage of what's
// been assessed (or set), never a count, so a 1-form year and a 3-form year compare fairly; a year group is all its forms
// together, and its forms can be compared side by side.
//   GET ?kind=surah|duaa|practical&year=26-27   year groups (+ their forms), the hardest items, each assessment point by
//                                               year group, and year over year. This year = the marks as they are now;
//                                               an earlier year = its last assessment point.
//   GET ?kind=homework&year=26-27               homework set, done on time / late, and the quiz average, by year group and form
const KINDS = ['surah', 'duaa', 'practical'];

// The academic year a date falls in, '26-27' (September to August).
function academicYear(d = new Date()) {
  const y = d.getFullYear() % 100, m = d.getMonth() + 1;
  const a = m >= 9 ? y : y - 1;
  return `${String(a).padStart(2, '0')}-${String(a + 1).padStart(2, '0')}`;
}
const yearRange = label => {
  const a = 2000 + Number(String(label).slice(0, 2));
  return [`${a}-09-01`, `${a + 1}-09-01`];
};
const pct = (n, d) => (d ? Math.round((n / d) * 100) : null);
const blank = () => ({ achieved: 0, withHelp: 0, incomplete: 0, notAssessed: 0 });
function add(t, level) {
  if (level === 3) t.achieved++; else if (level === 2) t.withHelp++; else if (level === 1) t.incomplete++; else t.notAssessed++;
}
const withPct = t => { const done = t.achieved + t.withHelp + t.incomplete; return { ...t, pct: pct(t.achieved, done), helpPct: pct(t.withHelp, done), incPct: pct(t.incomplete, done) }; };

// Pupils (each with their class and year group then) and a way to read their mark for an item → totals by year group, by
// form, the whole school, and each item's incomplete / with help (for "hardest").
function tally(pupils, items, levelOf) {
  const school = blank(), groups = new Map(), byItem = new Map();
  for (const p of pupils) {
    if (p.yearGroup === null || p.yearGroup === undefined) continue;
    const mine = items.filter(i => i.year_group === p.yearGroup);
    if (!mine.length) continue;
    if (!groups.has(p.yearGroup)) groups.set(p.yearGroup, { total: blank(), forms: new Map() });
    const g = groups.get(p.yearGroup);
    if (!g.forms.has(p.class)) g.forms.set(p.class, { total: blank(), pupils: 0 });
    const f = g.forms.get(p.class);
    f.pupils++;
    for (const it of mine) {
      const lv = levelOf(p, it);
      add(school, lv); add(g.total, lv); add(f.total, lv);
      if (lv === 1 || lv === 2) {
        const b = byItem.get(it.id) || { id: it.id, name: it.name, yearGroup: it.year_group, incomplete: 0, withHelp: 0 };
        if (lv === 1) b.incomplete++; else b.withHelp++;
        byItem.set(it.id, b);
      }
    }
  }
  const yearGroups = [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([yg, g]) => ({
    yearGroup: yg, ...withPct(g.total),
    forms: [...g.forms.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
      .map(([name, f]) => ({ name, pupils: f.pupils, ...withPct(f.total) })),
  }));
  const hardest = [...byItem.values()].sort((a, b) => b.incomplete - a.incomplete || b.withHelp - a.withHelp).slice(0, 5);
  return { school: withPct(school), yearGroups, hardest };
}

module.exports = requireAuth(async (req, res) => {
  const mid = req.user.madrasahId;
  const { rows: [m] } = await query('SELECT kind FROM madaaris WHERE id = $1', [mid]);
  if (m?.kind !== 'school') { res.status(403).json({ error: 'This is only for a school.' }); return; }
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  await require('./studies').ensure();
  await require('./school-reports').ensure();

  const current = academicYear();
  const { rows: points } = await query(
    `SELECT id::text AS id, year, name, taken_at AS "takenAt" FROM is_assessments WHERE madrasah_id = $1 ORDER BY taken_at, id`, [mid]);
  const years = [...new Set([current, ...points.map(p => p.year)])].sort().reverse();
  const year = years.includes(String(req.query.year)) ? String(req.query.year) : current;
  const kind = String(req.query.kind || 'surah');

  const { rows: classes } = await query('SELECT name, year_group AS "yearGroup" FROM classes WHERE madrasah_id = $1', [mid]);
  const ygOf = Object.fromEntries(classes.map(c => [c.name, c.yearGroup]));

  if (kind === 'homework') {
    const [from, to] = yearRange(year);
    const { rows: hw } = await query(
      `SELECT h.id, c.name AS class, h.due, h.all_pupils AS "allPupils", h.kind, h.quiz->>'title' AS title, to_char(h.set_at, 'YYYY-MM') AS month,
         (SELECT count(*)::int FROM is_homework_pupils p WHERE p.homework_id = h.id) AS chosen,
         (SELECT count(*)::int FROM students s WHERE s.madrasah_id = h.madrasah_id AND s.class = c.name AND s.status = 'Active') AS class_size,
         (SELECT count(*)::int FROM is_homework_done d WHERE d.homework_id = h.id) AS done,
         (SELECT count(*)::int FROM is_homework_done d WHERE d.homework_id = h.id AND h.due IS NOT NULL AND (d.done_at AT TIME ZONE 'Europe/London')::date > h.due) AS late,
         (SELECT json_agg(b.best) FROM (SELECT max(a.score / NULLIF(a.max, 0)) AS best FROM is_quiz_attempts a WHERE a.homework_id = h.id AND a.waiting = 0 GROUP BY a.student_id) b) AS quiz
       FROM is_homework h JOIN classes c ON c.id = h.class_id AND c.madrasah_id = h.madrasah_id
       WHERE h.madrasah_id = $1 AND NOT h.draft AND h.set_at >= $2 AND h.set_at < $3 ORDER BY h.set_at, h.id`, [mid, from, to]);
    const make = () => ({ set: 0, assigned: 0, done: 0, late: 0, quizSum: 0, quizN: 0 });
    const school = make(), groups = new Map(), months = new Map(), quizzes = [];
    for (const h of hw) {
      const yg = ygOf[h.class];
      const assigned = h.allPupils ? h.class_size : h.chosen;
      if (!months.has(h.month)) months.set(h.month, make());
      const rows = [school, months.get(h.month)];
      if (h.kind === 'quiz') {
        const qs = (h.quiz || []).filter(q => q !== null).map(Number);
        quizzes.push({ id: String(h.id), title: h.title || 'Quiz', class: h.class, handedIn: qs.length, assigned,
          avg: qs.length ? Math.round((qs.reduce((a, b) => a + b, 0) / qs.length) * 100) : null });
      }
      if (yg !== null && yg !== undefined) {
        if (!groups.has(yg)) groups.set(yg, { total: make(), forms: new Map() });
        const g = groups.get(yg);
        if (!g.forms.has(h.class)) g.forms.set(h.class, make());
        rows.push(g.total, g.forms.get(h.class));
      }
      for (const t of rows) {
        t.set++; t.assigned += assigned; t.done += Math.min(h.done, assigned || h.done); t.late += h.late;
        for (const q of h.quiz || []) { if (q !== null) { t.quizSum += Number(q); t.quizN++; } }
      }
    }
    const out = t => ({ set: t.set, donePct: pct(t.done, t.assigned), onTimePct: pct(t.done - t.late, t.assigned), latePct: pct(t.late, t.assigned),
      quizAvg: t.quizN ? Math.round((t.quizSum / t.quizN) * 100) : null });
    res.status(200).json({
      kind, year, years, current,
      school: out(school),
      months: [...months.entries()].sort().map(([month, t]) => ({ month, ...out(t) })),
      quizzes: quizzes.reverse().slice(0, 8),
      yearGroups: [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([yg, g]) => ({
        yearGroup: yg, ...out(g.total),
        forms: [...g.forms.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true })).map(([name, f]) => ({ name, ...out(f) })),
      })),
    });
    return;
  }

  if (!KINDS.includes(kind)) { res.status(400).json({ error: 'Unknown list' }); return; }
  const { rows: items } = await query(
    'SELECT id::text AS id, name, year_group FROM is_items WHERE madrasah_id = $1 AND kind = $2 AND year_group IS NOT NULL', [mid, kind]);

  // A snapshot (an assessment point) as pupils + a mark lookup.
  async function snapshot(id) {
    const { rows } = await query(
      'SELECT student_id AS id, class, year_group AS "yearGroup", marks FROM is_assessment_pupils WHERE assessment_id = $1 AND madrasah_id = $2', [id, mid]);
    return tally(rows, items, (p, it) => Number((p.marks || {})[it.id]) || 0);
  }

  // The year groups and their forms: this year from the marks now; an earlier year from its last assessment point.
  let main;
  const ofYear = points.filter(p => p.year === year);
  if (year === current) {
    const { rows: pupils } = await query(`SELECT id, class FROM students WHERE madrasah_id = $1 AND status = 'Active'`, [mid]);
    pupils.forEach(p => { p.yearGroup = ygOf[p.class]; });
    const { rows: marks } = await query(
      `SELECT p.student_id, p.item_id::text AS item, p.level FROM is_progress p JOIN is_items i ON i.id = p.item_id AND i.madrasah_id = p.madrasah_id
       WHERE p.madrasah_id = $1 AND i.kind = $2`, [mid, kind]);
    const lv = new Map(marks.map(r => [`${r.student_id}|${r.item}`, r.level]));
    main = tally(pupils, items, (p, it) => lv.get(`${p.id}|${it.id}`) || 0);
  } else {
    main = ofYear.length ? await snapshot(ofYear[ofYear.length - 1].id) : tally([], items, () => 0);
  }

  // Through the year: each of this year's assessment points, by year group.
  const through = [];
  for (const p of ofYear) {
    const t = await snapshot(p.id);
    through.push({ name: p.name, takenAt: p.takenAt, school: t.school.pct, yearGroups: t.yearGroups.map(g => ({ yearGroup: g.yearGroup, pct: g.pct })) });
  }

  // Year over year: each earlier year's last point, then this year now.
  const overYears = [];
  for (const y of [...years].reverse()) {
    if (y === current) { const now = year === current ? main : null; overYears.push({ year: y, pct: now ? now.school.pct : null, soFar: true }); continue; }
    const last = points.filter(p => p.year === y).pop();
    if (last) overYears.push({ year: y, pct: (await snapshot(last.id)).school.pct, point: last.name });
  }
  if (year !== current) {
    const i = overYears.findIndex(r => r.year === current);
    if (i >= 0 && overYears[i].pct === null) {
      const { rows: pupils } = await query(`SELECT id, class FROM students WHERE madrasah_id = $1 AND status = 'Active'`, [mid]);
      pupils.forEach(p => { p.yearGroup = ygOf[p.class]; });
      const { rows: marks } = await query(
        `SELECT p.student_id, p.item_id::text AS item, p.level FROM is_progress p JOIN is_items i ON i.id = p.item_id AND i.madrasah_id = p.madrasah_id
         WHERE p.madrasah_id = $1 AND i.kind = $2`, [mid, kind]);
      const lv = new Map(marks.map(r => [`${r.student_id}|${r.item}`, r.level]));
      overYears[i].pct = tally(pupils, items, (p, it) => lv.get(`${p.id}|${it.id}`) || 0).school.pct;
    }
  }

  res.status(200).json({ kind, year, years, current, fromPoint: year === current ? null : ofYear[ofYear.length - 1]?.name || null,
    ...main, through, overYears });
});
