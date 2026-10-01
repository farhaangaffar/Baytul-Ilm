// The school's name and currency, readable synchronously from anywhere — including
// non-React code like the PDF generator and money formatting inside render bodies.
// Cached in localStorage so the right name/symbol shows on first paint (and on the
// login screen) instead of flashing a generic default until /api/settings answers.

const CACHE_KEY = 'madrasah_branding';
const DEFAULTS = { schoolName: 'Madrasah', schoolNameArabic: '', currencySymbol: '£', feeFrequency: 'weekly', reportPeriod: 'monthly' };

let current = { ...DEFAULTS };
try { current = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') }; } catch {}

export function getBranding() { return current; }

export function setBranding(s) {
  current = {
    schoolName: s.schoolName || current.schoolName,
    schoolNameArabic: s.schoolNameArabic ?? current.schoolNameArabic,
    currencySymbol: s.currencySymbol || current.currencySymbol,
    feeFrequency: s.feeFrequency || current.feeFrequency,
    reportPeriod: s.reportPeriod || current.reportPeriod,
  };
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(current)); } catch {}
  if (typeof document !== 'undefined') document.title = current.schoolName;
}

// money(12.5) → "£12.50"; money(15, 0) → "£15"
export function money(n, decimals = 2) {
  return `${current.currencySymbol}${Number(n || 0).toFixed(decimals)}`;
}

export function currencySymbol() { return current.currencySymbol; }
