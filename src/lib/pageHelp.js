// "Page instructions": a few plain steps for each page, for whoever is signed in (the head,
// a teacher or a parent — each only sees what they can do). Shown by components/PageHelp.js,
// which opens them by itself the first time someone visits a page on a device.
import { feeFrequency, feeUnit } from './feePeriods';
import { getBranding } from './branding';

function feesForHead() {
  const unit = feeUnit(feeFrequency());
  const auto = getBranding().feeAuto !== false;
  const where = feeFrequency() === 'weekly' ? 'Settings → Fee weeks' : feeFrequency() === 'monthly' ? 'Settings → Fee months' : 'Settings → Terms';
  return [
    'Pick the class at the top.',
    `Green means paid, red means owed. ${unit[0].toUpperCase() + unit.slice(1)}s still to come say "Not due yet" — they're never counted as owed. Tap one to mark it paid, or tap again to undo a mistake.`,
    auto ? `Fees are added by themselves. To take a ${unit} off for everyone (a holiday), switch it off in ${where}.` : `Add a ${unit} for the class with the button above the children.`,
    `Tap a child's card to see their whole year. Tap ✏️ next to an amount to change it, or the bin to take a ${unit} off just that child (Put back undoes it).`,
  ].filter(Boolean);
}

const HEAD = {
  '/': { title: 'Dashboard', steps: [
    'A quick look at today: children, classes, attendance and fees.',
    'Tap "View all" on a box to go to that page.',
    'The charts show this week\'s attendance and this month\'s fees.',
  ] },
  '/students': { title: 'Students', steps: [
    'Children are grouped by class — tap a class to open it.',
    'Tap a child to see their details, attendance and fees. Tap Edit to change them.',
    'Add a new child with Enroll, or a whole spreadsheet of children with Import.',
    'Set up a parent login from the child\'s card (switch the parent portal on in Settings first) — then Share or WhatsApp the ready-made message to the parent.',
    'Children who have left are kept at the bottom.',
  ] },
  '/attendance': { title: 'Attendance', steps: [
    'Pick the class at the top.',
    'Tap P (present), L (late) or A (absent) for each child — it saves straight away.',
    'Tap a child\'s card to see their month — tap P, L or A on any day to change it (tap it again to clear).',
    'Absences parents have told you about show at the top.',
  ] },
  '/fees': { title: 'Fees', steps: feesForHead },
  '/records': { title: 'Daily records', steps: [
    'Pick a class, then tap a child.',
    'Qur\'an: tap "+ Add" on a row to record today\'s lesson, with lesson notes and a grade.',
    'Behaviour: write a comment, positives and concerns for the day.',
    'Report: write the month\'s summary — the AI reads the lesson notes and behaviour records.',
  ] },
  '/reports': { title: 'Reports', steps: [
    'Tap a class to see its children.',
    '"Ready" means the summary is written. "Not written" takes you to write it.',
    'PDF downloads this month\'s report. History shows older ones.',
    '"Download all ready" gets the whole class at once.',
  ] },
  '/classes': { title: 'Classes & Teachers', steps: [
    'Add classes and teachers with the + buttons.',
    'Edit a class to choose its teacher and its Qur\'an level (Hifdh, Naazhirah, Qaa\'idah or Mixed).',
    'Give a teacher, or a whole class, a login so they can sign in.',
  ] },
  '/stats': { title: 'Stats', steps: [
    'Attendance and fees for the year, month by month.',
    'Pick the year at the top.',
  ] },
  '/settings': { title: 'Settings', steps: [
    'Everything saves by itself — there\'s no Save button.',
    'Your madrasah: its name, logo and sign-in code.',
    'Fees: how often you charge, how much, and which weeks or months.',
    'Classes & parents: madrasah days, reports and the parent portal.',
    'Days off & extra days: add days you\'re closed (like Eid) or open extra (like Ramadhaan weekends) — one day, or From–To for several.',
    'Download a backup now and then. "Download students to spreadsheet" gives you every child and their parents\' details.',
  ] },
  '/course': { title: 'Aalim course', steps: [
    'The Aalim years, first year first. Tap a year to open its books underneath.',
    'New? Tap "Use the Dars-e-Nizami years" to start from the usual years and books — or "Add a year" (a new class, or one you already have).',
    'Tap a book to change it or its teacher, and to see how far the class has got (what teachers record on the Timetable). Any book can be typed in. "Add a subject" adds another.',
    '"Edit" under an open year renames it, moves it to another place, takes it out of the Aalim years, or deletes it if it has no students.',
    'Hifdh and any other classes are on Classes & Teachers.',
    'At the end of the year, "Move everyone up" moves each child up a year — tap a child to keep them back. The last year finish the course. You can undo it.',
  ] },
  '/timetable': { title: 'Timetable', steps: [
    'Pick a class or a teacher at the top, then a day — or Week for the whole week.',
    'New? Under "Periods & times", tap "Use a typical day" (then change any times), or add your own periods and breaks.',
    'Tap a period to add or change its lesson: pick one of that year\'s books (or "Something else"), the teacher and the days it\'s on.',
    'A red note means that teacher is already teaching another class then. Same book with two classes? It\'s one shared lesson.',
    'Fill one day, then "Copy one day to other days" to save typing.',
    'A period can be on some days only — e.g. no afternoon periods on Friday.',
    'Once a lesson has happened, tap it then "Record what this lesson covered" — teachers do this for their own lessons.',
  ] },
  '/exams': { title: 'Exams', steps: [
    'Tap "Add an exam": its name, date, what each paper is out of, the pass mark, and which classes sit it.',
    'Each class\'s papers start as its books on the Aalim course page. Tap the class box to switch class; "Add a paper" for anything else (e.g. Hifdh, Tajweed).',
    'Tap a paper to enter its marks — or Absent. Teachers enter marks for the papers they teach.',
    'Results show each child\'s percentage, grade, position and whether they passed. A failed or missed paper is a resit.',
    'Tap a child to write the comments (the class teacher\'s and yours — they go on the report card) and download it.',
    '"Print the whole class" makes one PDF of every child\'s report card, for printing. Parents never get that — only their own child\'s.',
    'When it\'s ready, tap "Publish to parents" — each family then sees their child\'s report card in the parent portal. It\'s also on the child\'s Report tab in Daily records.',
  ] },
  '/madaaris': { title: 'Madaaris', steps: [
    'Every madrasah using the app — you only see counts, never their children.',
    'The bar on each card: grey = free months, green = paid, yellow = due within 2 weeks, red = overdue.',
    'Tap a madrasah to open it. When they pay you, tap "Next month" or "A year" — or tap a month box to pay up to it.',
    'Payments always run from the 1st: free to the end of their 6th month, then each payment covers the next unpaid month.',
    'Add a madrasah with its head\'s login, then send them their code. Edit details, passwords and switching off are inside each one.',
    'Tap "Turn on phone notifications" (in the installed app on your phone) to hear about every new sign-up.',
    'Your AI credit, database space and the demo link are at the bottom.',
  ] },
};

const TEACHER = {
  '/attendance': HEAD['/attendance'],
  '/fees': { title: 'Fees', steps: [
    'Pick your class at the top.',
    'Tap a fee to mark it paid. Tap it again if it was a mistake.',
    'Red is owed. "Not due yet" is still to come — a parent paying ahead? Tap Mark paid.',
    'Tap a child to see their whole year. Amounts and removing fees are done by the head.',
  ] },
  '/records': { title: 'Daily records', steps: [
    'Pick your class, then tap a child.',
    'Qur\'an: tap "+ Add" on a row to record today\'s lesson, with lesson notes and a grade.',
    'Behaviour: write a comment, positives and concerns for the day.',
  ] },
  '/timetable': { title: 'Timetable', steps: [
    'It opens on your own lessons today.',
    'After each lesson, tap it (or "Record") and write what the class covered — e.g. Pages 34–36. It shows what you covered last time.',
    'Tap a day — or Week for the whole week. You can fill in any day this week that\'s gone by.',
    'Tap the box at the top to see any class or teacher. Changes are made by the head.',
    'Covering for someone who\'s off? Tap their lesson and fill it in — it\'s saved under your name.',
  ] },
  '/exams': { title: 'Exams', steps: [
    'Tap an exam, then the class box to choose a class.',
    'Your papers are listed — tap one to enter its marks (or Absent) and Save.',
    'Class teachers also see their class\'s results: tap a child to write your comment and download their report card.',
  ] },
};

const PARENT = { title: 'How to use this page', steps: [
  'If you have more than one child, choose one at the top.',
  'Attendance and Fees: tap "By month" to see each day or week.',
  'Progress shows their latest Qur\'an lessons.',
  'Reports: download a finished report as a PDF.',
  'Report an absence at the bottom to let the teacher know.',
] };

// A Darul Uloom head's pages that work differently: reports are each exam's report card.
const DU_HEAD = {
  '/reports': { title: 'Reports', steps: [
    'A Darul Uloom\'s report is each exam\'s report card: marks, attendance for the term, behaviour and comments.',
    'Choose the exam and the class at the top. "Ready" means every paper is marked and the class teacher\'s comment is written.',
    'Tap a child to choose their behaviour, write the comments — "Write it for me" drafts the class teacher\'s — and get the PDF.',
    '"Print the whole class" makes one PDF for printing. Publish the exam on the Exams page and each family sees their own child\'s.',
  ] },
  '/records': { title: 'Daily records', steps: [
    'Pick a class, then tap a child.',
    'Qur\'an: tap "+ Add" on a row to record today\'s lesson, with lesson notes and a grade.',
    'Behaviour: write a comment, positives and concerns for the day — they go into the report\'s comment.',
    'Report: one per exam — tap one to write it and get the PDF.',
  ] },
};

// → { title, steps: [...] } for this page and person, or null.
export function pageHelp(pathname, role, darulUloom = false) {
  const h = role === 'parent' ? PARENT : ((darulUloom && role === 'owner' && DU_HEAD[pathname]) || (role === 'owner' ? HEAD : TEACHER)[pathname]);
  if (!h) return null;
  return { title: h.title, steps: typeof h.steps === 'function' ? h.steps() : h.steps };
}
