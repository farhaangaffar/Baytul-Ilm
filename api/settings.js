const { query } = require('./_db');
const { isAuthed } = require('./_auth');

// currency_symbol was added after the settings table already existed in production —
// self-heal once per cold start, same pattern as ai_summaries.behavior in api/ai-summary.js.
let columnsReady = false;
async function ensureColumns() {
  if (columnsReady) return;
  await query(`ALTER TABLE settings ADD COLUMN IF NOT EXISTS currency_symbol TEXT NOT NULL DEFAULT '£'`);
  columnsReady = true;
}

async function loadSettings() {
  await ensureColumns();
  const { rows } = await query(
    `SELECT school_name AS "schoolName", school_name_arabic AS "schoolNameArabic",
            default_weekly_fee AS "defaultWeeklyFee", currency_symbol AS "currencySymbol"
     FROM settings WHERE id = 1`
  );
  const row = rows[0];
  return row ? { ...row, defaultWeeklyFee: Number(row.defaultWeeklyFee) } : {};
}

// Web app manifest, built from the school's own name so the installed app's
// home-screen label matches whichever madrasah this deployment belongs to.
// Served from here rather than a new api/ file — the Hobby plan's 12-function cap.
function manifest(s) {
  const name = s.schoolName || 'Madrasah';
  const icons = [192, 512].flatMap(size => [
    { src: `/icons/icon-${size}.png`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any' },
    { src: `/icons/maskable-${size}.png`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'maskable' },
  ]);
  return {
    name,
    short_name: name.length > 12 ? name.replace(/\s*madrasah?$/i, '').slice(0, 12) || name.slice(0, 12) : name,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#1a3c5e',
    icons,
  };
}

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    // The login page and the install manifest are shown before anyone signs in,
    // so the school's name is public; everything else stays behind the session.
    const s = await loadSettings();
    if (req.query.manifest !== undefined) {
      res.setHeader('Content-Type', 'application/manifest+json');
      res.status(200).send(JSON.stringify(manifest(s)));
      return;
    }
    if (!isAuthed(req)) {
      res.status(200).json({ schoolName: s.schoolName, schoolNameArabic: s.schoolNameArabic });
      return;
    }
    res.status(200).json(s);
    return;
  }

  if (!isAuthed(req)) { res.status(401).json({ error: 'Not authenticated' }); return; }

  if (req.method === 'PATCH') {
    await ensureColumns();
    const b = req.body || {};
    const sets = [];
    const values = [];
    if (b.schoolName !== undefined) { values.push(b.schoolName); sets.push(`school_name = $${values.length}`); }
    if (b.schoolNameArabic !== undefined) { values.push(b.schoolNameArabic); sets.push(`school_name_arabic = $${values.length}`); }
    if (b.defaultWeeklyFee !== undefined) { values.push(b.defaultWeeklyFee); sets.push(`default_weekly_fee = $${values.length}`); }
    if (b.currencySymbol !== undefined) { values.push(String(b.currencySymbol).trim().slice(0, 4) || '£'); sets.push(`currency_symbol = $${values.length}`); }
    if (!sets.length) { res.status(400).json({ error: 'No valid fields to update' }); return; }
    await query(`UPDATE settings SET ${sets.join(', ')} WHERE id = 1`, values);
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
