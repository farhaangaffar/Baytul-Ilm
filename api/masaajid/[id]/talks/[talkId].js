const { query } = require('../../../_db');
const { getPortalUser } = require('../../../_auth');

const FIELD_MAP = {
  title: 'title', speaker: 'speaker', description: 'description', language: 'language',
  date: 'date', startTime: 'start_time', endTime: 'end_time',
};

function canEdit(user, masjidId) {
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  return user.role === 'masjid_admin' && user.masjidId === masjidId;
}

module.exports = async (req, res) => {
  const { id, talkId } = req.query;
  const user = getPortalUser(req);
  if (!canEdit(user, id)) { res.status(401).json({ error: 'Not authenticated' }); return; }

  if (req.method === 'PATCH') {
    const b = req.body || {};
    const sets = []; const values = [];
    for (const [key, col] of Object.entries(FIELD_MAP)) {
      if (b[key] !== undefined) { values.push(b[key] || null); sets.push(`${col} = $${values.length}`); }
    }
    if (!sets.length) { res.status(400).json({ error: 'No valid fields to update' }); return; }
    sets.push('updated_at = now()');
    values.push(talkId, id);
    const { rowCount } = await query(
      `UPDATE talks SET ${sets.join(', ')} WHERE id = $${values.length - 1} AND masjid_id = $${values.length}`,
      values
    );
    if (!rowCount) { res.status(404).json({ error: 'Talk not found' }); return; }
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'DELETE') {
    const { rowCount } = await query(`DELETE FROM talks WHERE id = $1 AND masjid_id = $2`, [talkId, id]);
    if (!rowCount) { res.status(404).json({ error: 'Talk not found' }); return; }
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
