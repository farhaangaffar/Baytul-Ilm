const { query } = require('../_db');
const { requireAuth } = require('../_auth');

module.exports = requireAuth(async (req, res) => {
  if (req.method === 'GET') {
    const { rows } = await query('SELECT id, name, phone, email, subjects FROM teachers ORDER BY name');
    res.status(200).json(rows);
    return;
  }

  if (req.method === 'POST') {
    const b = req.body || {};
    if (!b.name) { res.status(400).json({ error: 'name is required' }); return; }
    const id = b.id || 'T' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const { rows } = await query(
      'INSERT INTO teachers (id, name, phone, email, subjects) VALUES ($1,$2,$3,$4,$5) RETURNING id, name, phone, email, subjects',
      [id, b.name, b.phone || '', b.email || '', JSON.stringify(b.subjects || [])]
    );
    res.status(201).json(rows[0]);
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
});
