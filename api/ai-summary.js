const { query } = require('./_db');
const { requireAuth } = require('./_auth');

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

    const [studentsRes, feesRes, attendanceRes] = await Promise.all([
      query('SELECT id, forename, surname, class, weekly_fee, status FROM students'),
      query('SELECT student_id, amount, status FROM fees WHERE year = $1', [year]),
      query('SELECT student_id, status FROM attendance WHERE year = $1', [year]),
    ]);

    const feeAgg = {};
    feesRes.rows.forEach(f => {
      const a = feeAgg[f.student_id] || (feeAgg[f.student_id] = { billed: 0, collected: 0 });
      a.billed += Number(f.amount);
      if (f.status === 'Paid') a.collected += Number(f.amount);
    });
    const attAgg = {};
    attendanceRes.rows.forEach(r => {
      const a = attAgg[r.student_id] || (attAgg[r.student_id] = { present: 0, late: 0, absent: 0 });
      if (r.status === 'P') a.present++;
      else if (r.status === 'L') a.late++;
      else if (r.status === 'A') a.absent++;
    });

    let totalBilled = 0, totalCollected = 0;
    const studentLines = studentsRes.rows.map(s => {
      const fee = feeAgg[s.id] || { billed: 0, collected: 0 };
      const att = attAgg[s.id] || { present: 0, late: 0, absent: 0 };
      totalBilled += fee.billed;
      totalCollected += fee.collected;
      const totalDays = att.present + att.late + att.absent;
      const pct = totalDays ? Math.round(((att.present + att.late) / totalDays) * 100) : null;
      return `- ${s.forename} ${s.surname} (${s.class}, ${s.status}): fees billed £${fee.billed.toFixed(2)}, collected £${fee.collected.toFixed(2)}, outstanding £${(fee.billed - fee.collected).toFixed(2)}; attendance — present ${att.present}, late ${att.late}, absent ${att.absent}${pct !== null ? ` (${pct}% present/late)` : ' (no days recorded)'}`;
    }).join('\n');

    const contextBlock = `Academic year: ${year}\nTotal fees billed (all students, year to date): £${totalBilled.toFixed(2)}\nTotal fees collected: £${totalCollected.toFixed(2)}\nTotal outstanding: £${(totalBilled - totalCollected).toFixed(2)}\n\nPer-student data:\n${studentLines}`;

    const prompt = `You are a helpful assistant for a madrasah (Islamic school) administrator, answering questions about their students' fees and attendance. Answer ONLY using the data below — do not guess or invent figures. Be concise and give exact numbers. Reply in plain text with no markdown formatting (no asterisks, headings, or bullet lists). If the data doesn't cover what's being asked, say so plainly.\n\nData:\n${contextBlock}\n\nQuestion: ${question}`;

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
