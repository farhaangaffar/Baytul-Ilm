const { query } = require('../db');
const { requireAuth } = require('../auth');
const { ensureSignupColumns } = require('../newMadrasah');

// "Recommend Suhuf" (the head's Dashboard): the madrasah's own link (suhuf.uk/?ref=<its code>) and the madaaris that
// signed up through it. Each one that signs up gives this madrasah a month free (server/routes/signup.js, giveReferralMonth).
// GET → { code, joined: [{ name, joinedAt, rewarded }], freeMonths }
module.exports = requireAuth(async (req, res) => {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  await ensureSignupColumns();
  const mid = req.user.madrasahId;
  const { rows: [m] } = await query('SELECT code FROM madaaris WHERE id = $1', [mid]);
  const { rows } = await query(
    `SELECT name, to_char(created_at, 'YYYY-MM-DD') AS "joinedAt", referral_reward_at IS NOT NULL AS rewarded
     FROM madaaris WHERE referred_by = $1 AND demo_until IS NULL ORDER BY created_at DESC`, [mid]);
  res.status(200).json({ code: m.code, joined: rows, freeMonths: rows.filter(r => r.rewarded).length });
});
