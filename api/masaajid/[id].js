const { query } = require('../_db');
const { getPortalUser } = require('../_auth');

// Every field here (name, address, sect, khutbah language, verification, ...) is
// super_admin-only to edit — a masjid_admin never sees a write path for this
// record, only for their own salaah_times/talks rows.
const FIELD_MAP = {
  name: 'name', address: 'address', city: 'city', postcode: 'postcode', country: 'country',
  latitude: 'latitude', longitude: 'longitude', sect: 'sect', khutbahLanguage: 'khutbah_language',
  phone: 'phone', email: 'email', website: 'website', verified: 'verified',
};

module.exports = async (req, res) => {
  const { id } = req.query;

  if (req.method === 'GET') {
    const { rows } = await query(`
      SELECT id, name, address, city, postcode, country, latitude, longitude,
             sect, khutbah_language AS "khutbahLanguage", phone, email, website, verified
      FROM masaajid WHERE id = $1
    `, [id]);
    if (!rows[0]) { res.status(404).json({ error: 'Masjid not found' }); return; }
    res.status(200).json(rows[0]);
    return;
  }

  const user = getPortalUser(req);
  if (!user || user.role !== 'super_admin') { res.status(401).json({ error: 'Not authenticated' }); return; }

  if (req.method === 'PATCH') {
    const b = req.body || {};
    const sets = []; const values = [];
    for (const [key, col] of Object.entries(FIELD_MAP)) {
      if (b[key] !== undefined) { values.push(b[key]); sets.push(`${col} = $${values.length}`); }
    }
    if (!sets.length) { res.status(400).json({ error: 'No valid fields to update' }); return; }
    sets.push('updated_at = now()');
    values.push(id);
    const { rowCount } = await query(`UPDATE masaajid SET ${sets.join(', ')} WHERE id = $${values.length}`, values);
    if (!rowCount) { res.status(404).json({ error: 'Masjid not found' }); return; }
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'DELETE') {
    const { rowCount } = await query(`DELETE FROM masaajid WHERE id = $1`, [id]);
    if (!rowCount) { res.status(404).json({ error: 'Masjid not found' }); return; }
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
