// Client for the /api backend — every function here used to read/write localStorage
// synchronously; now every function is async and talks to the Postgres-backed API
// instead, so data is shared across devices rather than trapped in one browser.

import { getMadrasahCode } from './madrasahCode';

export class AuthError extends Error {}
export class NetworkError extends Error {}

// ── British date formatting (dd/mm/yyyy) — accepts an ISO 'YYYY-MM-DD' string or a Date ──
export function formatDateGB(value) {
  const d = value instanceof Date ? value : new Date(`${value}T12:00:00`);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}
export function formatDayMonthGB(value) {
  const d = value instanceof Date ? value : new Date(`${value}T12:00:00`);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function apiFetch(path, options = {}) {
  let res;
  try {
    res = await fetch(path, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
  } catch {
    throw new NetworkError('Could not reach the server. Check your connection and try again.');
  }
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try { const body = await res.json(); if (body?.error) msg = body.error; } catch {}
    if (res.status === 401) {
      // Signed out mid-use (login switched off, password reset, session expired):
      // tell the app so it can go back to the sign-in screen. Not for the sign-in
      // calls themselves, where a 401 just means a wrong password.
      if (!/^\/api\/(login|session)\b/.test(path)) window.dispatchEvent(new Event('session-ended'));
      throw new AuthError(msg);
    }
    // "Not allowed" usually means this tab is out of date about who's signed in (e.g.
    // a different person signed in from another tab) — ask the app to re-check.
    if (res.status === 403) window.dispatchEvent(new Event('session-check'));
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ── Auth ──
// Normal sign-in. Before the owner account exists, the school password answers
// { setupRequired: true } instead of signing in (see server/routes/login.js).
// code: the madrasah's sign-in code (optional when the username + password match only one login).
export async function login(code, loginName, password) {
  return apiFetch('/api/login', { method: 'POST', body: JSON.stringify({ code, login: loginName, password }) });
}
export async function setupOwner(recoveryKey, loginName, password) {
  return apiFetch('/api/login?action=setup', { method: 'POST', body: JSON.stringify({ recoveryKey, login: loginName, password }) });
}
export async function recoverOwner(recoveryKey, password) {
  return apiFetch('/api/login?action=recover', { method: 'POST', body: JSON.stringify({ recoveryKey, password }) });
}
export async function changePassword(currentPassword, newPassword) {
  return apiFetch('/api/login?action=change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
}
export async function logout() {
  return apiFetch('/api/logout', { method: 'POST' });
}
// → { authenticated, setupRequired, user?: { login, role, teacherId, classId, classNames,
//     platformAdmin, madrasah: { code, name } } }
export async function getSession() {
  return apiFetch('/api/session');
}

// ── Teacher and class logins (owner only) ──
// data: { login, password, teacherId } for a teacher's own login, or { login, password, classId }
// for a shared login for a whole class.
export async function getUsers() { return apiFetch('/api/users'); }
export async function createUser(data) {
  return apiFetch('/api/users', { method: 'POST', body: JSON.stringify(data) });
}
export async function updateUser(id, data) { return apiFetch(`/api/users?id=${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }); }
export async function deleteUser(id) { return apiFetch(`/api/users?id=${encodeURIComponent(id)}`, { method: 'DELETE' }); }

// ── Madaaris (platform owner only) ──
export async function getMadaaris() { return apiFetch('/api/madaaris'); }
// data: { name, code, headLogin, headPassword }
export async function createMadrasah(data) { return apiFetch('/api/madaaris', { method: 'POST', body: JSON.stringify(data) }); }
// data: any of { name, code, active, headPassword }
export async function updateMadrasah(id, data) { return apiFetch(`/api/madaaris?id=${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }); }

// ── Academic years ──
export async function getAcademicYears() { return apiFetch('/api/academic-years'); }
export async function addAcademicYear(y) { return apiFetch('/api/academic-years', { method: 'POST', body: JSON.stringify({ year: y }) }); }
export async function removeAcademicYear(y) { return apiFetch(`/api/academic-years?year=${encodeURIComponent(y)}`, { method: 'DELETE' }); }
// Relabels a year everywhere it's stored (academic_years, attendance, fees) — used to
// fix a year that was entered in the wrong "YYYY-YY" shape instead of this app's "YY-YY".
export async function renameAcademicYear(from, to) {
  return apiFetch('/api/academic-years?action=rename', { method: 'POST', body: JSON.stringify({ from, to }) });
}
export async function currentSchoolYear() {
  const years = await getAcademicYears();
  const now = new Date(), m = now.getMonth(), yr = now.getFullYear();
  let start = m >= 8 ? yr : yr - 1;
  // Respect the "a month starts from its first Monday" rule at the year boundary too —
  // if today is calendar-September but before that September's actual first Monday, the
  // new school year hasn't started yet and we're still in the previous one's August block
  // (matching getSchoolMonthRange/getCurrentSchoolMonth, used everywhere else for this).
  const todayISO = now.toISOString().split('T')[0];
  if (todayISO < firstMondayOfMonthISO(start, 8)) start -= 1;
  const label = `${String(start).slice(2)}-${String(start + 1).slice(2)}`;
  return years.includes(label) ? label : years[years.length - 1];
}
// Same Sep–Aug school-year convention as currentSchoolYear(), applied to any
// "YYYY-MM" month string rather than just "now" — used to bucket saved
// per-month report data (ai_summaries rows) into academic-year sections.
export function academicYearOfMonth(monthStr) {
  const [yyyy, mm] = monthStr.split('-').map(Number);
  const start = mm - 1 >= 8 ? yyyy : yyyy - 1;
  return `${String(start).slice(2)}-${String(start + 1).slice(2)}`;
}
// The true start of a "YY-YY" academic year — the first Monday of September, not the
// literal 1st (which, per the "month starts from its first Monday" rule, can still belong
// to August's block) — the default reference point for pages that let you browse a
// specific year, since "today" only means something for whichever year is actually
// current. Using the literal 1st here fed straight into getCurrentSchoolMonth/getWeekDates
// would walk backward into the previous year's last month whenever Sept 1 isn't itself a
// Monday — this is the fix for that.
export function academicYearStartISO(yearLabel) {
  const startYear = 2000 + Number(yearLabel.slice(0, 2));
  return firstMondayOfMonthISO(startYear, 8); // month index 8 = September
}

// ── School month — every month runs from its first Monday to the day before the next month's first Monday ──
function firstMondayOfMonthISO(year, monthIndex0) {
  const d = new Date(year, monthIndex0, 1, 12);
  d.setDate(d.getDate() + (1 - d.getDay() + 7) % 7);
  return d.toISOString().split('T')[0];
}
export function getCurrentSchoolMonth(refIso) {
  const ref = refIso || new Date().toISOString().split('T')[0];
  const refDate = new Date(ref + 'T12:00:00');
  const y = refDate.getFullYear(), m = refDate.getMonth();
  const thisFirstMon = firstMondayOfMonthISO(y, m);
  if (ref >= thisFirstMon) {
    const nextY = m === 11 ? y + 1 : y, nextM = (m + 1) % 12;
    return { start: thisFirstMon, endExclusive: firstMondayOfMonthISO(nextY, nextM), label: refDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) };
  }
  const prevY = m === 0 ? y - 1 : y, prevM = (m + 11) % 12;
  return { start: firstMondayOfMonthISO(prevY, prevM), endExclusive: thisFirstMon, label: new Date(prevY, prevM, 1, 12).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) };
}
// Today's "current month" as a plain "YYYY-MM" key, per the same school-month rule as
// getCurrentSchoolMonth — for tagging/looking up "this month" (saved AI summaries, the
// Daily Records "This month" stats card) rather than today's literal calendar month,
// which can disagree by up to 6 days at either end of a month (see getCurrentSchoolMonth).
export function currentSchoolMonthKey() {
  return getCurrentSchoolMonth().start.slice(0, 7);
}

// ── Students ──
// A student whose enrollDate is still in the future hasn't started yet — keep them out
// of class rosters (Attendance, Daily Records, Fees) until that date arrives, rather
// than treating them as already attending from the moment their profile is created.
// No enrollDate on file counts as already enrolled (matches the fee-billing fallback).
export function hasEnrolledBy(student, todayIso) {
  return !student.enrollDate || student.enrollDate <= todayIso;
}
export async function getStudents() { return apiFetch('/api/students'); }
export async function getStudent(id) { const list = await getStudents(); return list.find(s => s.id === id); }
export async function addStudent(student) { return apiFetch('/api/students', { method: 'POST', body: JSON.stringify(student) }); }
export async function updateStudent(id, data) { return apiFetch(`/api/students?id=${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }); }
export async function deleteStudent(id) { return apiFetch(`/api/students?id=${encodeURIComponent(id)}`, { method: 'DELETE' }); }
// ids is the full new card order for whichever class was just reordered — every
// other student's position is left alone (see api/students.js for how nulls sort).
export async function reorderStudents(ids) { return apiFetch('/api/students?action=reorder', { method: 'POST', body: JSON.stringify({ ids }) }); }
export function avatarInitials(name) { return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase(); }
// All-time attendance/fees/daily-record totals for a set of students, spanning every
// academic year — used for the "students who have left" summary cards. Returns
// { [studentId]: { present, late, absent, paid, owed, recordsCount } }.
export async function getStudentTotals(ids) {
  if (!ids.length) return {};
  return apiFetch(`/api/students?action=totals&ids=${encodeURIComponent(ids.join(','))}`);
}
// Removes a left student's own still-unpaid weeks from fromDate onward — anything
// already Paid is untouched. Returns { ok, deleted }.
export async function cancelRemainingFees(studentId, fromDate) {
  return apiFetch('/api/fees?action=cancel-remaining', { method: 'DELETE', body: JSON.stringify({ studentId, fromDate }) });
}

// ── Attendance (keyed by year) ──
export async function getAttendance(year) { return apiFetch(`/api/attendance?year=${encodeURIComponent(year)}`); }
// time: 'HH:MM' when marking Late on the day (shown in the student's attendance view).
export async function setAttendance(studentId, date, status, year, time) {
  return apiFetch('/api/attendance', { method: 'PUT', body: JSON.stringify({ studentId, date, status, year, time }) });
}
// { studentId: { date: 'HH:MM' } } — when each Late mark was made, where known.
export async function getLateTimes(year) { return apiFetch(`/api/attendance?year=${encodeURIComponent(year)}&times`); }
export async function getStudentAttendance(studentId, year) {
  const all = await getAttendance(year);
  return all[studentId] || {};
}
export async function calcAttendancePct(studentId, year) {
  const days = Object.values(await getStudentAttendance(studentId, year));
  if (!days.length) return 0;
  return Math.round((days.filter(d => d === 'P' || d === 'L').length / days.length) * 100);
}
export async function calcAttendanceCounts(studentId, year) {
  const days = Object.values(await getStudentAttendance(studentId, year));
  return { present: days.filter(d => d === 'P').length, late: days.filter(d => d === 'L').length, absent: days.filter(d => d === 'A').length, total: days.length };
}
// Sync variants for rendering a list of students — fetch getAttendance(year)/getFees(year)
// ONCE at the page level, then use these per-student in a loop instead of the async
// versions above, which would otherwise mean one network round-trip per student card.
export function attendanceCountsFrom(attendanceForYear, studentId) {
  const days = Object.values(attendanceForYear[studentId] || {});
  return { present: days.filter(d => d === 'P').length, late: days.filter(d => d === 'L').length, absent: days.filter(d => d === 'A').length, total: days.length };
}
export function attendancePctFrom(attendanceForYear, studentId) {
  const days = Object.values(attendanceForYear[studentId] || {});
  if (!days.length) return 0;
  return Math.round((days.filter(d => d === 'P' || d === 'L').length / days.length) * 100);
}
// Same as attendanceCountsFrom, but scoped to a single school month (as
// returned by getCurrentSchoolMonth) instead of the whole year — used by
// the PDF report, which shows one month's attendance, not year-to-date.
export function attendanceCountsForMonth(attendanceForYear, studentId, monthRange) {
  const days = Object.entries(attendanceForYear[studentId] || {})
    .filter(([date]) => date >= monthRange.start && date < monthRange.endExclusive)
    .map(([, status]) => status);
  return { present: days.filter(d => d === 'P').length, late: days.filter(d => d === 'L').length, absent: days.filter(d => d === 'A').length, total: days.length };
}
export function getWeekDates(anchor) {
  const d = new Date(anchor + 'T12:00:00'), day = d.getDay();
  const mon = new Date(d); mon.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  return [0, 1, 2, 3].map(i => { const dt = new Date(mon); dt.setDate(mon.getDate() + i); return dt.toISOString().split('T')[0]; });
}

// ── Fees (keyed by year) ──
export async function getFees(year) { return apiFetch(`/api/fees?year=${encodeURIComponent(year)}`); }
export async function addFeeRecord(rec, year) {
  return apiFetch('/api/fees', { method: 'POST', body: JSON.stringify({ ...rec, year }) });
}
export async function addFeeMonth(year, weeks, students) {
  return apiFetch('/api/fees?action=add-month', { method: 'POST', body: JSON.stringify({ year, weeks, students }) });
}
export async function deleteFeeMonth(year, weeks, className) {
  return apiFetch('/api/fees?action=delete-month', { method: 'DELETE', body: JSON.stringify({ year, weeks, className }) });
}
export async function markFeePaid(feeId, year) { return apiFetch(`/api/fees?id=${encodeURIComponent(feeId)}`, { method: 'PATCH', body: JSON.stringify({ status: 'Paid' }) }); }
export async function markFeeUnpaid(feeId, year) { return apiFetch(`/api/fees?id=${encodeURIComponent(feeId)}`, { method: 'PATCH', body: JSON.stringify({ status: 'Pending' }) }); }
export async function deleteFeeRecord(feeId, year) { return apiFetch(`/api/fees?id=${encodeURIComponent(feeId)}`, { method: 'DELETE' }); }
export async function updateFeeAmount(feeId, amount, year) { return apiFetch(`/api/fees?id=${encodeURIComponent(feeId)}`, { method: 'PATCH', body: JSON.stringify({ amount: Number(amount) }) }); }
export async function getStudentFees(studentId, year) {
  const fees = await getFees(year);
  return fees.filter(f => f.studentId === studentId).sort((a, b) => b.weekStarting.localeCompare(a.weekStarting));
}
// Sync variant — fetch getFees(year) once, then use this per-student in a loop.
export function studentFeesFrom(feesForYear, studentId) {
  return feesForYear.filter(f => f.studentId === studentId).sort((a, b) => b.weekStarting.localeCompare(a.weekStarting));
}
// Monthly/termly billing: one fee record per period ({ start, endExclusive }) per student.
export async function addFeePeriods(year, period, periods, students) {
  return apiFetch('/api/fees?action=add-month', { method: 'POST', body: JSON.stringify({ year, period, periods, students }) });
}
export async function deleteFeePeriods(year, period, starts, className) {
  return apiFetch('/api/fees?action=delete-month', { method: 'DELETE', body: JSON.stringify({ year, period, weeks: starts, className }) });
}

// ── Terms (Settings → Terms; per academic year) ──
export async function getTerms(year) { return apiFetch(year ? `/api/terms?year=${encodeURIComponent(year)}` : '/api/terms'); }
export async function addTerm(term) { return apiFetch('/api/terms', { method: 'POST', body: JSON.stringify(term) }); }
export async function updateTerm(id, data) { return apiFetch(`/api/terms?id=${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }); }
export async function deleteTerm(id) { return apiFetch(`/api/terms?id=${encodeURIComponent(id)}`, { method: 'DELETE' }); }

export async function deleteWeekFees(weekStarting, year, cls) {
  return apiFetch('/api/fees?action=week', { method: 'DELETE', body: JSON.stringify({ year, weekStarting, className: cls }) });
}
export function getMondayOf(dateStr) {
  const d = new Date(dateStr + 'T12:00:00'), day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1)); return d.toISOString().split('T')[0];
}
// A "month" here always runs from its first Monday to the day before the next month's first Monday
export function getSchoolMonthRange(yearMonth) {
  const [y, m] = yearMonth.split('-').map(Number); // m is 1-indexed
  const start = firstMondayOfMonthISO(y, m - 1);
  const nextY = m === 12 ? y + 1 : y, nextM0 = m % 12;
  const endExclusive = firstMondayOfMonthISO(nextY, nextM0);
  return { start, endExclusive };
}
// Get all Mon week-start dates for a given month (YYYY-MM), using the first-Monday rule above
export function getWeekStartsForMonth(yearMonth) {
  const { start, endExclusive } = getSchoolMonthRange(yearMonth);
  const weeks = [];
  let d = new Date(start + 'T12:00:00');
  while (d.toISOString().split('T')[0] < endExclusive) {
    weeks.push(d.toISOString().split('T')[0]);
    d.setDate(d.getDate() + 7);
  }
  return weeks;
}

// ── Classes ──
export async function getClasses() { return apiFetch('/api/classes'); }
export async function getClass(id) { const list = await getClasses(); return list.find(c => c.id === id); }
export async function addClass(cls) { return apiFetch('/api/classes', { method: 'POST', body: JSON.stringify(cls) }); }
export async function updateClass(id, data) { return apiFetch(`/api/classes?id=${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }); }
export async function deleteClass(id) { return apiFetch(`/api/classes?id=${encodeURIComponent(id)}`, { method: 'DELETE' }); }
// ── Qur'an progress (hifz / nazira / qaida) — see server/routes/quran.js ──
// One student → { entries, priorJuz }; everyone visible → { studentId: { entries, priorJuz } }
export async function getQuranProgress(studentId) {
  return apiFetch(`/api/quran${studentId ? `?studentId=${encodeURIComponent(studentId)}` : ''}`);
}
// entry: { studentId, date, kind, fromSurah, fromAyah, toSurah, toAyah, lesson, grade, note, unit }
// A new entry each time (a day can have several); pass `id` to change an existing one.
export async function addQuranEntry(entry) { return apiFetch('/api/quran', { method: 'POST', body: JSON.stringify(entry) }); }
export async function updateQuranEntry(id, entry) {
  return apiFetch(`/api/quran?id=${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(entry) });
}
export async function deleteQuranEntry(studentId, id) {
  return apiFetch(`/api/quran?id=${encodeURIComponent(id)}`, { method: 'DELETE', body: JSON.stringify({ studentId }) });
}
// A student's own Qur'an level ('hifz' | 'nazira' | 'qaida'), or null to follow their class.
export async function saveStudentQuranType(studentId, quranType) {
  return apiFetch('/api/quran?action=type', { method: 'PUT', body: JSON.stringify({ studentId, quranType }) });
}
export async function savePriorJuz(studentId, priorJuz) {
  return apiFetch('/api/quran?action=prior', { method: 'PUT', body: JSON.stringify({ studentId, priorJuz }) });
}

export async function getClassNames() {
  // A new madrasah starts with no classes (they're added on Classes & Teachers).
  return (await getClasses()).map(c => c.name);
}
export async function classTeacherName(tid) { if (!tid) return 'Unassigned'; const t = await getTeacher(tid); return t ? t.name : 'Unassigned'; }

// ── Teachers ──
export async function getTeachers() { return apiFetch('/api/teachers'); }
export async function getTeacher(id) { const list = await getTeachers(); return list.find(t => t.id === id); }
export async function addTeacher(t) { return apiFetch('/api/teachers', { method: 'POST', body: JSON.stringify(t) }); }
export async function updateTeacher(id, data) { return apiFetch(`/api/teachers?id=${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }); }
export async function reorderTeachers(ids) { return apiFetch('/api/teachers?action=reorder', { method: 'POST', body: JSON.stringify({ ids }) }); }
export async function deleteTeacher(id) { return apiFetch(`/api/teachers?id=${encodeURIComponent(id)}`, { method: 'DELETE' }); }

// ── Settings ──
const DEFAULT_WEEKLY_FEE = 15;
const DEFAULT_SETTINGS = { schoolName: 'Madrasah', schoolNameArabic: '', defaultWeeklyFee: DEFAULT_WEEKLY_FEE, currencySymbol: '£' };
// Signed in: your own madrasah's settings. Before signing in: the name and logo of the
// madrasah this device remembers (?m=), if any.
export async function getSettings() {
  const code = getMadrasahCode();
  const s = await apiFetch(`/api/settings${code ? `?m=${encodeURIComponent(code)}` : ''}`);
  return { ...DEFAULT_SETTINGS, ...s };
}
export async function updateSettings(data) { return apiFetch('/api/settings', { method: 'PATCH', body: JSON.stringify(data) }); }
export async function getDefaultWeeklyFee() { const s = await getSettings(); return s.defaultWeeklyFee ?? DEFAULT_WEEKLY_FEE; }

// ── Daily records ──
export async function getDailyRecords() { return apiFetch('/api/daily-records'); }
export async function saveDailyRecord(studentId, date, data) {
  return apiFetch('/api/daily-records', { method: 'PUT', body: JSON.stringify({ studentId, date, ...data }) });
}
export async function deleteDailyRecord(studentId, date) {
  return apiFetch('/api/daily-records', { method: 'DELETE', body: JSON.stringify({ studentId, date }) });
}
export async function getStudentRecords(studentId) { return apiFetch(`/api/daily-records?studentId=${encodeURIComponent(studentId)}`); }

// ── AI monthly summaries — saved separately from a one-off generation, so a
// summary attached to a report survives navigating away and back. Shares
// /api/ai-summary (singular) with the generation endpoint. ──
export async function getAiSummaries(studentId) { return apiFetch(`/api/ai-summary?studentId=${encodeURIComponent(studentId)}`); }
export async function getAiSummariesForMonth(month) { return apiFetch(`/api/ai-summary?month=${encodeURIComponent(month)}`); }
export async function saveAiSummary(studentId, month, { summary, instructions, behavior }) {
  return apiFetch('/api/ai-summary', { method: 'PUT', body: JSON.stringify({ studentId, month, summary, instructions, behavior }) });
}

// ── "Ask AI" — free-form Q&A over the whole school's fees/attendance data ──
export async function askAi(question, year) {
  const { answer } = await apiFetch('/api/ai-summary?action=ask', { method: 'POST', body: JSON.stringify({ question, year }) });
  return answer;
}

// ── Backup & restore — now a full snapshot of the API rather than localStorage ──
export async function exportAllData() {
  const years = await getAcademicYears();
  const [students, classes, teachers, settings, dailyRecords, feesByYear, attendanceByYear] = await Promise.all([
    getStudents(), getClasses(), getTeachers(), getSettings(), getDailyRecords(),
    Promise.all(years.map(y => getFees(y))).then(all => Object.fromEntries(years.map((y, i) => [y, all[i]]))),
    Promise.all(years.map(y => getAttendance(y))).then(all => Object.fromEntries(years.map((y, i) => [y, all[i]]))),
  ]);
  const lateTimesByYear = Object.fromEntries(await Promise.all(years.map(async y => [y, await getLateTimes(y)])));
  // Saved AI monthly summaries (the text behind each student's PDF report) live in
  // their own table, one fetch per student — not covered by anything else above.
  const aiSummaries = (await Promise.all(students.map(s => getAiSummaries(s.id)))).flat();
  // Qur'an progress: { studentId: { entries, priorJuz } }.
  const quran = await getQuranProgress();
  // The logo and app icon are served separately from the rest of settings — fold
  // them back in as data: URLs so a restore (which PATCHes settings as-is) brings them back too.
  if (settings.hasLogo) settings.logo = await fetchImageDataUrl('logo').catch(() => undefined);
  if (settings.hasIcon) settings.icon = await fetchImageDataUrl('icon').catch(() => undefined);
  return {
    app: 'baytul-ilm-madrasah', exportedAt: new Date().toISOString(),
    data: { years, students, classes, teachers, settings, dailyRecords, feesByYear, attendanceByYear, lateTimesByYear, aiSummaries, quran },
  };
}
async function fetchImageDataUrl(which) {
  const res = await fetch(`/api/settings?${which}`, { credentials: 'include', cache: 'no-cache' });
  if (!res.ok) return undefined;
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function importFeesForYear(year, records) {
  for (const f of records) {
    const created = await addFeeRecord({ studentId: f.studentId, period: f.period || 'week', weekStarting: f.weekStarting, amount: f.amount }, year);
    if (f.status === 'Paid' && created?.id) await markFeePaid(created.id, year);
  }
}

export async function importAllData(payload) {
  if (!payload?.data) throw new Error("That file doesn't look like a backup from this system.");
  const data = payload.data;

  // Backups taken before this app had a server (a raw localStorage snapshot, keyed by
  // madrasah_* storage keys with JSON-stringified values) use a completely different
  // shape from the current structured export — detect and handle both.
  if (Object.keys(data).some(k => k.startsWith('madrasah_'))) {
    const parse = (key, fallback) => { try { return JSON.parse(data[key]); } catch { return fallback; } };
    const years = parse('madrasah_academic_years', ['2025-26']);
    const classes = parse('madrasah_classes', []);
    const teachers = parse('madrasah_teachers', []);
    const students = parse('madrasah_students', []);
    const settings = parse('madrasah_settings', null);
    const dailyRecords = parse('madrasah_daily_records_v2', {});
    const attendanceByYear = parse('madrasah_attendance_v2', {});

    for (const y of years) await addAcademicYear(y);
    for (const c of classes) await addClass(c).catch(() => {});
    for (const t of teachers) await addTeacher(t).catch(() => {});
    for (const s of students) await addStudent(s).catch(() => {});
    if (settings) await updateSettings(settings);
    for (const [studentId, byDate] of Object.entries(dailyRecords)) {
      for (const [date, entry] of Object.entries(byDate)) await saveDailyRecord(studentId, date, entry);
    }
    for (const [year, byStudent] of Object.entries(attendanceByYear)) {
      for (const [studentId, byDate] of Object.entries(byStudent)) {
        for (const [date, status] of Object.entries(byDate)) await setAttendance(studentId, date, status, year);
      }
    }
    for (const key of Object.keys(data)) {
      const m = key.match(/^madrasah_fees_(.+)$/);
      if (m) await importFeesForYear(m[1], parse(key, []));
    }
    return;
  }

  const { years, students, classes, teachers, settings, dailyRecords, feesByYear, attendanceByYear, lateTimesByYear, aiSummaries, quran } = data;

  for (const y of years || []) await addAcademicYear(y);
  for (const c of classes || []) await addClass(c).catch(() => {});
  for (const t of teachers || []) await addTeacher(t).catch(() => {});
  for (const s of students || []) await addStudent(s).catch(() => {});
  if (settings) await updateSettings(settings);
  for (const [studentId, byDate] of Object.entries(dailyRecords || {})) {
    for (const [date, entry] of Object.entries(byDate)) await saveDailyRecord(studentId, date, entry);
  }
  for (const [year, records] of Object.entries(feesByYear || {})) {
    await importFeesForYear(year, records);
  }
  for (const [year, byStudent] of Object.entries(attendanceByYear || {})) {
    for (const [studentId, byDate] of Object.entries(byStudent)) {
      for (const [date, status] of Object.entries(byDate)) {
        await setAttendance(studentId, date, status, year, lateTimesByYear?.[year]?.[studentId]?.[date]);
      }
    }
  }
  // Older backups (taken before this field existed) simply won't have it — nothing to restore.
  for (const a of aiSummaries || []) {
    await saveAiSummary(a.studentId, a.month, { summary: a.summary, instructions: a.instructions, behavior: a.behavior });
  }
  for (const [studentId, q] of Object.entries(quran || {})) {
    if (q.priorJuz?.length) await savePriorJuz(studentId, q.priorJuz);
    if (q.quranType) await saveStudentQuranType(studentId, q.quranType);
    for (const { id, ...e } of q.entries || []) await addQuranEntry({ ...e, studentId });
  }
}
