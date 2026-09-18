const { query } = require('../../_db');
const { getPortalUser } = require('../../_auth');

const FIELD_MAP = {
  fajrAzaan: 'fajr_azaan', fajrIqamah: 'fajr_iqamah',
  zuhrAzaan: 'zuhr_azaan', zuhrIqamah: 'zuhr_iqamah',
  asrAzaan: 'asr_azaan', asrIqamah: 'asr_iqamah',
  maghribAzaan: 'maghrib_azaan', maghribIqamah: 'maghrib_iqamah',
  ishaAzaan: 'isha_azaan', ishaIqamah: 'isha_iqamah',
  jumuahKhutbah: 'jumuah_khutbah', jumuahIqamah: 'jumuah_iqamah',
  notes: 'notes',
};

function canEdit(user, masjidId) {
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  return user.role === 'masjid_admin' && user.masjidId === masjidId;
}

module.exports = async (req, res) => {
  const { id } = req.query;

  if (req.method === 'GET') {
    const { rows } = await query(`
      SELECT masjid_id AS "masjidId",
        fajr_azaan AS "fajrAzaan", fajr_iqamah AS "fajrIqamah",
        zuhr_azaan AS "zuhrAzaan", zuhr_iqamah AS "zuhrIqamah",
        asr_azaan AS "asrAzaan", asr_iqamah AS "asrIqamah",
        maghrib_azaan AS "maghribAzaan", maghrib_iqamah AS "maghribIqamah",
        isha_azaan AS "ishaAzaan", isha_iqamah AS "ishaIqamah",
        jumuah_khutbah AS "jumuahKhutbah", jumuah_iqamah AS "jumuahIqamah",
        notes, updated_at AS "updatedAt"
      FROM salaah_times WHERE masjid_id = $1
    `, [id]);
    if (!rows[0]) { res.status(404).json({ error: 'Masjid not found' }); return; }
    res.status(200).json(rows[0]);
    return;
  }

  if (req.method === 'PATCH') {
    const user = getPortalUser(req);
    if (!canEdit(user, id)) { res.status(401).json({ error: 'Not authenticated' }); return; }
    const b = req.body || {};
    const sets = []; const values = [];
    for (const [key, col] of Object.entries(FIELD_MAP)) {
      if (b[key] !== undefined) { values.push(b[key] || null); sets.push(`${col} = $${values.length}`); }
    }
    if (!sets.length) { res.status(400).json({ error: 'No valid fields to update' }); return; }
    sets.push('updated_at = now()');
    values.push(id);
    const { rowCount } = await query(`UPDATE salaah_times SET ${sets.join(', ')} WHERE masjid_id = $${values.length}`, values);
    if (!rowCount) { res.status(404).json({ error: 'Masjid not found' }); return; }
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
