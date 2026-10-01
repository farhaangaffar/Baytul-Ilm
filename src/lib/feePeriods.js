// Billing periods for the madrasah's fee frequency (Settings → Fees):
//  - weekly:  fee records per week; grouped into "school months" that run from each
//             month's first Monday (getCurrentSchoolMonth) — the original system.
//  - monthly: one record per calendar month (1st to the end of the month).
//  - termly:  one record per term, using the term dates entered in Settings.
// A period is { key, start, endExclusive, label, short } with plain YYYY-MM-DD dates;
// a fee record's weekStarting is its period's start date.
import { getBranding } from './branding';
import { getCurrentSchoolMonth } from './store';

export const FREQUENCIES = {
  weekly:  { period: 'week',  unit: 'week',  per: '/wk',   adjective: 'Weekly' },
  monthly: { period: 'month', unit: 'month', per: '/mo',   adjective: 'Monthly' },
  termly:  { period: 'term',  unit: 'term',  per: '/term', adjective: 'Termly' },
};

export function feeFrequency() {
  const f = getBranding().feeFrequency;
  return FREQUENCIES[f] ? f : 'weekly';
}
// "week" | "month" | "term" — for labels like "Fee per month"
export function feeUnit() { return FREQUENCIES[feeFrequency()].unit; }
// "/wk" | "/mo" | "/term" — for compact amounts like "£15/mo"
export function feePer() { return FREQUENCIES[feeFrequency()].per; }

function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function calendarMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  const d = new Date(y, m - 1, 1, 12);
  return {
    key: ym, start: `${ym}-01`, endExclusive: `${next}-01`,
    label: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
    short: d.toLocaleDateString('en-GB', { month: 'short' }),
  };
}

// The 12 calendar months of a "YY-YY" academic year, September to August.
export function monthsOfAcademicYear(yearLabel) {
  const startYear = 2000 + Number(yearLabel.slice(0, 2));
  return Array.from({ length: 12 }, (_, i) => {
    const m0 = (8 + i) % 12, y = startYear + (8 + i >= 12 ? 1 : 0);
    return calendarMonth(`${y}-${String(m0 + 1).padStart(2, '0')}`);
  });
}

export function termPeriod(t) {
  return { key: t.id, start: t.startDate, endExclusive: addDays(t.endDate, 1), label: t.name, short: t.name, term: t };
}

// Billing periods of an academic year for monthly/termly (weekly pages use school months).
export function feePeriodsForYear(frequency, yearLabel, terms = []) {
  if (frequency === 'monthly') return monthsOfAcademicYear(yearLabel);
  if (frequency === 'termly') return terms.filter(t => t.year === yearLabel).map(termPeriod).sort((a, b) => a.start.localeCompare(b.start));
  return [];
}

// The period "now" falls in (or refIso, for browsing another year): the school month
// for weekly, the calendar month for monthly, and for termly the term containing the
// date — else the latest one already started, else the next one. Null if no terms.
export function currentFeePeriod(frequency, terms = [], refIso) {
  const ref = refIso || new Date().toISOString().slice(0, 10);
  if (frequency === 'monthly') return calendarMonth(ref.slice(0, 7));
  if (frequency === 'termly') {
    const periods = terms.map(termPeriod).sort((a, b) => a.start.localeCompare(b.start));
    return periods.find(p => ref >= p.start && ref < p.endExclusive)
      || [...periods].reverse().find(p => p.start <= ref)
      || periods[0] || null;
  }
  const sm = getCurrentSchoolMonth(ref);
  return { key: sm.start.slice(0, 7), start: sm.start, endExclusive: sm.endExclusive, label: sm.label, short: sm.label };
}

// Billed / collected / outstanding for the fee records whose period starts in [start, end).
export function feeTotals(fees, start, endExclusive) {
  const inRange = fees.filter(f => f.weekStarting >= start && f.weekStarting < endExclusive);
  const billed = inRange.reduce((s, f) => s + Number(f.amount), 0);
  const collected = inRange.filter(f => f.status === 'Paid').reduce((s, f) => s + Number(f.amount), 0);
  return { billed, collected, outstanding: billed - collected };
}
