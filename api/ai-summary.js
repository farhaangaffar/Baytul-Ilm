const { requireAuth } = require('./_auth');

module.exports = requireAuth(async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
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
});
