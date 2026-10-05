const crypto = require('crypto');
const { query, transaction } = require('./db');
const { ensureUsersTable, hashPassword } = require('./auth');
const { ensureParentTables } = require('./parents');

// Demo madaaris ("Try the demo" on the sign-in screen). Each visitor gets a private
// copy of a made-up madrasah — three classes, eighteen children, about ten weeks of
// attendance, fees, daily records, Qur'an progress and finished reports — with a head,
// a teacher and a parent login they can switch between. Nothing in it is real, it can't
// reach any other madrasah (it's an ordinary madrasah to the rest of the API), and it
// deletes itself after DEMO_HOURS: expired demos stop signing in (server/auth.js) and
// are cleared out whenever someone starts a new one, so no timer is needed.
// madaaris.demo_until marks a demo; real madaaris have NULL.

const DEMO_HOURS = 24;
const MAX_LIVE = 300;          // demos existing at once
const MAX_PER_HOUR = 60;       // demos started in the last hour, everyone together
const MAX_PER_IP_HOUR = 6;     // … and from one address

// Every table holding a madrasah's data, children before parents, for deleting a demo.
const TABLES = [
  'ai_usage', 'absence_reports', 'parent_students', 'users', 'ai_summaries', 'quran_progress', 'quran_students',
  'daily_records', 'fees', 'fee_skips', 'fee_weeks_off', 'attendance', 'terms', 'students', 'classes', 'teachers',
  'academic_years', 'settings',
];

// Make sure every table the demo fills exists (a fresh database creates most of them on
// first use of their page).
async function ensureAllTables() {
  await ensureUsersTable();
  await ensureParentTables();
  const routes = ['students', 'terms', 'attendance', 'classes', 'teachers', 'settings', 'ai-summary', 'fees', 'quran'];
  for (const r of routes) await require(`./routes/${r}`).ensure();
  await query(`CREATE TABLE IF NOT EXISTS ai_usage (
    id BIGSERIAL PRIMARY KEY, madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
    kind TEXT NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT now())`);
}

// Deletes expired demos (a few at a time, so starting a demo stays quick).
async function clearExpired(limit = 5) {
  const { rows } = await query('SELECT id FROM madaaris WHERE demo_until IS NOT NULL AND demo_until < now() ORDER BY demo_until LIMIT $1', [limit]);
  if (!rows.length) return 0;
  const ids = rows.map(r => r.id);
  await transaction(async c => {
    for (const t of TABLES) await c.query(`DELETE FROM ${t} WHERE madrasah_id = ANY($1)`, [ids]);
    await c.query('DELETE FROM madaaris WHERE id = ANY($1) AND demo_until IS NOT NULL', [ids]);
  });
  return ids.length;
}

// null when a new demo may start, or the reason it can't.
async function tooMany(ipHash) {
  const { rows: [r] } = await query(
    `SELECT count(*) FILTER (WHERE demo_until > now()) AS live,
            count(*) FILTER (WHERE created_at > now() - interval '1 hour') AS hour,
            count(*) FILTER (WHERE created_at > now() - interval '1 hour' AND demo_ip = $1) AS mine
     FROM madaaris WHERE demo_until IS NOT NULL`, [ipHash]);
  if (Number(r.mine) >= MAX_PER_IP_HOUR) return "You've started a few demos already — please try again in an hour.";
  if (Number(r.live) >= MAX_LIVE || Number(r.hour) >= MAX_PER_HOUR) return 'The demo is busy right now — please try again a little later.';
  return null;
}

// ── Dates (plain YYYY-MM-DD, worked in UTC) ──
const iso = d => d.toISOString().slice(0, 10);
const day = s => new Date(s + 'T12:00:00Z');
const plus = (s, n) => { const d = day(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const dow = s => day(s).getUTCDay();
const mondayOf = s => plus(s, -((dow(s) + 6) % 7));
function firstMondayOf(y, m) { let s = `${y}-${String(m).padStart(2, '0')}-01`; while (dow(s) !== 1) s = plus(s, 1); return s; }
// School months run from their first Monday (src/lib/store.js); a week belongs to its Monday's.
function schoolMonthOf(s) {
  const y = Number(s.slice(0, 4)), m = Number(s.slice(5, 7));
  if (s >= firstMondayOf(y, m)) return [y, m];
  return m === 1 ? [y - 1, 12] : [y, m - 1];
}
const nextMonth = ([y, m]) => (m === 12 ? [y + 1, 1] : [y, m + 1]);
const prevMonth = ([y, m]) => (m === 1 ? [y - 1, 12] : [y, m - 1]);
const monthKey = ([y, m]) => `${y}-${String(m).padStart(2, '0')}`;
function yearLabel(s) { // the academic year a date's week falls in
  const mon = mondayOf(s);
  const y = Number(mon.slice(0, 4));
  const start = mon >= firstMondayOf(y, 9) ? y : y - 1;
  return `${String(start).slice(2)}-${String(start + 1).slice(2)}`;
}
const inAugust = s => schoolMonthOf(s)[1] === 8; // the summer break: no classes, no fees

// ── Qur'an positions (Hafs; same numbering as src/lib/quran.js) ──
const AYAHS = [7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,54,53,89,59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,14,11,11,18,12,12,30,52,52,44,28,28,20,56,40,31,50,40,46,42,29,19,36,25,22,17,19,26,30,20,15,21,11,8,8,19,5,8,8,11,11,8,3,9,5,4,7,3,6,3,5,4,5,6];
const OFFSET = []; AYAHS.reduce((t, n, i) => { OFFSET[i] = t; return t + n; }, 0);
const pos = (s, a) => OFFSET[s - 1] + a - 1;
function at(p) { let s = 1; while (s < 114 && OFFSET[s] <= p) s++; return [s, p - OFFSET[s - 1] + 1]; }
// Revision portions from juz 29 and 30, as surah ranges.
const MANZIL = {
  30: [[78, 79], [80, 82], [83, 85], [86, 89], [90, 93], [94, 100], [101, 107], [108, 114]],
  29: [[67, 67], [68, 69], [70, 71], [72, 74], [75, 77]],
};

// ── The made-up madrasah ──
const TEACHERS = [
  { key: 'yusuf', name: 'Ustadh Yusuf Ahmed', phone: '07700 900101', email: 'yusuf@example.com', subjects: ["Qur'an", 'Hifdh'] },
  { key: 'maryam', name: 'Ustadhah Maryam Khan', phone: '07700 900102', email: 'maryam@example.com', subjects: ["Qur'an", 'Tajweed'] },
  { key: 'bilal', name: 'Ustadh Bilal Hussain', phone: '07700 900103', email: 'bilal@example.com', subjects: ["Qaa'idah", 'Islamic studies'] },
];
const CLASSES = [
  { key: 'hifz', name: 'Hifdh Class', teacher: 'yusuf', type: 'hifz' },
  { key: 'nazira', name: 'Naazhirah Class', teacher: 'maryam', type: 'nazira' },
  { key: 'qaida', name: "Qaa'idah Class", teacher: 'bilal', type: 'qaida' },
];
// start: hifz → [surah, ayah] of the next new lesson; nazira → where reading starts;
// qaida → lesson number. pace: ayahs (or lessons every few days). prior: juz memorised before.
const STUDENTS = [
  { f: 'Ibrahim', s: 'Rahman', g: 'm', c: 'hifz', start: [67, 1], pace: 4, prior: [30], family: 'rahman' },
  { f: 'Zakariyya', s: 'Ali', g: 'm', c: 'hifz', start: [2, 1], pace: 3, prior: [29, 30] },
  { f: 'Hamzah', s: 'Begum', g: 'm', c: 'hifz', start: [3, 93], pace: 4, prior: [1, 2, 3, 30], arrears: true },
  { f: 'Sumayyah', s: 'Patel', g: 'f', c: 'hifz', start: [78, 1], pace: 5, prior: [] },
  { f: 'Maryam', s: 'Iqbal', g: 'f', c: 'hifz', start: [36, 1], pace: 3, prior: [30], advance: true },
  { f: 'Adam', s: 'Hussain', g: 'm', c: 'hifz', start: [2, 142], pace: 3, prior: [30], left: 14 },
  { f: 'Fatimah', s: 'Siddiqui', g: 'f', c: 'nazira', start: [2, 1], pace: 15, advance: true },
  { f: 'Musa', s: 'Chowdhury', g: 'm', c: 'nazira', start: [4, 1], pace: 12 },
  { f: 'Khadijah', s: 'Mahmood', g: 'f', c: 'nazira', start: [7, 1], pace: 18 },
  { f: 'Umar', s: 'Shah', g: 'm', c: 'nazira', start: [10, 1], pace: 10, arrears: true },
  { f: 'Hafsah', s: 'Akhtar', g: 'f', c: 'nazira', start: [12, 1], pace: 14 },
  { f: 'Yahya', s: 'Rashid', g: 'm', c: 'nazira', start: [18, 1], pace: 10, joined: 21 },
  { f: 'Aisha', s: 'Rahman', g: 'f', c: 'qaida', start: 4, pace: 3, family: 'rahman', fee: 6 },
  { f: 'Isa', s: 'Karim', g: 'm', c: 'qaida', start: 2, pace: 4 },
  { f: 'Zainab', s: 'Hassan', g: 'f', c: 'qaida', start: 7, pace: 3, advance: true },
  { f: 'Idris', s: 'Mirza', g: 'm', c: 'qaida', start: 9, pace: 3 },
  { f: 'Ruqayyah', s: 'Aziz', g: 'f', c: 'qaida', start: 5, pace: 4 },
  { f: 'Sulaiman', s: 'Farooq', g: 'm', c: 'qaida', start: 12, pace: 3 },
];
const PARENT_NAMES = { m: ['Abdullah', 'Mohammed', 'Ahmed', 'Imran', 'Tariq', 'Faisal'], f: ['Amina', 'Sarah', 'Nadia', 'Saima', 'Rukhsana', 'Huda'] };

// Seeded random numbers, so each demo differs a little but every list is consistent.
function rng(seed) {
  let a = seed >>> 0;
  const next = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  next.pick = list => list[Math.floor(next() * list.length)];
  next.chance = p => next() < p;
  return next;
}

const COMMENTS = {
  hifz: [
    ['Settled quickly and recited the new lesson with confidence.', 'Excellent focus during Hifdh time.', ''],
    ['Good effort today; needed a few prompts on the Muraaja\'ah.', 'Helped a younger student with their lesson.', 'Revision at home needs more attention.'],
    ['Recited clearly with good tajweed.', 'Very well prepared.', ''],
    ['Took a while to settle but finished the lesson.', 'Polite and respectful.', 'Chatting during revision time.'],
    ['Strong recitation — the lesson was secure first time.', 'Consistent effort all week.', ''],
    ['Lesson was shaky on the last few ayaat; we will go over it again.', 'Kept trying without giving up.', 'Mixing up similar ayaat.'],
  ],
  nazira: [
    ['Read fluently and kept a steady pace.', 'Good makharij today.', ''],
    ['Needed help with a few long vowels (madd).', 'Listened carefully to corrections.', 'Rushing when reading.'],
    ['Lovely clear reading.', 'Very attentive.', ''],
    ['Reading is improving week by week.', 'Asked good questions about the meaning.', ''],
    ['A little distracted today, but read the full portion.', '', 'Needs to bring their Qur\'an every day.'],
  ],
  qaida: [
    ['Recognised all the letters on the page.', 'Very enthusiastic learner.', ''],
    ['Practised joining letters; getting there.', 'Tries hard.', 'Confusing similar letters.'],
    ['Read the lesson well and moved on to the next page.', 'Great listening.', ''],
    ['Needed extra practice with harakaat.', 'Kind to classmates.', 'Finding it hard to sit still.'],
    ['Neat progress today.', 'Remembered last week\'s lesson.', ''],
  ],
};

// A finished report summary (the kind the AI writes from a child's records), made up.
function demoSummary(st, type, r) {
  const he = st.g === 'm' ? 'He' : 'She', his = st.g === 'm' ? 'his' : 'her', him = st.g === 'm' ? 'him' : 'her';
  const open = r.pick([
    `${st.f} has had a ${r.pick(['very positive', 'steady', 'good', 'productive'])} month at the madrasah.`,
    `It has been a ${r.pick(['pleasure', 'joy'])} teaching ${st.f} this month.`,
  ]);
  const attitude = r.pick([
    `${he} arrives ready to learn, is respectful to ${his} teachers and gets on well with ${his} classmates.`,
    `${he} has shown a good attitude in class and is polite and well mannered.`,
    `${he} works hard in lessons, although ${he.toLowerCase()} can sometimes lose focus towards the end of the day.`,
  ]);
  const quran = {
    hifz: r.pick([
      `${his[0].toUpperCase() + his.slice(1)} Hifdh Jadeed has moved forward at a steady pace, and ${his} Muraaja'ah is becoming more secure.`,
      `${he} has kept up ${his} new lessons well; a few portions needed repeating, which is a normal part of strengthening Hifdh.`,
    ]),
    nazira: r.pick([
      `${his[0].toUpperCase() + his.slice(1)} Naazhirah reading has become more fluent, with clearer pronunciation of the letters.`,
      `${he} has covered a good amount of reading this month and is learning to apply the rules of madd more consistently.`,
    ]),
    qaida: r.pick([
      `${he} has progressed well through the Qaa'idah and is now more confident joining letters.`,
      `${he} is recognising the letters and harakaat more quickly and has moved on to new lessons.`,
    ]),
  }[type];
  const rec = r.pick([
    `We would encourage ${him} to revise for ten minutes at home each day to keep building on this progress.`,
    `Reading with ${him} at home a few times a week would help ${him} grow in confidence.`,
    `Keep up the good work — we look forward to seeing ${him} continue to grow next month.`,
  ]);
  return `${open} ${attitude}\n\n${quran} ${rec} JazakAllahu khairan for your support.`;
}

// The demo's own children by name (a child added during the demo counts as a boy).
const genderOf = forename => STUDENTS.find(st => st.f === forename)?.g || 'm';

const newId = prefix => prefix + crypto.randomBytes(6).toString('hex');

async function bulk(c, table, cols, rows) {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const values = [];
    const tuples = chunk.map(row => `(${row.map(v => { values.push(v); return `$${values.length}`; }).join(',')})`);
    await c.query(`INSERT INTO ${table} (${cols.join(',')}) VALUES ${tuples.join(',')}`, values);
  }
}

// Builds a new demo madrasah; returns its id.
async function createDemo(ipHash) {
  const r = rng(crypto.randomBytes(4).readUInt32LE(0));
  const today = iso(new Date());
  // About nine teaching weeks of history (the summer break doesn't count).
  let startMonday = mondayOf(today);
  for (let n = 0; n < 9; startMonday = plus(startMonday, -7)) if (!inAugust(plus(startMonday, -7))) n++;
  const schoolDays = [1, 2, 3, 4];
  const curMonth = schoolMonthOf(today);
  const curMonthEnd = firstMondayOf(...nextMonth(curMonth));
  // The month whose reports are finished: this one if it's nearly over, otherwise the
  // one before (skipping August).
  let reportMonth = curMonth;
  if (plus(today, 7) < curMonthEnd) { reportMonth = prevMonth(curMonth); if (reportMonth[1] === 8) reportMonth = prevMonth(reportMonth); }
  const reportStart = firstMondayOf(...reportMonth), reportEnd = firstMondayOf(...nextMonth(reportMonth));

  const days = [];
  for (let d = startMonday; d < today; d = plus(d, 1)) if (schoolDays.includes(dow(d)) && !inAugust(d)) days.push(d);
  const weeks = [];
  for (let w = startMonday; w < curMonthEnd; w = plus(w, 7)) weeks.push(w);

  return transaction(async c => {
    const code = `demo-${crypto.randomBytes(5).toString('hex')}`;
    const { rows: [m] } = await c.query(
      `INSERT INTO madaaris (name, code, demo_until, demo_ip) VALUES ('Demo Madrasah', $1, now() + interval '${DEMO_HOURS} hours', $2) RETURNING id`,
      [code, ipHash]
    );
    const mid = m.id;
    await c.query(
      `INSERT INTO settings (id, madrasah_id, school_name, school_name_arabic, default_weekly_fee, fee_frequency, report_period,
         currency_symbol, parent_portal, school_days, fee_auto, fee_auto_since)
       VALUES ($1, $1, 'Demo Madrasah', 'مدرسة تجريبية', 8, 'weekly', 'monthly', '£', true, $2, true, $3)`,
      [mid, schoolDays, startMonday]
    );
    const years = [...new Set([...days.map(yearLabel), yearLabel(today)])];
    await bulk(c, 'academic_years', ['madrasah_id', 'year'], years.map(y => [mid, y]));

    const teacherIds = {};
    await bulk(c, 'teachers', ['id', 'madrasah_id', 'name', 'phone', 'email', 'subjects', 'sort_order'],
      TEACHERS.map((t, i) => { teacherIds[t.key] = newId('T'); return [teacherIds[t.key], mid, t.name, t.phone, t.email, JSON.stringify(t.subjects), i]; }));
    const classIds = {};
    await bulk(c, 'classes', ['id', 'madrasah_id', 'name', 'teacher_id', 'quran_type'],
      CLASSES.map(cl => { classIds[cl.key] = newId('C'); return [classIds[cl.key], mid, cl.name, teacherIds[cl.teacher], cl.type]; }));
    const className = Object.fromEntries(CLASSES.map(cl => [cl.key, cl.name]));

    // Students, with the dates they're on the register.
    const kids = STUDENTS.map((st, i) => {
      const enroll = st.joined ? mondayOf(plus(today, -st.joined)) : plus(startMonday, -(200 + Math.floor(r() * 400)));
      const leave = st.left ? plus(today, -st.left) : null;
      const born = plus(today, -Math.round((st.c === 'hifz' ? 11 : st.c === 'nazira' ? 9 : 6.5) * 365 + r() * 500));
      const fam = st.family ? 'rahman' : null;
      const p1 = fam ? 'Abdullah' : r.pick(PARENT_NAMES.m), p2 = fam ? 'Amina' : r.pick(PARENT_NAMES.f);
      return { ...st, id: newId('S'), enroll, leave, born, p1, p2, fee: st.fee || 8, order: i,
        onRoll: d => d >= enroll && (!leave || d < leave) };
    });
    await bulk(c, 'students',
      ['id', 'madrasah_id', 'forename', 'surname', 'dob', 'class', 'parent1_name', 'parent1_phone', 'parent2_name', 'parent2_phone',
        'weekly_fee', 'enroll_date', 'leave_date', 'status', 'notes', 'sort_order'],
      kids.map(k => [k.id, mid, k.f, k.s, k.born, className[k.c], `${k.p1} ${k.s}`, k.family ? '07700 900500' : `07700 9${String(10000 + k.order * 37).slice(-5)}`,
        `${k.p2} ${k.s}`, k.family ? '07700 900501' : '', k.fee, k.enroll, k.leave, k.leave ? 'Inactive' : 'Active', k.leave ? 'Moved to another area.' : '', k.order]));

    // Attendance, daily records and Qur'an progress, day by day.
    const att = [], recs = [], quran = [];
    const present = {};
    for (const k of kids) {
      const type = CLASSES.find(cl => cl.key === k.c).type;
      let p = Array.isArray(k.start) ? pos(...k.start) : k.start; // ayah position, or lesson number
      let lessonDays = 0;
      const sabaqs = [];
      const prior = k.prior || [];
      const manzil = [...(prior.includes(30) ? MANZIL[30] : []), ...(prior.includes(29) ? MANZIL[29] : [])];
      let manzilAt = Math.floor(r() * 8);
      for (const d of days) {
        if (!k.onRoll(d)) continue;
        const roll = r();
        const status = roll < (k.arrears ? 0.12 : 0.05) ? 'A' : roll < 0.12 ? 'L' : 'P';
        att.push([mid, yearLabel(d), k.id, d, status, status === 'L' ? `17:${String(5 + Math.floor(r() * 20)).padStart(2, '0')}` : null]);
        if (status === 'A') continue;
        (present[k.id] = present[k.id] || []).push(d);
        if (r.chance(0.35)) {
          const [comment, positive, negative] = r.pick(COMMENTS[type]);
          recs.push([mid, k.id, d, comment, positive, negative]);
        }
        const grade = () => { const g = r(); return g < 0.75 ? 'good' : g < 0.93 ? 'weak' : 'repeat'; };
        if (type === 'hifz') {
          const last = sabaqs[sabaqs.length - 1];
          const from = last && last.grade === 'repeat' ? last.from : p;
          const to = Math.min(from + k.pace - 1 + Math.floor(r() * 2), 6235);
          const g = grade();
          quran.push([mid, k.id, d, 'sabaq', ...at(from), ...at(to), '', g, g === 'repeat' ? 'Repeat tomorrow.' : '']);
          // Muraaja'ah Qareebah: the last few days' lessons, up to today's.
          if (sabaqs.length) {
            const back = sabaqs[Math.max(0, sabaqs.length - 5)].from;
            if (back < from) quran.push([mid, k.id, d, 'sabqi', ...at(back), ...at(from - 1), '', grade(), '']);
          }
          if (manzil.length && r.chance(0.8)) {
            const [s1, s2] = manzil[manzilAt++ % manzil.length];
            quran.push([mid, k.id, d, 'manzil', s1, 1, s2, AYAHS[s2 - 1], '', grade(), '']);
          }
          sabaqs.push({ from, grade: g });
          if (g !== 'repeat') p = to + 1;
        } else if (type === 'nazira') {
          const to = Math.min(p + k.pace - 1 + Math.floor(r() * 5), 6235);
          quran.push([mid, k.id, d, 'reading', ...at(p), ...at(to), '', grade(), '']);
          p = to + 1;
        } else {
          const g = grade();
          quran.push([mid, k.id, d, 'lesson', null, null, null, null, `Lesson ${p} — page ${p * 2 + 3}`, g, '']);
          if (++lessonDays >= k.pace && g === 'good') { p++; lessonDays = 0; }
        }
      }
    }
    await bulk(c, 'attendance', ['madrasah_id', 'year', 'student_id', 'date', 'status', 'late_time'], att);
    await bulk(c, 'daily_records', ['madrasah_id', 'student_id', 'date', 'comment', 'positive', 'negative'], recs);
    await bulk(c, 'quran_progress',
      ['madrasah_id', 'student_id', 'date', 'kind', 'from_surah', 'from_ayah', 'to_surah', 'to_ayah', 'lesson', 'grade', 'note'], quran);
    await bulk(c, 'quran_students', ['student_id', 'madrasah_id', 'prior_juz'],
      kids.filter(k => k.c === 'hifz').map(k => [k.id, mid, k.prior]));

    // Fees: every week but the summer break, up to the end of this school month (it's all
    // due when the month starts). Earlier weeks are mostly paid; a couple of families are
    // behind; some have paid this month in advance.
    const curStart = firstMondayOf(...curMonth);
    const off = weeks.filter(inAugust);
    if (off.length) await bulk(c, 'fee_weeks_off', ['madrasah_id', 'year', 'week_starting'], off.map(w => [mid, yearLabel(w), w]));
    const fees = [];
    for (const k of kids) {
      for (const w of weeks) {
        if (inAugust(w) || !(k.enroll < plus(w, 7) && (!k.leave || k.leave >= w))) continue;
        let paid;
        if (w < curStart) paid = r.chance(0.97);
        else paid = k.advance || (w <= today && r.chance(0.6));
        if (k.arrears && w >= plus(today, -24)) paid = false; // behind for the last few weeks
        let paidDate = null;
        if (paid) paidDate = w < curStart ? plus(w, Math.floor(r() * 4)) : k.advance ? curStart : w;
        if (paidDate && paidDate > today) paidDate = today;
        fees.push([mid, yearLabel(w), k.id, 'week', w, k.fee, paid ? 'Paid' : 'Pending', paidDate]);
      }
    }
    await bulk(c, 'fees', ['madrasah_id', 'year', 'student_id', 'period', 'week_starting', 'amount', 'status', 'paid_date'], fees);

    // Finished reports for last month, for the children who were there.
    const sums = kids
      .filter(k => (present[k.id] || []).some(d => d >= reportStart && d < reportEnd))
      .map(k => [mid, k.id, monthKey(reportMonth), demoSummary(k, CLASSES.find(cl => cl.key === k.c).type, r), '',
        r.chance(0.6) ? 'Excellent' : 'Good']);
    await bulk(c, 'ai_summaries', ['madrasah_id', 'student_id', 'month', 'summary', 'instructions', 'behavior'], sums);

    // Logins: the head, Ustadh Yusuf (the Hifdh class), and the Rahman family (two children).
    // Their passwords are random and never shown — the demo signs in through /api/demo.
    const pw = () => hashPassword(crypto.randomBytes(18).toString('base64'));
    await c.query(`INSERT INTO users (madrasah_id, login, password_hash, role) VALUES ($1, 'head', $2, 'owner')`, [mid, pw()]);
    await c.query(`INSERT INTO users (madrasah_id, login, password_hash, role, teacher_id) VALUES ($1, 'ustadh.yusuf', $2, 'teacher', $3)`, [mid, pw(), teacherIds.yusuf]);
    const { rows: [parent] } = await c.query(`INSERT INTO users (madrasah_id, login, password_hash, role) VALUES ($1, 'rahman.family', $2, 'parent') RETURNING id`, [mid, pw()]);
    const family = kids.filter(k => k.family === 'rahman');
    await bulk(c, 'parent_students', ['user_id', 'student_id', 'madrasah_id'], family.map(k => [parent.id, k.id, mid]));
    // The family has told the madrasah about an appointment on the next school day.
    let next = plus(today, 1);
    while (!schoolDays.includes(dow(next))) next = plus(next, 1);
    await c.query(
      `INSERT INTO absence_reports (madrasah_id, student_id, date, reason, note, reported_by) VALUES ($1, $2, $3, 'Appointment', 'Dentist after school — sorry!', $4)`,
      [mid, family[0].id, next, parent.id]
    );
    return mid;
  });
}

module.exports = { DEMO_HOURS, ensureAllTables, clearExpired, tooMany, createDemo, demoSummary, genderOf, rng };
