// Report periods (Settings → "Reports are made"): monthly — the original system, one
// report per school month (each month from its first Monday) — termly, one per term
// using the term dates in Settings — or yearly, one per academic year (first Monday of
// September to the next). A saved report summary (ai_summaries.month) is keyed 'YYYY-MM'
// for a month, 'term:<termId>' for a term or 'year:<26-27>' for a year.
import { getBranding } from './branding';
import { ukToday } from './feePeriods';
import { getCurrentSchoolMonth, currentSchoolMonthKey, academicYearOfMonth, academicYearStartISO } from './store';

export function reportPeriodSetting() {
  const p = getBranding().reportPeriod;
  return p === 'termly' || p === 'yearly' ? p : 'monthly';
}
// "month" | "term" | "year" — for labels like "This term"
export function reportUnit() { return { termly: 'term', yearly: 'year' }[reportPeriodSetting()] || 'month'; }

const YEAR_PREFIX = 'year:';
export const yearKey = y => `${YEAR_PREFIX}${y}`;
export const isYearKey = key => String(key || '').startsWith(YEAR_PREFIX);
// "26-27" → "27-28"
const nextYearLabel = y => { const a = Number(y.slice(0, 2)) + 1; return `${String(a).padStart(2, '0')}-${String(a + 1).padStart(2, '0')}`; };

const TERM_PREFIX = 'term:';
export const termKey = t => `${TERM_PREFIX}${t.id}`;
export const isTermKey = key => String(key || '').startsWith(TERM_PREFIX);

function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
// "26-27" → "2026-27"
function longYear(y) { return /^\d{2}-\d{2}$/.test(y) ? `20${y}` : y; }

export function termLabel(t) {
  const name = /term/i.test(t.name) ? t.name : `${t.name} Term`;
  return `${name} ${longYear(t.year)}`;
}

// { key, kind: 'month'|'term'|'year', start, endExclusive, label, yearLabel } for a saved key.
export function periodForKey(key, terms = []) {
  if (isYearKey(key)) {
    const y = key.slice(YEAR_PREFIX.length);
    return { key, kind: 'year', start: academicYearStartISO(y), endExclusive: academicYearStartISO(nextYearLabel(y)), label: `${longYear(y)} academic year`, yearLabel: y };
  }
  if (isTermKey(key)) {
    const t = terms.find(x => String(x.id) === key.slice(TERM_PREFIX.length));
    if (!t) return { key, kind: 'term', start: '0000-01-01', endExclusive: '0000-01-01', label: 'Term (dates removed)', yearLabel: '' };
    return { key, kind: 'term', start: t.startDate, endExclusive: addDays(t.endDate, 1), label: termLabel(t), yearLabel: t.year };
  }
  const sm = getCurrentSchoolMonth(`${key}-15`);
  const [y, m] = key.split('-').map(Number);
  return {
    key, kind: 'month', start: sm.start, endExclusive: sm.endExclusive,
    label: new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
    yearLabel: academicYearOfMonth(key),
  };
}

// The period reports are currently being written for: this school month, this academic year, or the term
// containing today (else the latest one already started, else the first). Null when
// reports are termly but no terms have been entered.
export function currentReportPeriod(terms = [], refIso) {
  if (reportPeriodSetting() === 'yearly') return periodForKey(yearKey(academicYearOfMonth(refIso ? getCurrentSchoolMonth(refIso).start.slice(0, 7) : currentSchoolMonthKey())), terms);
  if (reportPeriodSetting() !== 'termly') return periodForKey(refIso ? getCurrentSchoolMonth(refIso).start.slice(0, 7) : currentSchoolMonthKey(), terms);
  const ref = refIso || new Date().toISOString().slice(0, 10);
  const sorted = [...terms].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const t = sorted.find(x => ref >= x.startDate && ref <= x.endDate)
    || [...sorted].reverse().find(x => x.startDate <= ref)
    || sorted[0];
  return t ? periodForKey(termKey(t), terms) : null;
}

// A student's fee records that belong on a report for `period`. Weekly and termly fee
// records count when their start date falls in the period. Monthly fee records are
// dated the 1st, which can fall before a school month's or term's first day, so: a
// monthly report takes that calendar month's record, and a termly report takes every
// month from the one the term starts in.
export function feesForReport(fees, studentId, period) {
  const today = ukToday();
  return fees.filter(f => {
    if (f.studentId !== studentId) return false;
    // Unpaid fees for weeks/months still to come aren't owed yet.
    if (f.status !== 'Paid' && f.weekStarting > today) return false;
    if (f.period === 'month') {
      if (period.kind === 'month') return f.weekStarting === `${period.key}-01`;
      return f.weekStarting >= `${period.start.slice(0, 7)}-01` && f.weekStarting < period.endExclusive;
    }
    return f.weekStarting >= period.start && f.weekStarting < period.endExclusive;
  });
}
