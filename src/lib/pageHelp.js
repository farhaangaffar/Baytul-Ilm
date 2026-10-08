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
    `Green means paid, red means owed. Tap a ${unit} to mark it paid, or tap again to undo a mistake.`,
    auto ? `Fees are added by themselves. Choose which ${unit}s are charged in ${where}.` : `Add a ${unit} for the class with the button above the children.`,
    auto ? `Tap a grey box to add a ${unit} for one child — owed, or paid in advance.` : null,
    'Tap a child\'s card to see all their fees, or change an amount.',
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
    'Tap a child\'s card to see their month or mark a different day.',
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
  '/madaaris': { title: 'Madaaris', steps: [
    'Every madrasah using the app — you only see counts, never their children.',
    'Add a madrasah with its head\'s login, then send them their code.',
    'Each madrasah is free for 6 months — the badge shows when that ends. Change the date with Edit.',
    'Your AI credit, database space and the demo link are at the bottom.',
  ] },
};

const TEACHER = {
  '/attendance': HEAD['/attendance'],
  '/fees': { title: 'Fees', steps: [
    'Pick your class at the top.',
    'Tap a fee to mark it paid. Tap it again if it was a mistake.',
    'Fees are added by the madrasah office — you can\'t add, remove or change them.',
  ] },
  '/records': { title: 'Daily records', steps: [
    'Pick your class, then tap a child.',
    'Qur\'an: tap "+ Add" on a row to record today\'s lesson, with lesson notes and a grade.',
    'Behaviour: write a comment, positives and concerns for the day.',
  ] },
};

const PARENT = { title: 'How to use this page', steps: [
  'If you have more than one child, choose one at the top.',
  'Attendance and Fees: tap "By month" to see each day or week.',
  'Progress shows their latest Qur\'an lessons.',
  'Reports: download a finished report as a PDF.',
  'Report an absence at the bottom to let the teacher know.',
] };

// → { title, steps: [...] } for this page and person, or null.
export function pageHelp(pathname, role) {
  const h = role === 'parent' ? PARENT : (role === 'owner' ? HEAD : TEACHER)[pathname];
  if (!h) return null;
  return { title: h.title, steps: typeof h.steps === 'function' ? h.steps() : h.steps };
}
