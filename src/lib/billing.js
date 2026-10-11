// Where a madrasah is with paying Suhuf (the platform owner's Madaaris page).
// Everything runs from the 1st of a month: the free months last until the end of the month
// their free date falls in, so paying starts on the 1st after it. Each payment covers whole
// months in order from there — when it was paid doesn't move anything.

export const DEFAULT_PRICE = { monthly: 20, yearly: 200 };
export const WARN_DAYS = 14; // yellow for the last two weeks
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const money = n => `£${Number(n).toFixed(2).replace(/\.00$/, '')}`;

const pad = n => String(n).padStart(2, '0');
const iso = (y, m, d) => { const t = new Date(Date.UTC(y, m - 1, d)); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; };
const parts = s => s.split('-').map(Number);
export const todayLocal = () => { const d = new Date(); return iso(d.getFullYear(), d.getMonth() + 1, d.getDate()); };
export const addMonths = (s, n) => { const [y, m] = parts(s); return iso(y, m + n, 1); };   // s is a 1st
export const dayBefore = s => { const [y, m, d] = parts(s); return iso(y, m, d - 1); };
function toUTC(s) { const [y, m, d] = parts(s); return [y, m - 1, d]; }
export const daysBetween = (a, b) => Math.round((Date.UTC(...toUTC(b)) - Date.UTC(...toUTC(a))) / 864e5);
export const monthIndex = s => { const [y, m] = parts(s); return y * 12 + (m - 1); };
export const firstOfMonth = s => { const [y, m] = parts(s); return iso(y, m, 1); };

// The first day they pay for: the 1st after the free months (a free date that's already a 1st counts as it).
export function billingStart(freeUntil) {
  const [y, m, d] = parts(freeUntil);
  return d === 1 ? freeUntil : iso(y, m + 1, 1);
}

export function prices(m) {
  const amount = Number(m.billingAmount);
  return {
    monthly: m.billingPlan === 'monthly' && amount > 0 ? amount : DEFAULT_PRICE.monthly,
    yearly: m.billingPlan === 'yearly' && amount > 0 ? amount : DEFAULT_PRICE.yearly,
  };
}

// { state: 'yours'|'off'|'free'|'paid'|'overdue', warn, label, fill (0–1), start, paidTo, nextDue, owed, monthsOwed }
export function billing(m, today = todayLocal()) {
  if (m.isYours) return { state: 'yours', label: 'Yours', fill: 0 };
  if (!m.active) return { state: 'off', label: 'Switched off', fill: 0 };
  const start = billingStart(m.freeUntil);
  const coveredTo = addMonths(start, m.monthsPaid || 0); // first day not paid for
  const base = { start, nextDue: coveredTo, paidTo: m.monthsPaid ? dayBefore(coveredTo) : null, owed: 0, monthsOwed: 0 };
  const short = s => { const [y, mo, d] = parts(s); return `${d} ${MONTHS[mo - 1]}${y !== parts(today)[0] ? ` ${y}` : ''}`; };

  if (today < start && !m.monthsPaid) {
    const left = daysBetween(today, start);
    const joined = String(m.createdAt || today).slice(0, 10);
    const total = Math.max(1, daysBetween(joined, start));
    const warn = left <= WARN_DAYS;
    return { ...base, state: 'free', warn, fill: Math.min(1, left / total),
      label: warn ? `Free ends in ${left} day${left === 1 ? '' : 's'}` : `Free until ${short(dayBefore(start))}` };
  }
  if (today < coveredTo) {
    const left = daysBetween(today, coveredTo);
    const warn = left <= WARN_DAYS;
    const span = m.billingPlan === 'yearly' ? 365 : 31;
    return { ...base, state: 'paid', warn, fill: Math.min(1, left / span),
      label: warn ? `Due in ${left} day${left === 1 ? '' : 's'}` : `Paid to ${short(dayBefore(coveredTo))}` };
  }
  const monthsOwed = monthIndex(today) - monthIndex(coveredTo) + 1;
  const p = prices(m);
  const owed = m.billingPlan === 'yearly' ? p.yearly * Math.ceil(monthsOwed / 12) : p.monthly * monthsOwed;
  return { ...base, state: 'overdue', warn: false, fill: 1, owed, monthsOwed, label: `Overdue · ${money(owed)}` };
}

// One box per month of a calendar year: 'before' (not joined yet), 'free', 'paid', 'owed' or 'notdue'.
export function monthBoxes(m, year, today = todayLocal()) {
  const start = billingStart(m.freeUntil);
  const joined = firstOfMonth(String(m.createdAt || today).slice(0, 10));
  return MONTHS.map((name, i) => {
    const first = iso(year, i + 1, 1);
    if (first < start) return { name, first, kind: first < joined ? 'before' : 'free' };
    const n = monthIndex(first) - monthIndex(start); // 0 = the first month they pay for
    if (n < (m.monthsPaid || 0)) return { name, first, kind: 'paid' };
    return { name, first, kind: first <= today ? 'owed' : 'notdue', n };
  });
}

export const monthName = s => { const [y, m] = parts(s); return `${MONTHS[m - 1]} ${y}`; };
