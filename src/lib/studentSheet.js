// Students ⇄ spreadsheets: the Excel download on Settings → Backup and the "Add students
// from a spreadsheet" pop-up on the Students page use the same columns, so a downloaded
// sheet can be filled in and imported back.

// The first 13 are the original columns (older sheets with no heading row are read in this
// order); a child's extra details (lib/studentDetails.js) follow, the Darul Uloom ones last.
export const SHEET_COLUMNS = [
  ['forename', 'Forename'], ['surname', 'Surname'], ['class', 'Class'], ['dob', 'Date of birth'],
  ['parent1Name', 'Contact 1 name'], ['parent1Phone', 'Contact 1 phone'],
  ['parent2Name', 'Contact 2 name'], ['parent2Phone', 'Contact 2 phone'],
  ['weeklyFee', 'Fee'], ['enrollDate', 'Enrolled'], ['leaveDate', 'Left'], ['status', 'Status'], ['notes', 'Notes'],
  ['gender', 'Gender'], ['parent1Relation', 'Contact 1 relation'], ['parent1Email', 'Contact 1 email'],
  ['parent2Relation', 'Contact 2 relation'], ['parent2Email', 'Contact 2 email'], ['mainContact', 'Contact first'],
  ['address', 'Address'], ['postcode', 'Postcode'],
  ['emergencyName', 'Emergency contact'], ['emergencyRelation', 'Emergency relation'], ['emergencyPhone', 'Emergency phone'],
  ['allergies', 'Allergies'], ['medical', 'Medical conditions'], ['medication', 'Medication'],
  ['walksHome', 'Goes home alone'], ['collectors', 'Who may collect'],
  ['boarding', 'Boarder or day'], ['schoolYear', 'School year'], ['previousSchool', 'Previous madrasah or school'], ['hifdhCompleted', 'Hifdh completed'],
];
const DU_ONLY = new Set(['boarding', 'schoolYear', 'previousSchool', 'hifdhCompleted']);
export const sheetColumns = isDarulUloom => SHEET_COLUMNS.filter(([k]) => isDarulUloom || !DU_ONLY.has(k));

const STATUS = { Active: 'Active', Inactive: 'Left', 'Waiting list': 'Waiting list' };
const PHONES = ['parent1Phone', 'parent2Phone', 'emergencyPhone'];

// Excel drops a phone number's leading 0 when it's typed or pasted as a number (07700 900111
// becomes 7700900111). A UK number that has lost its 0 gets it back on import.
export function fixPhone(v) {
  const s = String(v || '').trim();
  const digits = s.replace(/[\s-]/g, '');
  if (/^[1-9]\d{9}$/.test(digits)) return '0' + s;                   // 7700900111 → 07700900111
  if (/^44[1-9]\d{9}$/.test(digits)) return '0' + digits.slice(2);   // 447700900111 → 07700900111
  return s;
}

// → rows for the students spreadsheet (lib/xlsx.js): headings, then one row per student.
// Dates are real Excel dates; everything else is text, so phone numbers keep their 0.
// Columns kept on the left in the spreadsheet (names and notes); the rest are centred.
export const sheetLeft = isDarulUloom => sheetColumns(isDarulUloom).map(([k], i) =>
  (/Name$|Email$|^forename$|^surname$|^notes$|^address$|^allergies$|^medical$|^medication$|^collectors$|^previousSchool$/.test(k) ? i : -1)).filter(i => i >= 0);
export const SHEET_LEFT = sheetLeft(false);

export function studentsRows(students, isDarulUloom) {
  const cols = sheetColumns(isDarulUloom);
  return [cols.map(c => c[1]), ...students.map(s => cols.map(([k]) =>
    k === 'dob' || k === 'enrollDate' || k === 'leaveDate' ? (s[k] ? { date: String(s[k]).slice(0, 10) } : '') : k === 'status' ? (STATUS[s.status] || s.status) : (s[k] ?? '')))];
}

// Text pasted from Excel / Google Sheets (tab-separated) or a .csv file → rows of cells.
function splitRows(text) {
  const t = text.replace(/^﻿/, '');
  const sep = t.includes('\t') ? '\t' : ',';
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (quoted) {
      if (c === '"' && t[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  row.push(cell); rows.push(row);
  // ="…" is how older .csv downloads kept phone numbers as text in Excel.
  return rows.map(r => r.map(c => c.trim().replace(/^="(.*)"$/, '$1'))).filter(r => r.some(Boolean));
}

// Heading words → field. Checked in order, so "parent 2 phone" wins over "phone", and the
// extra details ("Emergency phone", "Contact 1 email", "School year") before the usual ones.
const HEADINGS = [
  [/^(full\s*)?name$|^(student|child|pupil)('?s)?\s*name$/, 'fullName'],
  [/emergency.*(phone|mobile|tel|number)/, 'emergencyPhone'], [/emergency.*relat/, 'emergencyRelation'], [/emergency/, 'emergencyName'],
  [/2.*e-?mail|e-?mail.*2/, 'parent2Email'], [/e-?mail/, 'parent1Email'],
  [/2.*relat|relat.*2/, 'parent2Relation'], [/relat/, 'parent1Relation'],
  [/contact first|main contact|first contact/, 'mainContact'],
  [/post\s*code|zip/, 'postcode'], [/address/, 'address'],
  [/allerg/, 'allergies'], [/medication|medicine/, 'medication'], [/medical|condition|health/, 'medical'],
  [/home alone|walk|go(es)? home/, 'walksHome'], [/collect|pick\s*up/, 'collectors'],
  [/board/, 'boarding'], [/school year|year at school|mainstream/, 'schoolYear'], [/previous|former/, 'previousSchool'],
  [/(hifdh|hifz).*(complet|finish|done)|hafi[zd]/, 'hifdhCompleted'],
  [/gender|^sex$|boy|girl/, 'gender'],
  [/fore|first|given/, 'forename'], [/sur|last|family/, 'surname'],
  [/class|group|year|level/, 'class'], [/birth|dob|d\.o\.b/, 'dob'],
  [/(parent|guardian|mother|father|contact)?\s*2.*(phone|mobile|tel|number)|(phone|mobile|tel).*2/, 'parent2Phone'],
  [/(parent|guardian|mother|father|contact)?\s*2/, 'parent2Name'],
  [/phone|mobile|tel|number|contact\s*no/, 'parent1Phone'],
  [/parent|guardian|carer|mother|mum|mom|father|dad|contact/, 'parent1Name'],
  [/fee|amount|price/, 'weeklyFee'], [/enrol|start|joined/, 'enrollDate'], [/left|leav/, 'leaveDate'],
  [/status/, 'status'], [/note|comment/, 'notes'],
];
function headingField(h) {
  const s = h.toLowerCase().replace(/[_\-.]+/g, ' ').trim();
  for (const [re, f] of HEADINGS) if (re.test(s)) return f;
  return null;
}

// '12/03/2015', '12-3-15', '2015-03-12', '12.03.2015' → '2015-03-12' (day first, UK style).
export function parseDate(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (m) { let y = +m[3]; if (y < 100) y += y > (new Date().getFullYear() % 100) ? 1900 : 2000; return valid(y, +m[2], +m[1]); }
  return null;
}
function valid(y, mo, d) {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : null;
}

// Text → { rows: [{ forename, surname, class, … }], headed: bool }. With no recognisable
// heading row the columns are taken in the download's order.
export function parseSheet(text) {
  const cells = splitRows(text || '');
  if (!cells.length) return { rows: [], headed: false };
  // Parents: columns named after a person ("Father", "Mother's mobile", "Dad phone") are
  // kept together — whoever appears first is Parent 1 and the other Parent 2, so a mother's
  // name and number always end up side by side whatever order the columns are in. Any other
  // second parent column ("Phone" twice) fills Parent 2.
  const used = new Set();
  const SECOND = { parent1Name: 'parent2Name', parent1Phone: 'parent2Phone', parent1Email: 'parent2Email', parent1Relation: 'parent2Relation' };
  const PERSON = [[/mother|\bmum|\bmom/, 'mother'], [/father|\bdad/, 'father'], [/guardian|carer/, 'guardian']];
  const personSlot = {};
  const mapped = cells[0].map(h => {
    let f = headingField(h);
    const low = h.toLowerCase();
    const person = SECOND[f] && PERSON.find(([re]) => re.test(low))?.[1];
    if (person) {
      if (!personSlot[person]) personSlot[person] = Object.keys(personSlot).length === 0 ? 1 : 2;
      f = `parent${personSlot[person]}${f.replace(/^parent1/, '')}`;
    } else if (f && used.has(f) && SECOND[f]) f = SECOND[f];
    if (f) used.add(f);
    return f;
  });
  const headed = mapped.filter(Boolean).length >= 2;
  const fields = headed ? mapped : SHEET_COLUMNS.map(c => c[0]);
  const rows = (headed ? cells.slice(1) : cells).map(r => {
    const o = {};
    fields.forEach((f, i) => { if (f && r[i] != null && r[i] !== '' && o[f] == null) o[f] = r[i]; });
    if (o.fullName && !o.forename) {
      const parts = o.fullName.split(/\s+/);
      o.surname = o.surname || (parts.length > 1 ? parts.pop() : '');
      o.forename = parts.join(' ');
    }
    delete o.fullName;
    PHONES.forEach(k => { if (o[k]) o[k] = fixPhone(o[k]); });
    // A "Mother" / "Father" column says who that parent is.
    Object.entries(personSlot).forEach(([person, n]) => {
      if ((o[`parent${n}Name`] || o[`parent${n}Phone`]) && !o[`parent${n}Relation`]) o[`parent${n}Relation`] = person[0].toUpperCase() + person.slice(1);
    });
    tidyDetails(o);
    return o;
  });
  return { rows, headed };
}

// What people type in a sheet → the app's own words ("M" → Boy, "mum" → Mother, "y" → Yes).
const WORDS = {
  gender: [[/^(b|m|boy|male)$/i, 'Boy'], [/^(g|f|girl|female)$/i, 'Girl']],
  walksHome: [[/^(y|yes|true)$/i, 'Yes'], [/^(n|no|false)$/i, 'No']],
  boarding: [[/board/i, 'Boarder'], [/day/i, 'Day student']],
  mainContact: [[/1|first|one/i, 'Contact 1'], [/2|second|two/i, 'Contact 2']],
  relation: [[/^(mother|mum|mom|mam|ammi)$/i, 'Mother'], [/^(father|dad|abbu|abba)$/i, 'Father'], [/guardian|carer/i, 'Guardian'], [/grand|nan|nana|nani|dada|dadi/i, 'Grandparent']],
};
function tidyDetails(o) {
  const tidy = (k, list) => { if (o[k]) { const hit = list.find(([re]) => re.test(String(o[k]).trim())); if (hit) o[k] = hit[1]; } };
  tidy('gender', WORDS.gender); tidy('walksHome', WORDS.walksHome); tidy('boarding', WORDS.boarding); tidy('mainContact', WORDS.mainContact);
  tidy('parent1Relation', WORDS.relation); tidy('parent2Relation', WORDS.relation);
}
