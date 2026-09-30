const { query } = require('./_db');
const { isAuthed } = require('./_auth');

// currency_symbol, logo and icon were added after the settings table already existed in production —
// self-heal once per cold start, same pattern as ai_summaries.behavior in api/ai-summary.js.
let columnsReady = false;
async function ensureColumns() {
  if (columnsReady) return;
  await query(`ALTER TABLE settings ADD COLUMN IF NOT EXISTS currency_symbol TEXT NOT NULL DEFAULT '£'`);
  await query(`ALTER TABLE settings ADD COLUMN IF NOT EXISTS logo TEXT`);
  await query(`ALTER TABLE settings ADD COLUMN IF NOT EXISTS icon TEXT`);
  columnsReady = true;
}

async function loadSettings() {
  await ensureColumns();
  const { rows } = await query(
    `SELECT school_name AS "schoolName", school_name_arabic AS "schoolNameArabic",
            default_weekly_fee AS "defaultWeeklyFee", currency_symbol AS "currencySymbol",
            logo IS NOT NULL AS "hasLogo", left(md5(icon), 8) AS "iconVersion"
     FROM settings WHERE id = 1`
  );
  const row = rows[0];
  if (!row) return {};
  const { iconVersion, ...rest } = row;
  return { ...rest, defaultWeeklyFee: Number(row.defaultWeeklyFee), hasIcon: !!iconVersion, iconVersion };
}

// The logo is kept as a data: URL in the settings row (a few hundred KB at most —
// the browser downsizes it before upload) and served as a real image from here,
// so the ordinary settings response stays small.
const LOGO_MAX_CHARS = 1_000_000;
// The app icon (home screen, browser tab) is a square version of the logo that
// the browser builds at upload time; with no logo, the neutral built-in icon.
async function sendImage(res, column) {
  await ensureColumns();
  const { rows } = await query(`SELECT ${column} AS img FROM settings WHERE id = 1`);
  const m = /^data:(image\/(?:png|jpeg));base64,(.+)$/.exec(rows[0]?.img || '');
  if (!m) {
    if (column === 'icon') { res.setHeader('Cache-Control', 'no-cache'); res.redirect(302, '/icons/icon-512.png'); return; }
    res.status(404).json({ error: 'No logo' }); return;
  }
  res.setHeader('Content-Type', m[1]);
  res.setHeader('Cache-Control', 'no-cache');
  res.status(200).send(Buffer.from(m[2], 'base64'));
}

// Web app manifest, built from the school's own name so the installed app's
// home-screen label matches whichever madrasah this deployment belongs to.
// Served from here rather than a new api/ file — the Hobby plan's 12-function cap.
function manifest(s) {
  const name = s.schoolName || 'Madrasah';
  // An uploaded icon is one 512px PNG with the logo inside the maskable safe zone,
  // so it serves every size/purpose; ?v changes with its content so installed
  // apps notice a new logo.
  const icons = s.hasIcon
    ? ['any', 'maskable'].map(purpose => ({ src: `/api/settings?icon&v=${s.iconVersion}`, sizes: '512x512', type: 'image/png', purpose }))
    : [192, 512].flatMap(size => [
      { src: `/icons/icon-${size}.png`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any' },
      { src: `/icons/maskable-${size}.png`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'maskable' },
    ]);
  return {
    id: '/',
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
    // so the school's name (and logo) is public; everything else stays behind the session.
    if (req.query.logo !== undefined) { await sendImage(res, 'logo'); return; }
    if (req.query.icon !== undefined) { await sendImage(res, 'icon'); return; }
    const s = await loadSettings();
    if (req.query.manifest !== undefined) {
      res.setHeader('Content-Type', 'application/manifest+json');
      res.status(200).send(JSON.stringify(manifest(s)));
      return;
    }
    if (!isAuthed(req)) {
      res.status(200).json({ schoolName: s.schoolName, schoolNameArabic: s.schoolNameArabic, hasLogo: s.hasLogo, hasIcon: s.hasIcon });
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
    for (const column of ['logo', 'icon']) {
      const v = b[column];
      if (v === undefined) continue;
      if (v !== null && !(typeof v === 'string' && /^data:image\/(png|jpeg);base64,/.test(v) && v.length <= LOGO_MAX_CHARS)) {
        res.status(400).json({ error: 'Logo must be a PNG or JPEG under about 700 KB' }); return;
      }
      values.push(v); sets.push(`${column} = $${values.length}`);
    }
    if (!sets.length) { res.status(400).json({ error: 'No valid fields to update' }); return; }
    await query(`UPDATE settings SET ${sets.join(', ')} WHERE id = 1`, values);
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
