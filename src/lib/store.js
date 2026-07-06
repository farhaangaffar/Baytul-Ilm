const KEYS = { students:'madrasah_students', attendance:'madrasah_attendance', fees:'madrasah_fees', teachers:'madrasah_teachers', classes:'madrasah_classes', settings:'madrasah_settings' };
const DEFAULT_WEEKLY_FEE = 15;

// Enrolment dates derived from first attendance mark in the register
// Mon–Thu only (Fri removed). Safaa Arshad added to Class 2.
const seed = {
  classes: [
    { id:'C001', name:'Class 1', teacherId:'' },
    { id:'C002', name:'Class 2', teacherId:'' },
  ],
  teachers: [],
  students: [
    { id:'S001', forename:'Mubarak',  surname:'Abubakr',  dob:'2009-08-25', class:'Class 1', parent1Name:'Muhammad Amin',  parent1Phone:'07774527065', parent2Name:'', parent2Phone:'', weeklyFee:15, enrollDate:'2025-09-01', status:'Active', notes:'' },
    { id:'S002', forename:'Musfira',  surname:'Amin',     dob:'2019-04-06', class:'Class 1', parent1Name:'Zainab Amin',     parent1Phone:'07459503984', parent2Name:'', parent2Phone:'', weeklyFee:15, enrollDate:'2025-09-01', status:'Active', notes:'' },
    { id:'S003', forename:'Hussain',  surname:'Mahomed',  dob:'2014-02-27', class:'Class 1', parent1Name:'Mariam Mahomed',  parent1Phone:'07445212224', parent2Name:'Tahir Mahomed', parent2Phone:'07930900069', weeklyFee:15, enrollDate:'2025-09-01', status:'Active', notes:'' },
    { id:'S004', forename:'Hassan',   surname:'Mahomed',  dob:'2015-04-12', class:'Class 1', parent1Name:'Mariam Mahomed',  parent1Phone:'07445212224', parent2Name:'Tahir Mahomed', parent2Phone:'07930900069', weeklyFee:15, enrollDate:'2025-09-01', status:'Active', notes:'' },
    { id:'S005', forename:'Aiman',    surname:'Ahmed',    dob:'2019-08-10', class:'Class 1', parent1Name:'Faiso Gedi',      parent1Phone:'07985638070', parent2Name:'', parent2Phone:'', weeklyFee:15, enrollDate:'2025-09-01', status:'Active', notes:'' },
    { id:'S006', forename:'Ikhlaas',  surname:'Omar',     dob:'2019-10-30', class:'Class 1', parent1Name:'Ifrah Gedi',      parent1Phone:'07504738490', parent2Name:'', parent2Phone:'', weeklyFee:15, enrollDate:'2025-09-01', status:'Active', notes:'' },
    { id:'S007', forename:'Hashim',   surname:'Haque',    dob:'2016-11-09', class:'Class 1', parent1Name:'Aliya Haque',     parent1Phone:'07792145887', parent2Name:'Qasim Haque',  parent2Phone:'', weeklyFee:15, enrollDate:'2025-09-01', status:'Active', notes:'' },
    { id:'S008', forename:'Noor',     surname:'Ali',      dob:'2016-03-08', class:'Class 1', parent1Name:'Sara Mahomed',    parent1Phone:'07802362938', parent2Name:'', parent2Phone:'', weeklyFee:15, enrollDate:'2025-09-01', status:'Active', notes:'' },
    { id:'S009', forename:'Ilyas',    surname:'Corneh',   dob:'2011-11-02', class:'Class 1', parent1Name:'Miatta Gassama',  parent1Phone:'07957752470', parent2Name:'', parent2Phone:'', weeklyFee:15, enrollDate:'2025-09-01', status:'Active', notes:'' },
    { id:'S010', forename:'Imaan',    surname:'Mahomed',  dob:'2018-12-25', class:'Class 1', parent1Name:'Junaid Mahomed',  parent1Phone:'07842694211', parent2Name:'', parent2Phone:'', weeklyFee:15, enrollDate:'2025-03-07', status:'Active', notes:'' },
    { id:'S011', forename:'Zaydaan',  surname:'Mahomed',  dob:'2021-04-09', class:'Class 1', parent1Name:'Junaid Mahomed',  parent1Phone:'07842694210', parent2Name:'', parent2Phone:'', weeklyFee:15, enrollDate:'2025-03-07', status:'Active', notes:'' },
    { id:'S012', forename:'Aya',      surname:'Memon',    dob:'2016-12-22', class:'Class 2', parent1Name:'Abdul Memon',     parent1Phone:'07432801976', parent2Name:'Fatima Memon', parent2Phone:'07583900051', weeklyFee:15, enrollDate:'2025-09-01', status:'Active', notes:'' },
    { id:'S013', forename:'Hannah',   surname:'Memon',    dob:'2020-04-02', class:'Class 2', parent1Name:'Abdul Memon',     parent1Phone:'07432801976', parent2Name:'Fatima Memon', parent2Phone:'07583900051', weeklyFee:15, enrollDate:'2025-09-01', status:'Active', notes:'' },
    { id:'S014', forename:'Yusuf',    surname:'Tayub',    dob:'2015-06-16', class:'Class 2', parent1Name:'Ahmad Tayub',     parent1Phone:'07979793434', parent2Name:'', parent2Phone:'', weeklyFee:15, enrollDate:'2025-09-01', status:'Active', notes:'' },
    { id:'S015', forename:'Azhaar',   surname:'Mukhtar',  dob:'2013-12-20', class:'Class 2', parent1Name:'Amina Cadey',     parent1Phone:'07939841129', parent2Name:'', parent2Phone:'', weeklyFee:12, enrollDate:'2025-09-01', status:'Active', notes:'' },
    { id:'S016', forename:'Abyan',    surname:'Mukhtar',  dob:'2015-06-10', class:'Class 2', parent1Name:'Amina Cadey',     parent1Phone:'07939841129', parent2Name:'', parent2Phone:'', weeklyFee:12, enrollDate:'2025-09-01', status:'Active', notes:'' },
    { id:'S017', forename:'Almaas',   surname:'Mukhtar',  dob:'2011-11-30', class:'Class 2', parent1Name:'Amina Cadey',     parent1Phone:'07939841129', parent2Name:'', parent2Phone:'', weeklyFee:12, enrollDate:'2025-09-01', status:'Active', notes:'' },
    { id:'S018', forename:'Afnaan',   surname:'Mukhtar',  dob:'2018-11-20', class:'Class 2', parent1Name:'Amina Cadey',     parent1Phone:'07939841129', parent2Name:'', parent2Phone:'', weeklyFee:12, enrollDate:'2025-09-01', status:'Active', notes:'' },
    { id:'S019', forename:'Muhammad', surname:'Shah',     dob:'2019-10-19', class:'Class 2', parent1Name:'Femi Shah',       parent1Phone:'07957661143', parent2Name:'Ahmed Shah',   parent2Phone:'07533659535', weeklyFee:10, enrollDate:'2025-09-01', status:'Active', notes:'' },
    { id:'S020', forename:'Usman',    surname:'Arshad',   dob:'2012-01-31', class:'Class 2', parent1Name:'Arshad Sattar',   parent1Phone:'07886203394', parent2Name:'Fauzia Arshad', parent2Phone:'07809506601', weeklyFee:15, enrollDate:'2025-09-01', status:'Active', notes:'' },
    { id:'S021', forename:'Eesa',     surname:'Saleem',   dob:'2012-05-17', class:'Class 2', parent1Name:'Zahrah Saleem',   parent1Phone:'07837235163', parent2Name:'', parent2Phone:'', weeklyFee:15, enrollDate:'2025-09-01', status:'Active', notes:'' },
    { id:'S022', forename:'Mahdia',   surname:'Miah',     dob:'2016-10-06', class:'Class 2', parent1Name:'Fahima Begum',    parent1Phone:'07473607188', parent2Name:'', parent2Phone:'', weeklyFee:15, enrollDate:'2025-04-06', status:'Active', notes:'' },
    { id:'S023', forename:'Mariam',   surname:'Miah',     dob:'2018-03-11', class:'Class 2', parent1Name:'Fahima Begum',    parent1Phone:'07473607188', parent2Name:'', parent2Phone:'', weeklyFee:15, enrollDate:'2025-04-06', status:'Active', notes:'' },
    { id:'S024', forename:'Mahiba',   surname:'Miah',     dob:'2019-05-09', class:'Class 2', parent1Name:'Fahima Begum',    parent1Phone:'07473607188', parent2Name:'', parent2Phone:'', weeklyFee:15, enrollDate:'2025-04-06', status:'Active', notes:'' },
    { id:'S025', forename:'Safaa',    surname:'Arshad',   dob:'2010-01-01', class:'Class 2', parent1Name:'Arshad Sattar',   parent1Phone:'07886203394', parent2Name:'Fauzia Arshad', parent2Phone:'07809506601', weeklyFee:15, enrollDate:'2025-09-01', status:'Active', notes:'' },
  ],
  attendance: {},
  fees: [],
};

function load(key) { try { const r = localStorage.getItem(key); if (r) return JSON.parse(r); } catch {} return null; }
function save(key, data) { try { localStorage.setItem(key, JSON.stringify(data)); } catch {} }

function init() {
  if (!load(KEYS.students)) save(KEYS.students, seed.students);
  if (!load(KEYS.attendance)) save(KEYS.attendance, seed.attendance);
  if (!load(KEYS.fees)) save(KEYS.fees, seed.fees);
  if (!load(KEYS.teachers)) save(KEYS.teachers, seed.teachers);
  if (!load(KEYS.classes)) save(KEYS.classes, seed.classes);
}

// ── Students ──
export function getStudents() { init(); return load(KEYS.students) || []; }
export function getStudent(id) { return getStudents().find(s => s.id === id); }
export function addStudent(student) {
  const list = getStudents();
  const newId = 'S' + String(Date.now()).slice(-6);
  const s = { weeklyFee: DEFAULT_WEEKLY_FEE, status: 'Active', parent1Name:'', parent1Phone:'', parent2Name:'', parent2Phone:'', notes:'', ...student, id: newId };
  list.push(s);
  save(KEYS.students, list);
  return s;
}
export function updateStudent(id, data) { save(KEYS.students, getStudents().map(s => s.id === id ? { ...s, ...data } : s)); }
export function deleteStudent(id) {
  save(KEYS.students, getStudents().filter(s => s.id !== id));
  const att = getAttendance(); delete att[id]; save(KEYS.attendance, att);
  save(KEYS.fees, getFees().filter(f => f.studentId !== id));
}
export function studentFullName(s) { return `${s.forename} ${s.surname}`.trim(); }

// ── Attendance (Mon–Thu only) ──
export function getAttendance() { init(); return load(KEYS.attendance) || {}; }
export function setAttendance(studentId, date, status) {
  const att = getAttendance();
  if (!att[studentId]) att[studentId] = {};
  if (status === null || status === undefined) { delete att[studentId][date]; }
  else { att[studentId][date] = status; }
  save(KEYS.attendance, att);
}
export function getStudentAttendance(studentId) { return getAttendance()[studentId] || {}; }
export function calcAttendancePct(studentId) {
  const days = Object.values(getStudentAttendance(studentId));
  if (!days.length) return 0;
  return Math.round((days.filter(d => d === 'P' || d === 'L').length / days.length) * 100);
}
export function calcAttendanceCounts(studentId) {
  const days = Object.values(getStudentAttendance(studentId));
  return { present: days.filter(d=>d==='P').length, late: days.filter(d=>d==='L').length, absent: days.filter(d=>d==='A').length, total: days.length };
}

// Mon–Thu week dates (4 days, no Friday)
export function getWeekDates(anchor) {
  const d = new Date(anchor + 'T12:00:00');
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d); monday.setDate(diff);
  return [0,1,2,3].map(i => { const dt = new Date(monday); dt.setDate(monday.getDate()+i); return dt.toISOString().split('T')[0]; });
}

// ── Fees ──
export function getFees() { init(); return load(KEYS.fees) || []; }
export function saveFees(list) { save(KEYS.fees, list); }
export function addFeeRecord(record) {
  const list = getFees();
  const newId = 'F' + String(Date.now()).slice(-8) + Math.floor(Math.random()*100);
  const f = { status:'Pending', paidDate:null, ...record, id:newId };
  list.push(f); save(KEYS.fees, list); return f;
}
export function markFeePaid(feeId) { save(KEYS.fees, getFees().map(f => f.id===feeId ? {...f, status:'Paid', paidDate:new Date().toISOString().split('T')[0]} : f)); }
export function markFeeUnpaid(feeId) { save(KEYS.fees, getFees().map(f => f.id===feeId ? {...f, status:'Pending', paidDate:null} : f)); }
export function deleteFeeRecord(feeId) { save(KEYS.fees, getFees().filter(f => f.id!==feeId)); }
export function updateFeeAmount(feeId, amount) { save(KEYS.fees, getFees().map(f => f.id===feeId ? {...f, amount:Number(amount)} : f)); }
export function getStudentFees(studentId) { return getFees().filter(f=>f.studentId===studentId).sort((a,b)=>b.weekStarting.localeCompare(a.weekStarting)); }
export function getMondayOf(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  const diff = d.getDate() - day + (day===0?-6:1);
  d.setDate(diff); return d.toISOString().split('T')[0];
}
export function getWeekStarting(dateStr) { return getMondayOf(dateStr); }

// ── Classes ──
export function getClasses() { init(); return load(KEYS.classes) || []; }
export function getClass(id) { return getClasses().find(c=>c.id===id); }
export function addClass(cls) { const list=getClasses(); const c={teacherId:'',...cls,id:'C'+String(Date.now()).slice(-6)}; list.push(c); save(KEYS.classes,list); return c; }
export function updateClass(id,data) { save(KEYS.classes, getClasses().map(c=>c.id===id?{...c,...data}:c)); }
export function deleteClass(id) { save(KEYS.classes, getClasses().filter(c=>c.id!==id)); }
export function getClassNames() { const c=getClasses(); return c.length ? c.map(c=>c.name) : ['Class 1','Class 2']; }
export function classTeacherName(tid) { const t=getTeacher(tid); return t?t.name:'Unassigned'; }

// ── Teachers ──
export function getTeachers() { init(); return load(KEYS.teachers)||[]; }
export function getTeacher(id) { return getTeachers().find(t=>t.id===id); }
export function addTeacher(t) { const list=getTeachers(); const n={phone:'',email:'',subjects:[],...t,id:'T'+String(Date.now()).slice(-6)}; list.push(n); save(KEYS.teachers,list); return n; }
export function updateTeacher(id,data) { save(KEYS.teachers, getTeachers().map(t=>t.id===id?{...t,...data}:t)); }
export function deleteTeacher(id) { save(KEYS.teachers,getTeachers().filter(t=>t.id!==id)); save(KEYS.classes,getClasses().map(c=>c.teacherId===id?{...c,teacherId:''}:c)); }

// ── Settings ──
const DEFAULT_SETTINGS = { schoolName:"Baytul 'Ilm Madrasah", schoolNameArabic:'بيت العلم', defaultWeeklyFee:DEFAULT_WEEKLY_FEE };
export function getSettings() { const s=load(KEYS.settings); return s?{...DEFAULT_SETTINGS,...s}:DEFAULT_SETTINGS; }
export function updateSettings(data) { const n={...getSettings(),...data}; save(KEYS.settings,n); return n; }
export function getDefaultWeeklyFee() { return getSettings().defaultWeeklyFee??DEFAULT_WEEKLY_FEE; }

// ── Daily records (per student) ──
const DR_KEY = 'madrasah_daily_records_v2';
export function getDailyRecords() { try { return JSON.parse(localStorage.getItem(DR_KEY)||'{}'); } catch { return {}; } }
export function saveDailyRecord(studentId, date, data) {
  const all = getDailyRecords();
  if (!all[studentId]) all[studentId] = {};
  all[studentId][date] = { ...( all[studentId][date]||{}), ...data };
  try { localStorage.setItem(DR_KEY, JSON.stringify(all)); } catch {}
}
export function getStudentRecords(studentId) { return getDailyRecords()[studentId] || {}; }

// ── Helpers ──
export function avatarInitials(name) { return name.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase(); }
export const ATTENDANCE_KEY = { P:'Present', L:'Late', A:'Absent' };
