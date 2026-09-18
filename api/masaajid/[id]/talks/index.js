const { query } = require('../../../_db');
const { getPortalUser } = require('../../../_auth');

function canEdit(user, masjidId) {
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  return user.role === 'masjid_admin' && user.masjidId === masjidId;
}

module.exports = async (req, res) => {
  const { id } = req.query;

  if (req.method === 'GET') {
    const user = getPortalUser(req);
    // ?all=true (only honoured for whoever manages this masjid) also returns past
    // talks, for the portal's own management list — public/app reads only ever
    // want what's still upcoming.
    const showAll = req.query.all === 'true' && canEdit(user, id);
    const { rows } = await query(
      showAll
        ? `SELECT id, title, speaker, description, language, date, start_time AS "startTime", end_time AS "endTime"
           FROM talks WHERE masjid_id = $1 ORDER BY date DESC, start_time DESC`
        : `SELECT id, title, speaker, description, language, date, start_time AS "startTime", end_time AS "endTime"
           FROM talks WHERE masjid_id = $1 AND date >= CURRENT_DATE ORDER BY date, start_time`,
      [id]
    );
    res.status(200).json(rows);
    return;
  }

  if (req.method === 'POST') {
    const user = getPortalUser(req);
    if (!canEdit(user, id)) { res.status(401).json({ error: 'Not authenticated' }); return; }
    const b = req.body || {};
    if (!b.title || !b.date || !b.startTime) { res.status(400).json({ error: 'title, date and startTime are required' }); return; }
    const { rows } = await query(
      `INSERT INTO talks (masjid_id, title, speaker, description, language, date, start_time, end_time)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [id, b.title, b.speaker || '', b.description || '', b.language || 'unspecified', b.date, b.startTime, b.endTime || null]
    );
    res.status(201).json({ id: rows[0].id });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
