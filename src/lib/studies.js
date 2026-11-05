// A school's Islamic Studies (server/routes/studies.js): the words, levels and sums the pages share, and matching names
// from a school's own spreadsheets to its lists.
import { SURAHS } from './quran';

export const yearLabel = y => (y === null || y === undefined ? 'No year group' : y === 0 ? 'Reception' : `Year ${y}`);
export const STUDY_KINDS = [['surah', 'Surahs', 'surah'], ['duaa', "Du'aas", "du'aa"], ['practical', 'Practicals', 'practical']];

// The school's own 1-2-3 (as in its sheets); no mark = Not assessed yet.
export const LEVELS = [[1, 'Incomplete', 'red'], [2, 'Completed with help', 'amber'], [3, 'Achieved', 'green']];
export const LEVEL_NAME = { 0: 'Not assessed yet', 1: 'Incomplete', 2: 'Completed with help', 3: 'Achieved' };
export const LEVEL_TONE = { 1: 'red', 2: 'amber', 3: 'green' };
export const LEVEL_COLOUR = { 0: '#e5e8ec', 1: 'var(--red)', 2: 'var(--amber)', 3: 'var(--green)' };

// How a set of items stands: counts, and percentages of what's been assessed (as the school's sheets work them out).
export function tally(items, levelOf) {
  const t = { achieved: 0, withHelp: 0, incomplete: 0, notAssessed: 0, total: items.length };
  for (const it of items) {
    const l = levelOf(it) || 0;
    if (l === 3) t.achieved++; else if (l === 2) t.withHelp++; else if (l === 1) t.incomplete++; else t.notAssessed++;
  }
  t.assessed = t.total - t.notAssessed;
  const pc = n => (t.assessed ? Math.round((n / t.assessed) * 100) : 0);
  t.pctAchieved = pc(t.achieved); t.pctWithHelp = pc(t.withHelp); t.pctIncomplete = pc(t.incomplete);
  return t;
}

// A name as written in different spreadsheets — "Faatihah", "Al-Fatihah", "Kaafiroon", "Al-Kafirun" — boiled down so they match.
export function plainName(s) {
  let n = String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
  n = n.replace(/^(surah|surat|soorah)\s+/, '').replace(/^(al|an|ad|at|as|ash|az|ar|adh|ath)[-\s]+/, '');
  n = n.replace(/[^a-z]/g, '').replace(/aa+/g, 'a').replace(/ee+/g, 'i').replace(/oo+/g, 'u').replace(/ii+/g, 'i').replace(/uu+/g, 'u');
  return n.replace(/^(al|an|ad|at|as|ash|az|ar)(?=[a-z]{4,})/, '');
}

// Other names a few surahs go by.
const SURAH_ALIASES = { lahab: 111, tabbat: 111, zilzal: 99, zilzalah: 99, inshirah: 94, alamnashrah: 94, sharh: 94, yasin: 36, dahr: 76, takwir: 81, mulk: 67 };
const SURAH_BY_NAME = Object.fromEntries(SURAHS.map(([name], i) => [plainName(name), i + 1]));
export const surahNumber = name => { const p = plainName(name); return SURAH_BY_NAME[p] || SURAH_ALIASES[p] || null; };
export const surahAyahs = n => (n >= 1 && n <= 114 ? SURAHS[n - 1][1] : 0);
