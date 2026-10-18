const { query } = require('../db');
const { getUser } = require('../auth');
const { ensureParentTables, childIds, portalOn, ABSENCE_REASONS } = require('../parents');

// The parent portal's whole API. Only parent logins get past the check below, and
// everything they can read is about their own children — never another student's
// name or records, nor the class list, teachers' details or anything else staff use.
//   GET               → { children: [...], absenceReasons }
//   GET ?studentId=   → one child's attendance, fees, finished reports, Qur'aan
//                       progress, published exam results (a Darul Uloom) and the absences this family has reported
//   POST ?action=absence {studentId, date, reason, note} → tell the madrasah
//   POST ?action=details {studentId, ...PARENT_EDITABLE} → update their contacts, health and
//                       going home (the head sees "Updated by parent" on the child)
// When the madrasah has the portal switched off (Settings), every call says so.

const ISO = /^\d{4}-\d{2}-\d{2}$/;

// What a parent may change about their own child: contacts, home, emergency contact, health and
// going home — never the name, date of birth, class, fee or anything the madrasah decides.
const PARENT_EDITABLE = ['parent1Name', 'parent1Phone', 'parent2Name', 'parent2Phone',
  'parent1Relation', 'parent1Email', 'parent2Relation', 'parent2Email', 'mainContact', 'address', 'postcode',
  'emergencyName', 'emergencyRelation', 'emergencyPhone', 'allergies', 'medical', 'medication', 'walksHome', 'collectors'];
const COLUMN = {
  parent1Name: ['parent1_name', 120], parent1Phone: ['parent1_phone', 40], parent2Name: ['parent2_name', 120], parent2Phone: ['parent2_phone', 40],
  ...Object.fromEntries(require('./students').DETAILS.map(([key, col, n]) => [key, [col, n]])),
};
// Health and going home are the child's own; the rest (contacts, home, emergency contact) is the
// family's, so it's updated for all of this login's children at once.
const CHILD_ONLY = new Set(['allergies', 'medical', 'medication', 'walksHome']);
const detailsOf = s => Object.fromEntries(PARENT_EDITABLE.map(k => [k, s[COLUMN[k][0]] || '']));

// A Darul Uloom's published exams this child sat — their own report cards only.
async function publishedExams(mid, s) {
  const { rows: [m] } = await query('SELECT kind FROM madaaris WHERE id = $1', [mid]);
  if (m?.kind !== 'darul_uloom') return [];
  return require('./exams').studentExamCards(mid, s, { publishedOnly: true });
}

module.exports = async (req, res) => {
  const user = await getUser(req);
  if (!user) { res.status(401).json({ error: 'Not authenticated' }); return; }
  if (user.role !== 'parent') { res.status(403).json({ error: "You don't have access to this." }); return; }
  await ensureParentTables();
  const mid = user.madrasahId;
  if (!(await portalOn(mid))) { res.status(403).json({ error: 'The parent portal is switched off at this madrasah.', portalOff: true }); return; }
  const mine = await childIds(user);

  if (req.method === 'GET' && !req.query.studentId) {
    const { rows } = await query(
      `SELECT id, forename, surname, class, status FROM students WHERE id = ANY($1) AND madrasah_id = $2 ORDER BY forename`,
      [[...mine], mid]
    );
    res.status(200).json({ children: rows, absenceReasons: ABSENCE_REASONS });
    return;
  }

  if (req.method === 'GET') {
    const sid = req.query.studentId;
    if (!mine.has(sid)) { res.status(403).json({ error: "You don't have access to this." }); return; }
    const one = (sql, params = []) => query(sql, [sid, mid, ...params]).catch(() => ({ rows: [] }));
    const [st, att, fees, sums, terms, quran, prior, absences, cls] = await Promise.all([
      one('SELECT * FROM students WHERE id = $1 AND madrasah_id = $2'),
      one("SELECT year, date, status, late_time FROM attendance WHERE student_id = $1 AND madrasah_id = $2 ORDER BY date"),
      one('SELECT id, year, period, week_starting, amount, status, paid_date FROM fees WHERE student_id = $1 AND madrasah_id = $2 ORDER BY week_starting'),
      // Finished reports only — a saved summary, not the teacher's daily notes.
      one(`SELECT month, summary, behavior, updated_at FROM ai_summaries WHERE student_id = $1 AND madrasah_id = $2 AND summary <> '' ORDER BY month DESC`),
      query('SELECT id, year, name, start_date, end_date FROM terms WHERE madrasah_id = $1 ORDER BY start_date', [mid]).catch(() => ({ rows: [] })),
      one('SELECT * FROM quran_progress WHERE student_id = $1 AND madrasah_id = $2 ORDER BY date, id'),
      one('SELECT * FROM quran_students WHERE student_id = $1 AND madrasah_id = $2'),
      one('SELECT date, reason, note, seen, created_at FROM absence_reports WHERE student_id = $1 AND madrasah_id = $2 ORDER BY date DESC LIMIT 20'),
      one(`SELECT c.quran_type, t.name AS teacher_name FROM students s
           JOIN classes c ON c.name = s.class AND c.madrasah_id = s.madrasah_id
           LEFT JOIN teachers t ON t.id = c.teacher_id
           WHERE s.id = $1 AND s.madrasah_id = $2`),
    ]);
    const s = st.rows[0];
    if (!s) { res.status(404).json({ error: 'Not found' }); return; }
    const exams = await publishedExams(mid, s).catch(() => []);
    res.status(200).json({
      student: {
        id: s.id, forename: s.forename, surname: s.surname, class: s.class, status: s.status,
        enrollDate: s.enroll_date, leaveDate: s.leave_date, weeklyFee: Number(s.weekly_fee),
      },
      details: detailsOf(s),
      teacherName: cls.rows[0]?.teacher_name || '',
      // The child's own level if set, else their class's (a mixed class has none to show).
      quranType: ['hifz', 'nazira', 'qaida'].includes(prior.rows[0]?.quran_type) ? prior.rows[0].quran_type
        : (['hifz', 'nazira', 'qaida'].includes(cls.rows[0]?.quran_type) ? cls.rows[0].quran_type : null),
      attendance: att.rows.map(r => ({ year: r.year, date: r.date, status: r.status, lateTime: r.late_time })),
      fees: fees.rows.map(r => ({ id: String(r.id), studentId: sid, year: r.year, period: r.period || 'week', weekStarting: r.week_starting, amount: Number(r.amount), status: r.status, paidDate: r.paid_date })),
      reports: sums.rows.map(r => ({ month: r.month, summary: r.summary, behavior: r.behavior, updatedAt: r.updated_at })),
      terms: terms.rows.map(t => ({ id: String(t.id), year: t.year, name: t.name, startDate: t.start_date, endDate: t.end_date })),
      quran: {
        entries: quran.rows.map(r => ({ id: String(r.id), date: r.date, kind: r.kind, fromSurah: r.from_surah, fromAyah: r.from_ayah, toSurah: r.to_surah, toAyah: r.to_ayah, lesson: r.lesson, grade: r.grade, unit: r.unit || 'ayah' })),
        priorJuz: prior.rows[0]?.prior_juz || [],
      },
      absences: absences.rows,
      exams,
    });
    return;
  }

  if (req.method === 'POST' && req.query.action === 'absence') {
    const b = req.body || {};
    if (!mine.has(b.studentId)) { res.status(403).json({ error: "You don't have access to this." }); return; }
    if (!ISO.test(String(b.date || ''))) { res.status(400).json({ error: 'Choose the date they will be absent.' }); return; }
    if (!ABSENCE_REASONS.includes(b.reason)) { res.status(400).json({ error: 'Choose a reason.' }); return; }
    const today = new Date().toISOString().slice(0, 10);
    if (b.date < today) { res.status(400).json({ error: "That date has passed — please contact the madrasah directly." }); return; }
    await query(
      `INSERT INTO absence_reports (madrasah_id, student_id, date, reason, note, reported_by) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (student_id, date) DO UPDATE SET reason = EXCLUDED.reason, note = EXCLUDED.note, reported_by = EXCLUDED.reported_by, seen = false, created_at = now()`,
      [mid, b.studentId, b.date, b.reason, String(b.note || '').slice(0, 500), user.id]
    );
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'POST' && req.query.action === 'details') {
    const b = req.body || {};
    if (!mine.has(b.studentId)) { res.status(403).json({ error: "You don't have access to this." }); return; }
    if (!String(b.parent1Name || '').trim() || !String(b.parent1Phone || '').trim()) { res.status(400).json({ error: 'Keep at least the first contact\'s name and phone number.' }); return; }
    await require('./students').ensure();
    const update = async (keys, ids) => {
      const sets = [], values = [];
      for (const k of keys) {
        if (b[k] === undefined) continue;
        const [col, n] = COLUMN[k];
        values.push(String(b[k] ?? '').trim().slice(0, n)); sets.push(`${col} = $${values.length}`);
      }
      if (!sets.length) return;
      values.push(ids, mid);
      await query(`UPDATE students SET ${sets.join(', ')}, parent_updated_at = now() WHERE id = ANY($${values.length - 1}) AND madrasah_id = $${values.length}`, values);
    };
    await update(PARENT_EDITABLE.filter(k => CHILD_ONLY.has(k)), [b.studentId]);
    await update(PARENT_EDITABLE.filter(k => !CHILD_ONLY.has(k)), [...mine]);
    const { rows } = await query('SELECT * FROM students WHERE id = $1 AND madrasah_id = $2', [b.studentId, mid]);
    res.status(200).json({ ok: true, details: rows[0] ? detailsOf(rows[0]) : {} });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
