// A school's Islamic Studies starter lists (server/routes/studies.js, "Use the starter lists"): the surahs, du'aas and
// practicals usually learnt in each year group, Reception (0) to Year 11. Every school changes, removes and adds to
// them — nothing here belongs to one school. [name, detail, year group] (a whole surah also gets its number, from "Surah N",
// so its aayahs show on the class's weekly tracker).

const SURAHS = [
  ['Al-Fatihah', 'Surah 1', 0], ['Al-Ikhlas', 'Surah 112', 0], ['Al-Falaq', 'Surah 113', 0], ['An-Nas', 'Surah 114', 0],
  ['Al-Kawthar', 'Surah 108', 1], ["Al-'Asr", 'Surah 103', 1], ['An-Nasr', 'Surah 110', 1], ['Al-Masad', 'Surah 111', 1],
  ['Al-Kafirun', 'Surah 109', 2], ["Al-Ma'un", 'Surah 107', 2], ['Quraysh', 'Surah 106', 2], ['Al-Fil', 'Surah 105', 2],
  ['Al-Humazah', 'Surah 104', 3], ['At-Takathur', 'Surah 102', 3], ["Al-Qari'ah", 'Surah 101', 3], ["Al-'Adiyat", 'Surah 100', 3],
  ['Az-Zalzalah', 'Surah 99', 4], ['Al-Qadr', 'Surah 97', 4], ['At-Tin', 'Surah 95', 4], ['Ash-Sharh', 'Surah 94', 4], ['Ad-Duha', 'Surah 93', 4],
  ['Al-Bayyinah', 'Surah 98', 5], ["Al-'Alaq", 'Surah 96', 5], ['Al-Layl', 'Surah 92', 5], ['Ash-Shams', 'Surah 91', 5],
  ['Al-Balad', 'Surah 90', 6], ['Al-Fajr', 'Surah 89', 6], ['Al-Ghashiyah', 'Surah 88', 6], ["Al-A'la", 'Surah 87', 6], ['At-Tariq', 'Surah 86', 6],
  ['Ayat al-Kursi', 'Al-Baqarah 255', 7], ['Al-Buruj', 'Surah 85', 7], ['Al-Inshiqaq', 'Surah 84', 7], ['Al-Infitar', 'Surah 82', 7],
  ['Al-Mutaffifin', 'Surah 83', 8], ['At-Takwir', 'Surah 81', 8], ["'Abasa", 'Surah 80', 8],
  ["An-Nazi'at", 'Surah 79', 9], ['An-Naba', 'Surah 78', 9], ['Last two ayahs of Al-Baqarah', 'Al-Baqarah 285–286', 9],
  ['Al-Mulk', 'Surah 67', 10], ['Ya-Sin (first part)', 'Surah 36, ayahs 1–12', 10],
  ['Ar-Rahman (first part)', 'Surah 55, ayahs 1–25', 11], ['Al-Kahf (first ten ayahs)', 'Surah 18, ayahs 1–10', 11],
];

const DUAAS = [
  ['Before eating', 'Bismillah', 0], ['After eating', '', 0], ['Before sleeping', '', 0], ['On waking up', '', 0],
  ['When sneezing, and the reply', '', 1], ['Entering the toilet', '', 1], ['Leaving the toilet', '', 1], ['Thanking someone', 'Jazakallahu khairan', 1],
  ['Leaving the home', '', 2], ['Entering the home', '', 2], ['Before wudhu', '', 2], ['After wudhu', '', 2],
  ['Entering the masjid', '', 3], ['Leaving the masjid', '', 3], ['Wearing new clothes', '', 3], ['For parents', 'Rabbir-hamhuma…', 3],
  ['For knowledge', "Rabbi zidni 'ilma", 4], ['When travelling', '', 4], ['When it rains', '', 4], ['When looking in the mirror', '', 4],
  ['When visiting someone who is ill', '', 5], ['When angry', "A'udhu billah…", 5], ['After the adhan', '', 5], ['Rabbana atina', 'Al-Baqarah 201', 5],
  ['Du\'aa al-Qunut', 'Witr', 6], ['Tasbih after salah', 'SubhanAllah, Alhamdulillah, Allahu Akbar', 6], ['When in difficulty', '', 6],
  ['Sayyid al-Istighfar', '', 7], ['Morning and evening adhkar', '', 7], ['For guidance', '', 8], ['Istikharah', '', 9],
  ['For the deceased (Janazah)', '', 9], ['Before an exam or a hard task', 'Rabbi-shrah li sadri…', 10],
];

const PRACTICALS = [
  ['Wudhu', 'Washing in the right order', 1], ['Positions of salah', 'Standing, bowing, prostrating, sitting', 1],
  ['Wudhu — what breaks it', '', 2], ['Saying the takbir and surah in salah', '', 2],
  ['Two rak\'ahs of salah', 'e.g. Fajr', 3], ['Tashahhud and salawat', '', 3],
  ['A full four-rak\'ah salah', '', 4], ['Adhan', '', 4], ['Iqamah', '', 4],
  ['Tayammum', '', 5], ['Leading salah in a group', '', 5],
  ['Witr salah', '', 6], ['Jumu\'ah: what happens and why', '', 6],
  ['Ghusl', '', 7], ['Masah over socks', '', 7],
  ['Sajdah sahw (prostration of forgetfulness)', '', 8], ['Salah while travelling', '', 8],
  ['Janazah salah', '', 9], ['Eid salah', '', 9],
  ['Making up missed salah', '', 10], ['Hajj and Umrah: the steps', '', 10],
];

const STARTER = [
  ...SURAHS.map(([n, d, y]) => ['surah', n, d, y, /^Surah (\d+)$/.test(d) ? Number(d.slice(6)) : null]),
  ...DUAAS.map(([n, d, y]) => ['duaa', n, d, y]),
  ...PRACTICALS.map(([n, d, y]) => ['practical', n, d, y]),
];

module.exports = { STARTER };
