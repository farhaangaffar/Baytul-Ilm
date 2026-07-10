const { query } = require('./_db');
const { requireAuth } = require('./_auth');

module.exports = requireAuth(async (req, res) => {
  if (req.method === 'GET') {
    const { rows } = await query(
      `SELECT school_name AS "schoolName", school_name_arabic AS "schoolNameArabic", default_weekly_fee AS "defaultWeeklyFee" FROM settings WHERE id = 1`
    );
    const row = rows[0];
    res.status(200).json(row ? { ...row, defaultWeeklyFee: Number(row.defaultWeeklyFee) } : {});
    return;
  }

  if (req.method === 'PATCH') {
    const b = req.body || {};
    const sets = [];
    const values = [];
    if (b.schoolName !== undefined) { values.push(b.schoolName); sets.push(`school_name = $${values.length}`); }
    if (b.schoolNameArabic !== undefined) { values.push(b.schoolNameArabic); sets.push(`school_name_arabic = $${values.length}`); }
    if (b.defaultWeeklyFee !== undefined) { values.push(b.defaultWeeklyFee); sets.push(`default_weekly_fee = $${values.length}`); }
    if (!sets.length) { res.status(400).json({ error: 'No valid fields to update' }); return; }
    await query(`UPDATE settings SET ${sets.join(', ')} WHERE id = 1`, values);
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
});
