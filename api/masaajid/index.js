const crypto = require('crypto');
const { query } = require('../_db');
const { getPortalUser } = require('../_auth');

function slugify(name) {
  const base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return base || crypto.randomBytes(4).toString('hex');
}

// GET is public (the directory listing every masjid, salaah times and talks will
// eventually be read from) — creating a masjid record is super_admin-only, since
// that's where the sect/khutbah-language/verification fields live.
module.exports = async (req, res) => {
  if (req.method === 'GET') {
    const { rows } = await query(`
      SELECT id, name, address, city, postcode, country, latitude, longitude,
             sect, khutbah_language AS "khutbahLanguage", phone, email, website, verified
      FROM masaajid ORDER BY name
    `);
    res.status(200).json(rows);
    return;
  }

  if (req.method === 'POST') {
    const user = getPortalUser(req);
    if (!user || user.role !== 'super_admin') { res.status(401).json({ error: 'Not authenticated' }); return; }
    const b = req.body || {};
    if (!b.name) { res.status(400).json({ error: 'name is required' }); return; }

    let id = slugify(b.name);
    const { rows: existing } = await query(`SELECT id FROM masaajid WHERE id = $1`, [id]);
    if (existing.length) id = `${id}-${crypto.randomBytes(3).toString('hex')}`;

    await query(
      `INSERT INTO masaajid (id, name, address, city, postcode, country, latitude, longitude, sect, khutbah_language, phone, email, website, verified)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [id, b.name, b.address || '', b.city || '', b.postcode || '', b.country || 'UK', b.latitude ?? null, b.longitude ?? null,
       b.sect || 'unspecified', b.khutbahLanguage || 'unspecified', b.phone || '', b.email || '', b.website || '', !!b.verified]
    );
    await query(`INSERT INTO salaah_times (masjid_id) VALUES ($1)`, [id]);
    res.status(201).json({ id });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
