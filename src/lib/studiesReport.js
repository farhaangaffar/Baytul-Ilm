// A school pupil's Islamic Studies report at an assessment point (server/routes/school-reports.js) — just the stats:
// their year's surahs, du'aas and practicals with each mark, the figures, earlier years at a glance, and how many more
// they've achieved since the last point. Shared by the Reports page, its PDF and the parent portal.
import { tally, STUDY_KINDS } from './studies';

export const EFFORTS = [['Excellent', 'green'], ['Good', 'blue'], ['Needs to improve', 'amber']];

// items: every item (any year); marks: { itemId: 1|2|3 } at this point; previous: the same at the point before (or null).
export function reportOf({ items, marks = {}, previous = null, yearGroup = null }) {
  const lvl = it => Number(marks[it.id]) || 0;
  const thisYear = items.filter(it => (yearGroup === null || yearGroup === undefined ? true : it.yearGroup === yearGroup));
  const earlier = yearGroup === null || yearGroup === undefined ? [] : items.filter(it => it.yearGroup < yearGroup);
  const kinds = STUDY_KINDS.map(([k, label]) => ({ kind: k, label, list: thisYear.filter(it => it.kind === k).map(it => ({ ...it, level: lvl(it) })) }))
    .filter(k => k.list.length);
  const counted = [...thisYear, ...earlier];
  const gained = previous ? counted.filter(it => lvl(it) === 3 && Number(previous[it.id]) !== 3).length : null;
  return {
    t: tally(thisYear, lvl),
    earlier: earlier.length ? tally(earlier, lvl) : null,
    kinds,
    gained,
    toWork: counted.filter(it => lvl(it) === 1 || lvl(it) === 2).length,
  };
}
