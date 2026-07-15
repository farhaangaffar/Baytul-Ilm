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
}

module.exports = requireAuth(async (req, res) => {
  if (req.method === 'GET') {
    await ensureTable();
    const { studentId, month } = req.query;
    if (studentId) {
      const { rows } = await query(
        `SELECT student_id AS "studentId", month, summary, instructions, updated_at AS "updatedAt"
         FROM ai_summaries WHERE student_id = $1 ORDER BY month DESC`,
        [studentId]
      );
      res.status(200).json(rows);
      return;
    }
    if (month) {
      const { rows } = await query(
        `SELECT student_id AS "studentId", month, summary, instructions, updated_at AS "updatedAt"
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
    const { studentId, month, summary, instructions } = req.body || {};
    if (!studentId || !month) { res.status(400).json({ error: 'studentId and month are required' }); return; }
    await query(
      `INSERT INTO ai_summaries (student_id, month, summary, instructions, updated_at)
       VALUES ($1,$2,$3,$4,now())
       ON CONFLICT (student_id, month) DO UPDATE SET summary = EXCLUDED.summary, instructions = EXCLUDED.instructions, updated_at = now()`,
      [studentId, month, summary || '', instructions || '']
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
