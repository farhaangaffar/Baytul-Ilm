const { query } = require('../db');
const { getUser } = require('../auth');

// currency_symbol, logo, icon, fee_frequency and report_period were added after the settings table already existed in production —
// self-heal once per cold start, same pattern as ai_summaries.behavior in api/ai-summary.js.
let columnsReady = false;
async function ensureColumns() {
  if (columnsReady) return;
  await query(`ALTER TABLE settings ADD COLUMN IF NOT EXISTS currency_symbol TEXT NOT NULL DEFAULT '£'`);
  await query(`ALTER TABLE settings ADD COLUMN IF NOT EXISTS logo TEXT`);
  await query(`ALTER TABLE settings ADD COLUMN IF NOT EXISTS icon TEXT`);
  await query(`ALTER TABLE settings ADD COLUMN IF NOT EXISTS fee_frequency TEXT NOT NULL DEFAULT 'weekly'`);
  await query(`ALTER TABLE settings ADD COLUMN IF NOT EXISTS report_period TEXT NOT NULL DEFAULT 'monthly'`);
  columnsReady = true;
}

// Whose settings a request is about: the signed-in person's madrasah, or — before
// anyone signs in (login screen, install manifest, icons) — the madrasah named by
// ?m=<code>, which each device remembers after its first sign-in. Neither: null, and
// the app shows a neutral name and icon rather than any particular madrasah's.
async function madrasahFor(req, user) {
  if (user) return { id: user.madrasahId, code: null };
  const code = String(req.query.m || '').trim().toLowerCase();
  if (!code) return null;
  const { rows } = await query('SELECT id, code FROM madaaris WHERE lower(code) = $1 AND active', [code]);
  return rows[0] || null;
}

async function loadSettings(mid) {
  await ensureColumns();
  if (!mid) return {};
  const { rows } = await query(
    `SELECT school_name AS "schoolName", school_name_arabic AS "schoolNameArabic",
            default_weekly_fee AS "defaultWeeklyFee", currency_symbol AS "currencySymbol",
            fee_frequency AS "feeFrequency", report_period AS "reportPeriod",
            logo IS NOT NULL AS "hasLogo", left(md5(icon), 8) AS "iconVersion"
     FROM settings WHERE madrasah_id = $1`,
    [mid]
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
async function sendImage(res, column, mid) {
  await ensureColumns();
  const { rows } = mid ? await query(`SELECT ${column} AS img FROM settings WHERE madrasah_id = $1`, [mid]) : { rows: [] };
  const m = /^data:(image\/(?:png|jpeg));base64,(.+)$/.exec(rows[0]?.img || '');
  if (!m) {
    if (column === 'icon') { res.setHeader('Cache-Control', 'no-cache'); res.redirect(302, '/icons/book-512.png'); return; }
    res.status(404).json({ error: 'No logo' }); return;
  }
  res.setHeader('Content-Type', m[1]);
  res.setHeader('Cache-Control', 'no-cache');
  res.status(200).send(Buffer.from(m[2], 'base64'));
}

// Web app manifest, built from the madrasah's own name and icon so the installed
// app's home-screen label and icon are theirs (the page points at it with ?m=<code>).
// Served from here as an action on the settings route rather than a route of its own.
function manifest(s, code) {
  const name = s.schoolName || 'Madrasah';
  // An uploaded icon is one 512px PNG with the logo inside the maskable safe zone,
  // so it serves every size/purpose; ?v changes with its content so installed
  // apps notice a new logo.
  const icons = s.hasIcon
    ? ['any', 'maskable'].map(purpose => ({ src: `/api/settings?icon&m=${encodeURIComponent(code || '')}&v=${s.iconVersion}`, sizes: '512x512', type: 'image/png', purpose }))
    : [192, 512].flatMap(size => [
      { src: `/icons/book-${size}.png`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any' },
      { src: `/icons/book-maskable-${size}.png`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'maskable' },
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
  const user = await getUser(req);
  if (req.method === 'GET') {
    // The login page and the install manifest are shown before anyone signs in, so a
    // madrasah's name (and logo) is public; everything else stays behind the session.
    const m = await madrasahFor(req, user);
    const mid = m?.id;
    if (req.query.logo !== undefined) { await sendImage(res, 'logo', mid); return; }
    if (req.query.icon !== undefined) { await sendImage(res, 'icon', mid); return; }
    const s = await loadSettings(mid);
    if (req.query.manifest !== undefined) {
      let code = m?.code;
      if (mid && !code) code = (await query('SELECT code FROM madaaris WHERE id = $1', [mid])).rows[0]?.code;
      res.setHeader('Content-Type', 'application/manifest+json');
      res.status(200).send(JSON.stringify(manifest(s, code)));
      return;
    }
    if (!user) {
      res.status(200).json({ schoolName: s.schoolName, schoolNameArabic: s.schoolNameArabic, hasLogo: s.hasLogo, hasIcon: s.hasIcon });
      return;
    }
    res.status(200).json(s);
    return;
  }

  if (!user) { res.status(401).json({ error: 'Not authenticated' }); return; }
  if (user.role !== 'owner') { res.status(403).json({ error: "You don't have access to this." }); return; }

  if (req.method === 'PATCH') {
    await ensureColumns();
    const b = req.body || {};
    const sets = [];
    const values = [];
    if (b.schoolName !== undefined) { values.push(b.schoolName); sets.push(`school_name = $${values.length}`); }
    if (b.schoolNameArabic !== undefined) { values.push(b.schoolNameArabic); sets.push(`school_name_arabic = $${values.length}`); }
    if (b.defaultWeeklyFee !== undefined) { values.push(b.defaultWeeklyFee); sets.push(`default_weekly_fee = $${values.length}`); }
    if (b.currencySymbol !== undefined) { values.push(String(b.currencySymbol).trim().slice(0, 4) || '£'); sets.push(`currency_symbol = $${values.length}`); }
    if (b.feeFrequency !== undefined) {
      if (!['weekly', 'monthly', 'termly'].includes(b.feeFrequency)) { res.status(400).json({ error: 'Fee frequency must be weekly, monthly or termly' }); return; }
      values.push(b.feeFrequency); sets.push(`fee_frequency = $${values.length}`);
    }
    if (b.reportPeriod !== undefined) {
      if (!['monthly', 'termly'].includes(b.reportPeriod)) { res.status(400).json({ error: 'Report period must be monthly or termly' }); return; }
      values.push(b.reportPeriod); sets.push(`report_period = $${values.length}`);
    }
    for (const column of ['logo', 'icon']) {
      const v = b[column];
      if (v === undefined) continue;
      if (v !== null && !(typeof v === 'string' && /^data:image\/(png|jpeg);base64,/.test(v) && v.length <= LOGO_MAX_CHARS)) {
        res.status(400).json({ error: 'Logo must be a PNG or JPEG under about 700 KB' }); return;
      }
      values.push(v); sets.push(`${column} = $${values.length}`);
    }
    if (!sets.length) { res.status(400).json({ error: 'No valid fields to update' }); return; }
    values.push(user.madrasahId);
    await query(`UPDATE settings SET ${sets.join(', ')} WHERE madrasah_id = $${values.length}`, values);
    // Keep the name on the platform owner's Madaaris list in step with the madrasah's own.
    if (b.schoolName) await query('UPDATE madaaris SET name = $1 WHERE id = $2', [b.schoolName, user.madrasahId]);
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
