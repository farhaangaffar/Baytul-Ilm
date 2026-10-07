// The school's name and currency, readable synchronously from anywhere — including
// non-React code like the PDF generator and money formatting inside render bodies.
// Cached in localStorage so the right name/symbol shows on first paint (and on the
// login screen) instead of flashing a generic default until /api/settings answers.

// The product's own name and address — shown wherever no madrasah is chosen yet (the
// sign-in screen of a new device, the browser tab, the installed app's default name) and
// used for links that are sent out (the demo, a new madrasah's sign-in link).
export const APP_NAME = 'Suhuf';
export const APP_NAME_ARABIC = 'صُحُف';
export const APP_TAGLINE = 'Madrasah management';
export const APP_URL = 'https://suhuf.uk';

const CACHE_KEY = 'madrasah_branding';
const DEFAULTS = { schoolName: 'Madrasah', schoolNameArabic: '', currencySymbol: '£', feeFrequency: 'weekly', reportPeriod: 'monthly', schoolDays: [1, 2, 3, 4], feeAuto: true };

let current = { ...DEFAULTS };
try { current = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') }; } catch {}

export function getBranding() { return current; }
// True until a madrasah's own name is known (a device that hasn't signed in anywhere yet).
export function isNeutralBranding() { return current.schoolName === DEFAULTS.schoolName && !current.schoolNameArabic; }

export function setBranding(s) {
  current = {
    schoolName: s.schoolName || current.schoolName,
    schoolNameArabic: s.schoolNameArabic ?? current.schoolNameArabic,
    currencySymbol: s.currencySymbol || current.currencySymbol,
    feeFrequency: s.feeFrequency || current.feeFrequency,
    reportPeriod: s.reportPeriod || current.reportPeriod,
    schoolDays: Array.isArray(s.schoolDays) && s.schoolDays.length ? s.schoolDays.map(Number) : current.schoolDays,
    feeAuto: typeof s.feeAuto === 'boolean' ? s.feeAuto : current.feeAuto,
  };
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(current)); } catch {}
  if (typeof document !== 'undefined') document.title = isNeutralBranding() ? APP_NAME : current.schoolName;
}

// money(12.5) → "£12.50"; money(15, 0) → "£15"
export function money(n, decimals = 2) {
  return `${current.currencySymbol}${Number(n || 0).toFixed(decimals)}`;
}

export function currencySymbol() { return current.currencySymbol; }
