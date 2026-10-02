// Qur'an reference data and hifz progress maths.
//
// Hifz is recorded by surah and ayah (Hafs numbering, 6,236 ayahs). Each ayah has a
// position 0–6235 counting from Al-Fatihah 1 to An-Nas 6, which makes ranges, juz
// boundaries and "how much is memorised" simple arithmetic.

// [transliterated name, number of ayahs], in surah order (1–114).
export const SURAHS = [
  ['Al-Fatihah', 7], ['Al-Baqarah', 286], ['Al Imran', 200], ['An-Nisa', 176], ["Al-Ma'idah", 120],
  ["Al-An'am", 165], ["Al-A'raf", 206], ['Al-Anfal', 75], ['At-Tawbah', 129], ['Yunus', 109],
  ['Hud', 123], ['Yusuf', 111], ["Ar-Ra'd", 43], ['Ibrahim', 52], ['Al-Hijr', 99],
  ['An-Nahl', 128], ['Al-Isra', 111], ['Al-Kahf', 110], ['Maryam', 98], ['Ta-Ha', 135],
  ['Al-Anbiya', 112], ['Al-Hajj', 78], ["Al-Mu'minun", 118], ['An-Nur', 64], ['Al-Furqan', 77],
  ["Ash-Shu'ara", 227], ['An-Naml', 93], ['Al-Qasas', 88], ["Al-'Ankabut", 69], ['Ar-Rum', 60],
  ['Luqman', 34], ['As-Sajdah', 30], ['Al-Ahzab', 73], ['Saba', 54], ['Fatir', 45],
  ['Ya-Sin', 83], ['As-Saffat', 182], ['Sad', 88], ['Az-Zumar', 75], ['Ghafir', 85],
  ['Fussilat', 54], ['Ash-Shura', 53], ['Az-Zukhruf', 89], ['Ad-Dukhan', 59], ['Al-Jathiyah', 37],
  ['Al-Ahqaf', 35], ['Muhammad', 38], ['Al-Fath', 29], ['Al-Hujurat', 18], ['Qaf', 45],
  ['Adh-Dhariyat', 60], ['At-Tur', 49], ['An-Najm', 62], ['Al-Qamar', 55], ['Ar-Rahman', 78],
  ["Al-Waqi'ah", 96], ['Al-Hadid', 29], ['Al-Mujadilah', 22], ['Al-Hashr', 24], ['Al-Mumtahanah', 13],
  ['As-Saff', 14], ["Al-Jumu'ah", 11], ['Al-Munafiqun', 11], ['At-Taghabun', 18], ['At-Talaq', 12],
  ['At-Tahrim', 12], ['Al-Mulk', 30], ['Al-Qalam', 52], ['Al-Haqqah', 52], ["Al-Ma'arij", 44],
  ['Nuh', 28], ['Al-Jinn', 28], ['Al-Muzzammil', 20], ['Al-Muddaththir', 56], ['Al-Qiyamah', 40],
  ['Al-Insan', 31], ['Al-Mursalat', 50], ['An-Naba', 40], ["An-Nazi'at", 46], ["'Abasa", 42],
  ['At-Takwir', 29], ['Al-Infitar', 19], ['Al-Mutaffifin', 36], ['Al-Inshiqaq', 25], ['Al-Buruj', 22],
  ['At-Tariq', 17], ["Al-A'la", 19], ['Al-Ghashiyah', 26], ['Al-Fajr', 30], ['Al-Balad', 20],
  ['Ash-Shams', 15], ['Al-Layl', 21], ['Ad-Duha', 11], ['Ash-Sharh', 8], ['At-Tin', 8],
  ["Al-'Alaq", 19], ['Al-Qadr', 5], ['Al-Bayyinah', 8], ['Az-Zalzalah', 8], ["Al-'Adiyat", 11],
  ["Al-Qari'ah", 11], ['At-Takathur', 8], ["Al-'Asr", 3], ['Al-Humazah', 9], ['Al-Fil', 5],
  ['Quraysh', 4], ["Al-Ma'un", 7], ['Al-Kawthar', 3], ['Al-Kafirun', 6], ['An-Nasr', 3],
  ['Al-Masad', 5], ['Al-Ikhlas', 4], ['Al-Falaq', 5], ['An-Nas', 6],
];

// Where each of the 30 juz begins: [surah, ayah].
const JUZ_STARTS = [
  [1, 1], [2, 142], [2, 253], [3, 93], [4, 24], [4, 148], [5, 82], [6, 111], [7, 88], [8, 41],
  [9, 93], [11, 6], [12, 53], [15, 1], [17, 1], [18, 75], [21, 1], [23, 1], [25, 21], [27, 56],
  [29, 46], [33, 31], [36, 28], [39, 32], [41, 47], [46, 1], [51, 31], [58, 1], [67, 1], [78, 1],
];

const OFFSETS = [];
let running = 0;
for (const [, count] of SURAHS) { OFFSETS.push(running); running += count; }
export const TOTAL_AYAHS = running; // 6236

export function ayahCount(surah) { return SURAHS[surah - 1]?.[1] || 0; }
export function surahName(surah) { return SURAHS[surah - 1]?.[0] || ''; }

// Position 0–6235 of surah:ayah, or -1 if it doesn't exist.
export function position(surah, ayah) {
  if (!(surah >= 1 && surah <= 114) || !(ayah >= 1 && ayah <= ayahCount(surah))) return -1;
  return OFFSETS[surah - 1] + ayah - 1;
}

// The surah:ayah at a position (clamped into range).
export function fromPosition(pos) {
  const p = Math.min(Math.max(pos, 0), TOTAL_AYAHS - 1);
  let s = 114;
  while (OFFSETS[s - 1] > p) s--;
  return { surah: s, ayah: p - OFFSETS[s - 1] + 1 };
}

// [start, endExclusive) positions of each juz, 1–30.
export const JUZ_RANGES = JUZ_STARTS.map(([s, a], i) => {
  const start = position(s, a);
  const end = i < 29 ? position(...JUZ_STARTS[i + 1]) : TOTAL_AYAHS;
  return [start, end];
});

export function juzOf(surah, ayah) {
  const p = position(surah, ayah);
  return JUZ_RANGES.findIndex(([s, e]) => p >= s && p < e) + 1;
}

// Juz quarters (each juz in four, as marked in the mushaf — every second rub' al-hizb):
// the position each of the 120 quarters starts at, juz 1 quarter 1 → juz 30 quarter 4.
// From the standard Hafs hizb-quarter list (Tanzil data, via the quran-meta package).
const JUZ_QUARTER_STARTS = [
  0, 50, 81, 112, 148, 183, 209, 239, 259, 278, 307, 344, 385, 425, 463, 493, 516, 550, 580, 606,
  640, 669, 695, 719, 750, 777, 824, 862, 899, 929, 954, 1000, 1041, 1095, 1124, 1160, 1200, 1235, 1268, 1294,
  1327, 1356, 1389, 1434, 1478, 1513, 1556, 1602, 1648, 1696, 1725, 1759, 1802, 1901, 1951, 1990, 2029, 2078, 2127, 2171,
  2214, 2271, 2348, 2430, 2483, 2533, 2595, 2632, 2673, 2747, 2811, 2843, 2875, 2932, 3042, 3159, 3214, 3263, 3302, 3340,
  3385, 3439, 3490, 3533, 3563, 3592, 3629, 3674, 3732, 3809, 3932, 4021, 4089, 4133, 4173, 4226, 4264, 4298, 4348, 4430,
  4510, 4554, 4600, 4625, 4705, 4809, 4901, 5053, 5104, 5136, 5177, 5217, 5241, 5323, 5447, 5551, 5672, 5829, 5948, 6090,
];
const quarterIndex = (juz, q) => (juz - 1) * 4 + (q - 1);
// First and last ayah of juz `juz`, quarter `q` (1–4).
export function quarterStart(juz, q) { return fromPosition(JUZ_QUARTER_STARTS[quarterIndex(juz, q)]); }
export function quarterEnd(juz, q) {
  const next = JUZ_QUARTER_STARTS[quarterIndex(juz, q) + 1];
  return fromPosition((next ?? TOTAL_AYAHS) - 1);
}
// { juz, q } of the quarter an ayah is in.
export function quarterOf(surah, ayah) {
  const p = position(surah, ayah);
  let i = JUZ_QUARTER_STARTS.length - 1;
  while (i > 0 && JUZ_QUARTER_STARTS[i] > p) i--;
  return { juz: Math.floor(i / 4) + 1, q: (i % 4) + 1 };
}
export const QUARTER_NAMES = ['1st quarter', '2nd quarter', '3rd quarter', '4th quarter'];

// "Al-Mulk 1–15", "Al-Mulk 28 – Al-Qalam 10"; recorded in quarters: "Juz 29 Q1–Q3",
// "Juz 29 Q4 – Juz 30 Q2", or a whole juz/juz range when it's every quarter.
export function rangeLabel(e) {
  if (!e?.fromSurah) return '';
  if (e.unit === 'quarter') {
    const a = quarterOf(e.fromSurah, e.fromAyah), b = quarterOf(e.toSurah, e.toAyah);
    const [s, t] = (a.juz * 4 + a.q) <= (b.juz * 4 + b.q) ? [a, b] : [b, a];
    if (s.q === 1 && t.q === 4) return s.juz === t.juz ? `Juz ${s.juz}` : `Juz ${s.juz}–${t.juz}`;
    if (s.juz === t.juz) return s.q === t.q ? `Juz ${s.juz} Q${s.q}` : `Juz ${s.juz} Q${s.q}–Q${t.q}`;
    return `Juz ${s.juz} Q${s.q} – Juz ${t.juz} Q${t.q}`;
  }
  const same = e.fromSurah === e.toSurah;
  return same
    ? `${surahName(e.fromSurah)} ${e.fromAyah}${e.toAyah !== e.fromAyah ? `–${e.toAyah}` : ''}`
    : `${surahName(e.fromSurah)} ${e.fromAyah} – ${surahName(e.toSurah)} ${e.toAyah}`;
}

// Where an entry ends — "Ya-Sin 40", or "end of Juz 23 Q2" when recorded in quarters.
export function upToLabel(e) {
  if (!e?.toSurah) return '';
  if (e.unit === 'quarter') { const { juz, q } = quarterOf(e.toSurah, e.toAyah); return `end of Juz ${juz} Q${q}`; }
  return `${surahName(e.toSurah)} ${e.toAyah}`;
}

// Positions covered by an entry, whichever way round it was written.
function span(e) {
  const a = position(e.fromSurah, e.fromAyah);
  const b = position(e.toSurah, e.toAyah);
  if (a < 0 || b < 0) return null;
  return a <= b ? [a, b] : [b, a];
}

// Memorised ayahs: every sabaq not marked "repeat", plus the juz already memorised
// before records started (priorJuz). Optionally only counting sabaq up to a date.
export function memorisedMap(entries, priorJuz = [], untilDate = null) {
  const done = new Uint8Array(TOTAL_AYAHS);
  for (const j of priorJuz) {
    const r = JUZ_RANGES[j - 1];
    if (r) done.fill(1, r[0], r[1]);
  }
  for (const e of entries) {
    if (e.kind !== 'sabaq' || e.grade === 'repeat') continue;
    if (untilDate && e.date > untilDate) continue;
    const s = span(e);
    if (s) done.fill(1, s[0], s[1] + 1);
  }
  return done;
}

// Summary figures for a student's hifz.
export function hifzProgress(entries, priorJuz = []) {
  const done = memorisedMap(entries, priorJuz);
  const juz = JUZ_RANGES.map(([s, e]) => {
    let n = 0;
    for (let p = s; p < e; p++) n += done[p];
    return n / (e - s);
  });
  const ayahs = done.reduce((t, v) => t + v, 0);
  const sabaq = entries.filter(e => e.kind === 'sabaq').sort((a, b) => b.date.localeCompare(a.date));
  const latest = sabaq[0] || null;
  return {
    juz,                                   // 30 fractions 0–1
    completeJuz: juz.filter(f => f >= 0.999).length,
    ayahs,
    percent: Math.round((ayahs / TOTAL_AYAHS) * 1000) / 10,
    latest,                                // most recent sabaq entry
  };
}

// New ayahs memorised between two dates (inclusive start, exclusive end).
export function ayahsMemorisedBetween(entries, priorJuz, startDate, endExclusive) {
  const dayBefore = d => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() - 1); return x.toISOString().slice(0, 10); };
  const before = memorisedMap(entries, priorJuz, dayBefore(startDate));
  const after = memorisedMap(entries, priorJuz, dayBefore(endExclusive));
  let n = 0;
  for (let p = 0; p < TOTAL_AYAHS; p++) if (after[p] && !before[p]) n++;
  return n;
}

// The ayah after an entry's end — the natural start of the next sabaq.
export function nextStart(e) {
  if (!e?.toSurah) return null;
  const s = span(e);
  if (!s) return null;
  // Students going forwards (Al-Baqarah onwards) continue after the end; students
  // memorising Juz 'Amma surah by surah usually go backwards — carry on from the end
  // of the surah they wrote last either way, and let the teacher adjust.
  return fromPosition(position(e.toSurah, e.toAyah) + 1);
}

export const QURAN_TYPES = {
  hifz: { label: 'Hifz', kinds: ['sabaq', 'sabqi', 'manzil'] },
  nazira: { label: 'Nazira (reading)', kinds: ['reading'] },
  qaida: { label: 'Qaida', kinds: ['lesson'] },
};

// What a class can be set to on Classes & Teachers — the three levels, or mixed (each
// student's level chosen individually).
export const CLASS_QURAN_OPTIONS = {
  hifz: 'Hifz', nazira: 'Nazira (reading)', qaida: 'Qaida', mixed: 'Mixed — set each student',
};

// A student's Qur'an level: their own if set, else their class's (a mixed class has none
// until one is chosen for them). null = not tracked / not chosen yet.
export function effectiveQuranType(classType, studentType) {
  if (!classType) return null;
  if (QURAN_TYPES[studentType]) return studentType;
  return QURAN_TYPES[classType] ? classType : null;
}

export const KIND_LABELS = {
  sabaq: { name: 'Sabaq', hint: 'New lesson' },
  sabqi: { name: 'Sabqi', hint: 'Recent revision' },
  manzil: { name: 'Manzil', hint: 'Older revision' },
  reading: { name: 'Reading', hint: 'Where they read to' },
  lesson: { name: 'Lesson', hint: 'Qaida lesson / page' },
};

export const GRADES = [
  { key: 'good', label: 'Good', color: 'var(--green)', bg: 'var(--green-light)', text: 'var(--green-text)' },
  { key: 'weak', label: 'Weak', color: 'var(--amber)', bg: 'var(--amber-light)', text: 'var(--amber-text)' },
  { key: 'repeat', label: 'Repeat', color: 'var(--red)', bg: 'var(--red-light)', text: 'var(--red-text)' },
];
