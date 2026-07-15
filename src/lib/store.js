// Client for the /api backend — every function here used to read/write localStorage
// synchronously; now every function is async and talks to the Postgres-backed API
// instead, so data is shared across devices rather than trapped in one browser.

export class AuthError extends Error {}
export class NetworkError extends Error {}

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
    if (res.status === 401) throw new AuthError(msg);
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ── Auth ──
export async function login(password) {
  return apiFetch('/api/login', { method: 'POST', body: JSON.stringify({ password }) });
}
export async function logout() {
  return apiFetch('/api/logout', { method: 'POST' });
}
export async function checkSession() {
  const { authenticated } = await apiFetch('/api/session');
  return authenticated;
}

// ── Academic years ──
export async function getAcademicYears() { return apiFetch('/api/academic-years'); }
export async function addAcademicYear(y) { return apiFetch('/api/academic-years', { method: 'POST', body: JSON.stringify({ year: y }) }); }
export async function removeAcademicYear(y) { return apiFetch(`/api/academic-years?year=${encodeURIComponent(y)}`, { method: 'DELETE' }); }
export async function currentSchoolYear() {
  const years = await getAcademicYears();
  const now = new Date(), m = now.getMonth(), yr = now.getFullYear();
  const start = m >= 8 ? yr : yr - 1;
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

// ── Students ──
export async function getStudents() { return apiFetch('/api/students'); }
export async function getStudent(id) { const list = await getStudents(); return list.find(s => s.id === id); }
export async function addStudent(student) { return apiFetch('/api/students', { method: 'POST', body: JSON.stringify(student) }); }
export async function updateStudent(id, data) { return apiFetch(`/api/students?id=${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }); }
export async function deleteStudent(id) { return apiFetch(`/api/students?id=${encodeURIComponent(id)}`, { method: 'DELETE' }); }
// ids is the full new card order for whichever class was just reordered — every
// other student's position is left alone (see api/students.js for how nulls sort).
export async function reorderStudents(ids) { return apiFetch('/api/students?action=reorder', { method: 'POST', body: JSON.stringify({ ids }) }); }
export function avatarInitials(name) { return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase(); }

// ── Attendance (keyed by year) ──
export async function getAttendance(year) { return apiFetch(`/api/attendance?year=${encodeURIComponent(year)}`); }
export async function setAttendance(studentId, date, status, year) {
  return apiFetch('/api/attendance', { method: 'PUT', body: JSON.stringify({ studentId, date, status, year }) });
}
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
export async function getClassNames() { const c = await getClasses(); return c.length ? c.map(c => c.name) : ['Class 1', 'Class 2']; }
export async function classTeacherName(tid) { if (!tid) return 'Unassigned'; const t = await getTeacher(tid); return t ? t.name : 'Unassigned'; }

// ── Teachers ──
export async function getTeachers() { return apiFetch('/api/teachers'); }
export async function getTeacher(id) { const list = await getTeachers(); return list.find(t => t.id === id); }
export async function addTeacher(t) { return apiFetch('/api/teachers', { method: 'POST', body: JSON.stringify(t) }); }
export async function updateTeacher(id, data) { return apiFetch(`/api/teachers?id=${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }); }
export async function deleteTeacher(id) { return apiFetch(`/api/teachers?id=${encodeURIComponent(id)}`, { method: 'DELETE' }); }

// ── Settings ──
const DEFAULT_WEEKLY_FEE = 15;
const DEFAULT_SETTINGS = { schoolName: "Baytul 'Ilm Madrasah", schoolNameArabic: 'بيت العلم', defaultWeeklyFee: DEFAULT_WEEKLY_FEE };
export async function getSettings() { const s = await apiFetch('/api/settings'); return { ...DEFAULT_SETTINGS, ...s }; }
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
// /api/ai-summary (singular) with the generation endpoint to stay within
// Vercel's Hobby-plan 12-function limit. ──
export async function getAiSummaries(studentId) { return apiFetch(`/api/ai-summary?studentId=${encodeURIComponent(studentId)}`); }
export async function getAiSummariesForMonth(month) { return apiFetch(`/api/ai-summary?month=${encodeURIComponent(month)}`); }
export async function saveAiSummary(studentId, month, { summary, instructions, behavior }) {
  return apiFetch('/api/ai-summary', { method: 'PUT', body: JSON.stringify({ studentId, month, summary, instructions, behavior }) });
}

// ── Backup & restore — now a full snapshot of the API rather than localStorage ──
export async function exportAllData() {
  const years = await getAcademicYears();
  const [students, classes, teachers, settings, dailyRecords, feesByYear, attendanceByYear] = await Promise.all([
    getStudents(), getClasses(), getTeachers(), getSettings(), getDailyRecords(),
    Promise.all(years.map(y => getFees(y))).then(all => Object.fromEntries(years.map((y, i) => [y, all[i]]))),
    Promise.all(years.map(y => getAttendance(y))).then(all => Object.fromEntries(years.map((y, i) => [y, all[i]]))),
  ]);
  return {
    app: 'baytul-ilm-madrasah', exportedAt: new Date().toISOString(),
    data: { years, students, classes, teachers, settings, dailyRecords, feesByYear, attendanceByYear },
  };
}
async function importFeesForYear(year, records) {
  for (const f of records) {
    const created = await addFeeRecord({ studentId: f.studentId, weekStarting: f.weekStarting, amount: f.amount }, year);
    if (f.status === 'Paid' && created?.id) await markFeePaid(created.id, year);
  }
}

export async function importAllData(payload) {
  if (!payload?.data) throw new Error("That file doesn't look like a Baytul 'Ilm backup.");
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

  const { years, students, classes, teachers, settings, dailyRecords, feesByYear, attendanceByYear } = data;

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
      for (const [date, status] of Object.entries(byDate)) await setAttendance(studentId, date, status, year);
    }
  }
}
