const KEYS = {
  students:'madrasah_students',
  attendance:'madrasah_attendance_v2',
  teachers:'madrasah_teachers',
  classes:'madrasah_classes',
  settings:'madrasah_settings',
  years:'madrasah_academic_years',
};

const DEFAULT_WEEKLY_FEE = 15;

const seed = {
  classes: [{ id:'C001', name:'Class 1', teacherId:'' }, { id:'C002', name:'Class 2', teacherId:'' }],
  teachers: [],
  students: [
    { id:'S001', forename:'Mubarak',  surname:'Abubakr',  dob:'2009-08-25', class:'Class 1', parent1Name:'Muhammad Amin',   parent1Phone:'07774527065', parent2Name:'',           parent2Phone:'',           weeklyFee:15, enrollDate:'2025-09-01', status:'Active', notes:'' },
    { id:'S002', forename:'Musfira',  surname:'Amin',     dob:'2019-04-06', class:'Class 1', parent1Name:'Zainab Amin',      parent1Phone:'07459503984', parent2Name:'',           parent2Phone:'',           weeklyFee:15, enrollDate:'2025-09-01', status:'Active', notes:'' },
    { id:'S003', forename:'Hussain',  surname:'Mahomed',  dob:'2014-02-27', class:'Class 1', parent1Name:'Mariam Mahomed',   parent1Phone:'07445212224', parent2Name:'Tahir Mahomed',  parent2Phone:'07930900069', weeklyFee:15, enrollDate:'2025-09-01', status:'Active', notes:'' },
    { id:'S004', forename:'Hassan',   surname:'Mahomed',  dob:'2015-04-12', class:'Class 1', parent1Name:'Mariam Mahomed',   parent1Phone:'07445212224', parent2Name:'Tahir Mahomed',  parent2Phone:'07930900069', weeklyFee:15, enrollDate:'2025-09-01', status:'Active', notes:'' },
    { id:'S005', forename:'Aiman',    surname:'Ahmed',    dob:'2019-08-10', class:'Class 1', parent1Name:'Faiso Gedi',       parent1Phone:'07985638070', parent2Name:'',           parent2Phone:'',           weeklyFee:15, enrollDate:'2025-09-01', status:'Active', notes:'' },
    { id:'S006', forename:'Ikhlaas',  surname:'Omar',     dob:'2019-10-30', class:'Class 1', parent1Name:'Ifrah Gedi',       parent1Phone:'07504738490', parent2Name:'',           parent2Phone:'',           weeklyFee:15, enrollDate:'2025-09-01', status:'Active', notes:'' },
    { id:'S007', forename:'Hashim',   surname:'Haque',    dob:'2016-11-09', class:'Class 1', parent1Name:'Aliya Haque',      parent1Phone:'07792145887', parent2Name:'Qasim Haque',    parent2Phone:'',           weeklyFee:15, enrollDate:'2025-09-01', status:'Active', notes:'' },
    { id:'S008', forename:'Noor',     surname:'Ali',      dob:'2016-03-08', class:'Class 1', parent1Name:'Sara Mahomed',     parent1Phone:'07802362938', parent2Name:'',           parent2Phone:'',           weeklyFee:15, enrollDate:'2025-09-01', status:'Active', notes:'' },
    { id:'S009', forename:'Ilyas',    surname:'Corneh',   dob:'2011-11-02', class:'Class 1', parent1Name:'Miatta Gassama',   parent1Phone:'07957752470', parent2Name:'',           parent2Phone:'',           weeklyFee:15, enrollDate:'2025-09-01', status:'Active', notes:'' },
    { id:'S010', forename:'Imaan',    surname:'Mahomed',  dob:'2018-12-25', class:'Class 1', parent1Name:'Junaid Mahomed',   parent1Phone:'07842694211', parent2Name:'',           parent2Phone:'',           weeklyFee:15, enrollDate:'2025-03-07', status:'Active', notes:'' },
    { id:'S011', forename:'Zaydaan',  surname:'Mahomed',  dob:'2021-04-09', class:'Class 1', parent1Name:'Junaid Mahomed',   parent1Phone:'07842694210', parent2Name:'',           parent2Phone:'',           weeklyFee:15, enrollDate:'2025-03-07', status:'Active', notes:'' },
    { id:'S012', forename:'Aya',      surname:'Memon',    dob:'2016-12-22', class:'Class 2', parent1Name:'Abdul Memon',      parent1Phone:'07432801976', parent2Name:'Fatima Memon',   parent2Phone:'07583900051', weeklyFee:15, enrollDate:'2025-09-01', status:'Active', notes:'' },
    { id:'S013', forename:'Hannah',   surname:'Memon',    dob:'2020-04-02', class:'Class 2', parent1Name:'Abdul Memon',      parent1Phone:'07432801976', parent2Name:'Fatima Memon',   parent2Phone:'07583900051', weeklyFee:15, enrollDate:'2025-09-01', status:'Active', notes:'' },
    { id:'S014', forename:'Yusuf',    surname:'Tayub',    dob:'2015-06-16', class:'Class 2', parent1Name:'Ahmad Tayub',      parent1Phone:'07979793434', parent2Name:'',           parent2Phone:'',           weeklyFee:15, enrollDate:'2025-09-01', status:'Active', notes:'' },
    { id:'S015', forename:'Azhaar',   surname:'Mukhtar',  dob:'2013-12-20', class:'Class 2', parent1Name:'Amina Cadey',      parent1Phone:'07939841129', parent2Name:'',           parent2Phone:'',           weeklyFee:12, enrollDate:'2025-09-01', status:'Active', notes:'' },
    { id:'S016', forename:'Abyan',    surname:'Mukhtar',  dob:'2015-06-10', class:'Class 2', parent1Name:'Amina Cadey',      parent1Phone:'07939841129', parent2Name:'',           parent2Phone:'',           weeklyFee:12, enrollDate:'2025-09-01', status:'Active', notes:'' },
    { id:'S017', forename:'Almaas',   surname:'Mukhtar',  dob:'2011-11-30', class:'Class 2', parent1Name:'Amina Cadey',      parent1Phone:'07939841129', parent2Name:'',           parent2Phone:'',           weeklyFee:12, enrollDate:'2025-09-01', status:'Active', notes:'' },
    { id:'S018', forename:'Afnaan',   surname:'Mukhtar',  dob:'2018-11-20', class:'Class 2', parent1Name:'Amina Cadey',      parent1Phone:'07939841129', parent2Name:'',           parent2Phone:'',           weeklyFee:12, enrollDate:'2025-09-01', status:'Active', notes:'' },
    { id:'S019', forename:'Muhammad', surname:'Shah',     dob:'2019-10-19', class:'Class 2', parent1Name:'Femi Shah',        parent1Phone:'07957661143', parent2Name:'Ahmed Shah',     parent2Phone:'07533659535', weeklyFee:10, enrollDate:'2025-09-01', status:'Active', notes:'' },
    { id:'S020', forename:'Usman',    surname:'Arshad',   dob:'2012-01-31', class:'Class 2', parent1Name:'Arshad Sattar',    parent1Phone:'07886203394', parent2Name:'Fauzia Arshad',  parent2Phone:'07809506601', weeklyFee:15, enrollDate:'2025-09-01', status:'Active', notes:'' },
    { id:'S021', forename:'Eesa',     surname:'Saleem',   dob:'2012-05-17', class:'Class 2', parent1Name:'Zahrah Saleem',    parent1Phone:'07837235163', parent2Name:'',           parent2Phone:'',           weeklyFee:15, enrollDate:'2025-09-01', status:'Active', notes:'' },
    { id:'S022', forename:'Mahdia',   surname:'Miah',     dob:'2016-10-06', class:'Class 2', parent1Name:'Fahima Begum',     parent1Phone:'07473607188', parent2Name:'',           parent2Phone:'',           weeklyFee:15, enrollDate:'2025-04-06', status:'Active', notes:'' },
    { id:'S023', forename:'Mariam',   surname:'Miah',     dob:'2018-03-11', class:'Class 2', parent1Name:'Fahima Begum',     parent1Phone:'07473607188', parent2Name:'',           parent2Phone:'',           weeklyFee:15, enrollDate:'2025-04-06', status:'Active', notes:'' },
    { id:'S024', forename:'Mahiba',   surname:'Miah',     dob:'2019-05-09', class:'Class 2', parent1Name:'Fahima Begum',     parent1Phone:'07473607188', parent2Name:'',           parent2Phone:'',           weeklyFee:15, enrollDate:'2025-04-06', status:'Active', notes:'' },
    { id:'S025', forename:'Safaa',    surname:'Arshad',   dob:'2010-01-01', class:'Class 2', parent1Name:'Arshad Sattar',    parent1Phone:'07886203394', parent2Name:'Fauzia Arshad',  parent2Phone:'07809506601', weeklyFee:15, enrollDate:'2025-09-01', status:'Active', notes:'' },
  ],
};

function load(key) { try { const r=localStorage.getItem(key); if(r) return JSON.parse(r); } catch{} return null; }
function save(key,data) { try { localStorage.setItem(key,JSON.stringify(data)); } catch{} }

function init() {
  if (!load(KEYS.students))   save(KEYS.students,  seed.students);
  if (!load(KEYS.teachers))   save(KEYS.teachers,  seed.teachers);
  if (!load(KEYS.classes))    save(KEYS.classes,   seed.classes);
  if (!load(KEYS.years))      save(KEYS.years,     ['2025-26']);
}

// ── Academic years (user-managed) ──
export function getAcademicYears() { init(); return load(KEYS.years)||['2025-26']; }
export function addAcademicYear(y) {
  const list = getAcademicYears();
  if (!list.includes(y)) { list.push(y); list.sort(); save(KEYS.years,list); }
}
export function removeAcademicYear(y) {
  const list = getAcademicYears().filter(x=>x!==y);
  save(KEYS.years, list.length ? list : ['2025-26']);
}
export function currentSchoolYear() {
  const years = getAcademicYears();
  const now = new Date(), m = now.getMonth(), yr = now.getFullYear();
  const start = m >= 8 ? yr : yr-1;
  const label = `${String(start).slice(2)}-${String(start+1).slice(2)}`;
  return years.includes(label) ? label : years[years.length-1];
}

// ── School month — every month runs from its first Monday to the day before the next month's first Monday ──
function firstMondayOfMonthISO(year, monthIndex0) {
  const d = new Date(year, monthIndex0, 1, 12);
  d.setDate(d.getDate() + (1 - d.getDay() + 7) % 7);
  return d.toISOString().split('T')[0];
}
export function getCurrentSchoolMonth(refIso) {
  const ref = refIso || new Date().toISOString().split('T')[0];
  const refDate = new Date(ref+'T12:00:00');
  const y = refDate.getFullYear(), m = refDate.getMonth();
  const thisFirstMon = firstMondayOfMonthISO(y, m);
  if (ref >= thisFirstMon) {
    const nextY = m===11 ? y+1 : y, nextM = (m+1)%12;
    return { start: thisFirstMon, endExclusive: firstMondayOfMonthISO(nextY, nextM), label: refDate.toLocaleDateString('en-GB',{month:'long',year:'numeric'}) };
  }
  const prevY = m===0 ? y-1 : y, prevM = (m+11)%12;
  return { start: firstMondayOfMonthISO(prevY, prevM), endExclusive: thisFirstMon, label: new Date(prevY,prevM,1,12).toLocaleDateString('en-GB',{month:'long',year:'numeric'}) };
}

// ── Students ──
export function getStudents()       { init(); return load(KEYS.students)||[]; }
export function getStudent(id)      { return getStudents().find(s=>s.id===id); }
export function addStudent(student) {
  const list=getStudents(), id='S'+String(Date.now()).slice(-6);
  const s={weeklyFee:DEFAULT_WEEKLY_FEE,status:'Active',parent1Name:'',parent1Phone:'',parent2Name:'',parent2Phone:'',notes:'',...student,id};
  list.push(s); save(KEYS.students,list); return s;
}
export function updateStudent(id,data) { save(KEYS.students,getStudents().map(s=>s.id===id?{...s,...data}:s)); }
export function deleteStudent(id) {
  save(KEYS.students,getStudents().filter(s=>s.id!==id));
  const att=load(KEYS.attendance)||{}; delete att[id]; save(KEYS.attendance,att);
  getAcademicYears().forEach(y=>{ const fees=getFees(y).filter(f=>f.studentId!==id); save(`madrasah_fees_${y}`,fees); });
}
export function avatarInitials(name){ return name.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase(); }

// ── Attendance (keyed by year) ──
export function getAttendance(year) {
  init();
  const all=load(KEYS.attendance)||{};
  return year ? (all[year]||{}) : all;
}
export function setAttendance(studentId,date,status,year) {
  const all=load(KEYS.attendance)||{};
  if (!all[year]) all[year]={};
  if (!all[year][studentId]) all[year][studentId]={};
  if (!status) delete all[year][studentId][date];
  else all[year][studentId][date]=status;
  save(KEYS.attendance,all);
}
export function getStudentAttendance(studentId,year) { return getAttendance(year)[studentId]||{}; }
export function calcAttendancePct(studentId,year) {
  const days=Object.values(getStudentAttendance(studentId,year));
  if (!days.length) return 0;
  return Math.round((days.filter(d=>d==='P'||d==='L').length/days.length)*100);
}
export function calcAttendanceCounts(studentId,year) {
  const days=Object.values(getStudentAttendance(studentId,year||currentSchoolYear()));
  return { present:days.filter(d=>d==='P').length, late:days.filter(d=>d==='L').length, absent:days.filter(d=>d==='A').length, total:days.length };
}
export function getWeekDates(anchor) {
  const d=new Date(anchor+'T12:00:00'), day=d.getDay();
  const mon=new Date(d); mon.setDate(d.getDate()-day+(day===0?-6:1));
  return [0,1,2,3].map(i=>{ const dt=new Date(mon); dt.setDate(mon.getDate()+i); return dt.toISOString().split('T')[0]; });
}

// ── Fees (keyed by year) ──
function feesKey(year) { return `madrasah_fees_${year}`; }
export function getFees(year)       { init(); return load(feesKey(year||currentSchoolYear()))||[]; }
let feeIdSeq = 0;
export function addFeeRecord(rec,year) {
  const y=year||currentSchoolYear(), list=getFees(y);
  feeIdSeq += 1;
  const id='F'+Date.now()+'-'+feeIdSeq;
  const f={status:'Pending',paidDate:null,...rec,id};
  list.push(f); save(feesKey(y),list); return f;
}
export function markFeePaid(feeId,year)    { const y=year||currentSchoolYear(); save(feesKey(y),getFees(y).map(f=>f.id===feeId?{...f,status:'Paid',paidDate:new Date().toISOString().split('T')[0]}:f)); }
export function markFeeUnpaid(feeId,year)  { const y=year||currentSchoolYear(); save(feesKey(y),getFees(y).map(f=>f.id===feeId?{...f,status:'Pending',paidDate:null}:f)); }
export function deleteFeeRecord(feeId,year){ const y=year||currentSchoolYear(); save(feesKey(y),getFees(y).filter(f=>f.id!==feeId)); }
export function updateFeeAmount(feeId,amount,year){ const y=year||currentSchoolYear(); save(feesKey(y),getFees(y).map(f=>f.id===feeId?{...f,amount:Number(amount)}:f)); }
export function getStudentFees(studentId,year) { return getFees(year||currentSchoolYear()).filter(f=>f.studentId===studentId).sort((a,b)=>b.weekStarting.localeCompare(a.weekStarting)); }
export function deleteWeekFees(weekStarting,year,cls,students) {
  const y=year||currentSchoolYear();
  const classIds=new Set(students.filter(s=>s.class===cls).map(s=>s.id));
  save(feesKey(y),getFees(y).filter(f=>!(f.weekStarting===weekStarting&&classIds.has(f.studentId))));
}
export function getMondayOf(dateStr) {
  const d=new Date(dateStr+'T12:00:00'), day=d.getDay();
  d.setDate(d.getDate()-day+(day===0?-6:1)); return d.toISOString().split('T')[0];
}
// A "month" here always runs from its first Monday to the day before the next month's first Monday
export function getSchoolMonthRange(yearMonth) {
  const [y,m]=yearMonth.split('-').map(Number); // m is 1-indexed
  const start=firstMondayOfMonthISO(y,m-1);
  const nextY=m===12?y+1:y, nextM0=m%12;
  const endExclusive=firstMondayOfMonthISO(nextY,nextM0);
  return { start, endExclusive };
}
// Get all Mon week-start dates for a given month (YYYY-MM), using the first-Monday rule above
export function getWeekStartsForMonth(yearMonth) {
  const { start, endExclusive } = getSchoolMonthRange(yearMonth);
  const weeks=[];
  let d=new Date(start+'T12:00:00');
  while (d.toISOString().split('T')[0] < endExclusive) {
    weeks.push(d.toISOString().split('T')[0]);
    d.setDate(d.getDate()+7);
  }
  return weeks;
}

// ── Classes ──
export function getClasses()         { init(); return load(KEYS.classes)||[]; }
export function getClass(id)         { return getClasses().find(c=>c.id===id); }
export function addClass(cls)        { const list=getClasses(),c={teacherId:'',...cls,id:'C'+String(Date.now()).slice(-6)}; list.push(c); save(KEYS.classes,list); return c; }
export function updateClass(id,data) { save(KEYS.classes,getClasses().map(c=>c.id===id?{...c,...data}:c)); }
export function deleteClass(id)      { save(KEYS.classes,getClasses().filter(c=>c.id!==id)); }
export function getClassNames()      { const c=getClasses(); return c.length?c.map(c=>c.name):['Class 1','Class 2']; }
export function classTeacherName(tid){ const t=getTeacher(tid); return t?t.name:'Unassigned'; }

// ── Teachers ──
export function getTeachers()         { init(); return load(KEYS.teachers)||[]; }
export function getTeacher(id)        { return getTeachers().find(t=>t.id===id); }
export function addTeacher(t)         { const list=getTeachers(),n={phone:'',email:'',subjects:[],...t,id:'T'+String(Date.now()).slice(-6)}; list.push(n); save(KEYS.teachers,list); return n; }
export function updateTeacher(id,data){ save(KEYS.teachers,getTeachers().map(t=>t.id===id?{...t,...data}:t)); }
export function deleteTeacher(id)     { save(KEYS.teachers,getTeachers().filter(t=>t.id!==id)); save(KEYS.classes,getClasses().map(c=>c.teacherId===id?{...c,teacherId:''}:c)); }

// ── Settings ──
const DEFAULT_SETTINGS = { schoolName:"Baytul 'Ilm Madrasah", schoolNameArabic:'بيت العلم', defaultWeeklyFee:DEFAULT_WEEKLY_FEE };
export function getSettings()        { const s=load(KEYS.settings); return s?{...DEFAULT_SETTINGS,...s}:DEFAULT_SETTINGS; }
export function updateSettings(data) { save(KEYS.settings,{...getSettings(),...data}); }
export function getDefaultWeeklyFee(){ return getSettings().defaultWeeklyFee??DEFAULT_WEEKLY_FEE; }

// ── Daily records ──
const DR_KEY='madrasah_daily_records_v2';
export function getDailyRecords()    { try { return JSON.parse(localStorage.getItem(DR_KEY)||'{}'); } catch{ return {}; } }
export function saveDailyRecord(studentId,date,data) {
  const all=getDailyRecords();
  if (!all[studentId]) all[studentId]={};
  all[studentId][date]={...(all[studentId][date]||{}),...data};
  try { localStorage.setItem(DR_KEY,JSON.stringify(all)); } catch{}
}
export function deleteDailyRecord(studentId,date) {
  const all=getDailyRecords();
  if (all[studentId]) { delete all[studentId][date]; try { localStorage.setItem(DR_KEY,JSON.stringify(all)); } catch{} }
}
export function getStudentRecords(studentId){ return getDailyRecords()[studentId]||{}; }

// ── Backup & restore (every localStorage key the app uses, all prefixed madrasah_) ──
export function exportAllData() {
  const data = {};
  for (let i=0; i<localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('madrasah_')) data[key] = localStorage.getItem(key);
  }
  return { app:'baytul-ilm-madrasah', exportedAt:new Date().toISOString(), data };
}
export function importAllData(payload) {
  if (!payload || typeof payload.data !== 'object' || !payload.data) throw new Error('That file doesn\'t look like a Baytul \'Ilm backup.');
  Object.entries(payload.data).forEach(([key,value])=>{
    if (key.startsWith('madrasah_')) localStorage.setItem(key,value);
  });
}
