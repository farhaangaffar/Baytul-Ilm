const { query } = require('./_db');
const { requireAuth } = require('./_auth');

// Spell dates out in full (e.g. "10 October 2022") for anything handed to the model —
// a bare "2022-10-10" is unambiguous to us, but the model has been observed misreading
// ISO dates in prose as DD/MM or otherwise garbling them. No ambiguity possible this way.
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function formatDateLong(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTH_NAMES[m - 1]} ${y}`;
}

// Merged with the ai_summaries persistence endpoint (GET/PUT) rather than a
// separate file — Vercel's Hobby plan caps a deployment at 12 serverless
// functions, and this app was already at that limit.
async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS ai_summaries (
      id           BIGSERIAL PRIMARY KEY,
      student_id   TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      month        TEXT NOT NULL,
      summary      TEXT NOT NULL DEFAULT '',
      instructions TEXT NOT NULL DEFAULT '',
      updated_at   TIMESTAMP NOT NULL DEFAULT now(),
      UNIQUE (student_id, month)
    )
  `);
  // Added after the table already existed in production — ALTER rather than
  // relying on CREATE TABLE IF NOT EXISTS, which is a no-op once the table exists.
  await query(`ALTER TABLE ai_summaries ADD COLUMN IF NOT EXISTS behavior TEXT NOT NULL DEFAULT ''`);
}

module.exports = requireAuth(async (req, res) => {
  if (req.query.action === 'ask') {
    // "Ask AI" — free-form questions over the whole school's data (fees, attendance),
    // not tied to one student/month like the rest of this file. Aggregates are computed
    // here in SQL/JS so the numbers Claude reports back are exact, not model arithmetic.
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) { res.status(500).json({ error: 'Server is not configured (no ANTHROPIC_API_KEY set)' }); return; }
    const { question, year } = req.body || {};
    if (!question || !year) { res.status(400).json({ error: 'question and year are required' }); return; }

    const [studentsRes, classesRes, feesRes, attendanceRes, yearsRes, allFeesRes, allAttRes] = await Promise.all([
      query('SELECT id, forename, surname, dob, class, weekly_fee, enroll_date, status FROM students ORDER BY class, forename'),
      query(`SELECT c.name AS class_name, t.name AS teacher_name, t.phone AS teacher_phone, t.email AS teacher_email
             FROM classes c LEFT JOIN teachers t ON t.id = c.teacher_id ORDER BY c.name`),
      query('SELECT student_id, week_starting, amount, status FROM fees WHERE year = $1', [year]),
      query('SELECT student_id, date, status FROM attendance WHERE year = $1', [year]),
      query('SELECT year FROM academic_years ORDER BY year'),
      query('SELECT year, amount, status FROM fees'),
      query('SELECT year, status FROM attendance'),
    ]);

    // ── Per-student annual totals, and a per-student/per-calendar-month breakdown so
    // "how much did X pay in <month>" is answerable, not just year-to-date totals.
    // (Calendar months, not the app's Monday-boundary "school months" — close enough for
    // Q&A and far simpler than replicating that boundary logic here.)
    const feeAgg = {};   // student_id -> { billed, collected }
    const feeByMonth = {}; // student_id -> { 'YYYY-MM' -> { billed, collected } }
    const schoolMonthTotals = {}; // 'YYYY-MM' -> { billed, collected } (whole school)
    feesRes.rows.forEach(f => {
      const a = feeAgg[f.student_id] || (feeAgg[f.student_id] = { billed: 0, collected: 0 });
      a.billed += Number(f.amount);
      if (f.status === 'Paid') a.collected += Number(f.amount);
      const month = f.week_starting.slice(0, 7);
      const perStudentMonth = (feeByMonth[f.student_id] || (feeByMonth[f.student_id] = {}));
      const m = perStudentMonth[month] || (perStudentMonth[month] = { billed: 0, collected: 0 });
      m.billed += Number(f.amount);
      if (f.status === 'Paid') m.collected += Number(f.amount);
      const sm = schoolMonthTotals[month] || (schoolMonthTotals[month] = { billed: 0, collected: 0 });
      sm.billed += Number(f.amount);
      if (f.status === 'Paid') sm.collected += Number(f.amount);
    });

    const attAgg = {};
    const attByMonth = {};
    const schoolAttMonthTotals = {};
    attendanceRes.rows.forEach(r => {
      const a = attAgg[r.student_id] || (attAgg[r.student_id] = { present: 0, late: 0, absent: 0 });
      if (r.status === 'P') a.present++; else if (r.status === 'L') a.late++; else if (r.status === 'A') a.absent++;
      const month = r.date.slice(0, 7);
      const perStudentMonth = (attByMonth[r.student_id] || (attByMonth[r.student_id] = {}));
      const m = perStudentMonth[month] || (perStudentMonth[month] = { present: 0, late: 0, absent: 0 });
      if (r.status === 'P') m.present++; else if (r.status === 'L') m.late++; else if (r.status === 'A') m.absent++;
      const sm = schoolAttMonthTotals[month] || (schoolAttMonthTotals[month] = { present: 0, late: 0, absent: 0 });
      if (r.status === 'P') sm.present++; else if (r.status === 'L') sm.late++; else if (r.status === 'A') sm.absent++;
    });

    let totalBilled = 0, totalCollected = 0;
    const studentLines = studentsRes.rows.map(s => {
      const fee = feeAgg[s.id] || { billed: 0, collected: 0 };
      const att = attAgg[s.id] || { present: 0, late: 0, absent: 0 };
      totalBilled += fee.billed;
      totalCollected += fee.collected;
      const totalDays = att.present + att.late + att.absent;
      const pct = totalDays ? Math.round(((att.present + att.late) / totalDays) * 100) : null;
      const monthBits = Object.entries(feeByMonth[s.id] || {}).sort().map(([m, v]) => `${m}: billed £${v.billed.toFixed(2)}, collected £${v.collected.toFixed(2)}`).join('; ');
      const attMonthBits = Object.entries(attByMonth[s.id] || {}).sort().map(([m, v]) => `${m}: P${v.present}/L${v.late}/A${v.absent}`).join('; ');
      return `- ${s.forename} ${s.surname} (${s.class}, ${s.status}), DOB ${formatDateLong(s.dob) || 'not on file'}, enrolled ${formatDateLong(s.enroll_date) || 'not on file'}, weekly fee £${Number(s.weekly_fee).toFixed(2)}: fees billed £${fee.billed.toFixed(2)}, collected £${fee.collected.toFixed(2)}, outstanding £${(fee.billed - fee.collected).toFixed(2)}; attendance — present ${att.present}, late ${att.late}, absent ${att.absent}${pct !== null ? ` (${pct}% present/late)` : ' (no days recorded)'}${monthBits ? `; fees by month — ${monthBits}` : ''}${attMonthBits ? `; attendance by month — ${attMonthBits}` : ''}`;
    }).join('\n');

    const classLines = classesRes.rows.map(c => `- ${c.class_name}: teacher ${c.teacher_name || 'unassigned'}${c.teacher_phone ? `, ${c.teacher_phone}` : ''}${c.teacher_email ? `, ${c.teacher_email}` : ''}`).join('\n');

    const monthlyFeeLines = Object.keys(schoolMonthTotals).sort().map(m => {
      const v = schoolMonthTotals[m];
      return `- ${m}: billed £${v.billed.toFixed(2)}, collected £${v.collected.toFixed(2)}, outstanding £${(v.billed - v.collected).toFixed(2)}`;
    }).join('\n');

    const monthlyAttLines = Object.keys(schoolAttMonthTotals).sort().map(m => {
      const v = schoolAttMonthTotals[m];
      return `- ${m}: present ${v.present}, late ${v.late}, absent ${v.absent}`;
    }).join('\n');

    // ── Year-over-year: every academic year on file gets a coarse total (not the
    // full per-student detail above, which is only fetched for the selected year) so
    // "how does this year compare to last year" is answerable.
    const yearFeeTotals = {};
    allFeesRes.rows.forEach(f => {
      const y = yearFeeTotals[f.year] || (yearFeeTotals[f.year] = { billed: 0, collected: 0 });
      y.billed += Number(f.amount);
      if (f.status === 'Paid') y.collected += Number(f.amount);
    });
    const yearAttTotals = {};
    allAttRes.rows.forEach(r => {
      const y = yearAttTotals[r.year] || (yearAttTotals[r.year] = { present: 0, late: 0, absent: 0 });
      if (r.status === 'P') y.present++; else if (r.status === 'L') y.late++; else if (r.status === 'A') y.absent++;
    });
    const yearLines = yearsRes.rows.map(({ year: y }) => {
      const f = yearFeeTotals[y] || { billed: 0, collected: 0 };
      const a = yearAttTotals[y] || { present: 0, late: 0, absent: 0 };
      return `- ${y}: fees billed £${f.billed.toFixed(2)}, collected £${f.collected.toFixed(2)}; attendance — present ${a.present}, late ${a.late}, absent ${a.absent}`;
    }).join('\n');

    const todayISO = new Date().toISOString().split('T')[0];
    const currentMonthKey = todayISO.slice(0, 7);
    const currentMonthLabel = `${MONTH_NAMES[Number(currentMonthKey.slice(5, 7)) - 1]} ${currentMonthKey.slice(0, 4)}`;
    const contextBlock = `Today's date: ${formatDateLong(todayISO)}\nThe current calendar month is ${currentMonthLabel} (${currentMonthKey}) — if a question says "this month" without naming one, it means this.\nAcademic year being asked about (unless the question names another): ${year}\n\n`
      + `Classes and teachers:\n${classLines || '(none set up)'}\n\n`
      + `Every academic year on file, with year-level totals:\n${yearLines || '(none)'}\n\n`
      + `Whole-school fee totals for ${year} (year to date): billed £${totalBilled.toFixed(2)}, collected £${totalCollected.toFixed(2)}, outstanding £${(totalBilled - totalCollected).toFixed(2)}\n\n`
      + `Whole-school fees by calendar month for ${year}:\n${monthlyFeeLines || '(no fee records yet)'}\n\n`
      + `Whole-school attendance by calendar month for ${year}:\n${monthlyAttLines || '(no attendance records yet)'}\n\n`
      + `Per-student data for ${year} (includes date of birth, enrolment date, and a month-by-month fee breakdown):\n${studentLines}`;

    const prompt = `You are a helpful assistant for a madrasah (Islamic school) administrator, answering questions about their school — students, classes, teachers, fees, and attendance, across any academic year on file. Answer ONLY using the data below — do not guess or invent figures. Be concise and give exact numbers. Reply in plain text with no markdown formatting (no asterisks, headings, or bullet lists). Month breakdowns use calendar months (YYYY-MM), which may run a few days off the app's own Monday-to-Monday "school month" boundaries — mention that only if it matters to the answer. All dates in the data below are written out in full (e.g. "10 October 2022" — day, then month name, then year) specifically so there's no ambiguity; read and report them exactly as given, never reformatted into a numeric DD/MM or MM/DD style. When the question asks you to identify a specific record — the earliest, latest, highest, lowest, and so on — actually find it by comparing the relevant field across every student in the data and name that student directly in your answer (e.g. "Your earliest-enrolled student is [name], enrolled [date]"); do not just restate the category being asked about or describe what you would look for. If the data genuinely doesn't cover what's being asked, say so plainly rather than guessing.\n\nData:\n${contextBlock}\n\nQuestion: ${question}`;

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text().catch(() => '');
      res.status(502).json({ error: `AI request failed: ${errText.slice(0, 200)}` });
      return;
    }

    const data = await anthropicRes.json();
    const answer = (data.content || []).map(c => c.text || '').join('');
    if (!answer.trim()) {
      // Anthropic returned 200 but no usable text (e.g. stop_reason cut it off before any
      // content, or an unexpected response shape) — surfacing this as a blank reply left
      // the admin staring at an empty box with no indication anything went wrong. Log the
      // raw response for diagnosis and tell the user plainly instead of failing silently.
      console.error('ask-ai: empty answer from Anthropic', JSON.stringify({ stop_reason: data.stop_reason, content: data.content }));
      res.status(502).json({ error: "The AI didn't return an answer that time — please try asking again, maybe rephrased." });
      return;
    }
    res.status(200).json({ answer });
    return;
  }

  if (req.method === 'GET') {
    await ensureTable();
    const { studentId, month } = req.query;
    if (studentId) {
      const { rows } = await query(
        `SELECT student_id AS "studentId", month, summary, instructions, behavior, updated_at AS "updatedAt"
         FROM ai_summaries WHERE student_id = $1 ORDER BY month DESC`,
        [studentId]
      );
      res.status(200).json(rows);
      return;
    }
    if (month) {
      const { rows } = await query(
        `SELECT student_id AS "studentId", month, summary, instructions, behavior, updated_at AS "updatedAt"
         FROM ai_summaries WHERE month = $1`,
        [month]
      );
      res.status(200).json(rows);
      return;
    }
    res.status(400).json({ error: 'studentId or month is required' });
    return;
  }

  if (req.method === 'PUT') {
    await ensureTable();
    const { studentId, month, summary, instructions, behavior } = req.body || {};
    if (!studentId || !month) { res.status(400).json({ error: 'studentId and month are required' }); return; }
    // behavior is optional on this call (e.g. the AI-summary "Add to report" flow
    // doesn't know it) — COALESCE keeps whatever was saved before when omitted,
    // rather than clobbering it with ''.
    await query(
      `INSERT INTO ai_summaries (student_id, month, summary, instructions, behavior, updated_at)
       VALUES ($1,$2,$3,$4,COALESCE($5,''),now())
       ON CONFLICT (student_id, month) DO UPDATE SET summary = EXCLUDED.summary, instructions = EXCLUDED.instructions, behavior = COALESCE($5, ai_summaries.behavior), updated_at = now()`,
      [studentId, month, summary || '', instructions || '', behavior === undefined ? null : behavior]
    );
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'POST') {
    // Generate a fresh summary via Claude. Doesn't persist — the frontend
    // saves it separately (PUT, "Add to report") once the teacher is happy with it.
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) { res.status(500).json({ error: 'Server is not configured (no ANTHROPIC_API_KEY set)' }); return; }
    const { prompt } = req.body || {};
    if (!prompt) { res.status(400).json({ error: 'prompt is required' }); return; }

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text().catch(() => '');
      res.status(502).json({ error: `AI request failed: ${errText.slice(0, 200)}` });
      return;
    }

    const data = await anthropicRes.json();
    const summary = (data.content || []).map(c => c.text || '').join('');
    res.status(200).json({ summary });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
});
