// "Page instructions": a few plain steps for each page, for whoever is signed in (the head,
// a teacher or a parent — each only sees what they can do). Shown by components/PageHelp.js,
// which opens them by itself the first time someone visits a page on a device.
import { feeFrequency, feeUnit } from './feePeriods';
import { getBranding } from './branding';

function feesForHead() {
  const frequency = feeFrequency();
  const unit = feeUnit(frequency);
  const auto = getBranding().feeAuto !== false;
  const where = frequency === 'weekly' ? 'Settings → Fee weeks' : frequency === 'monthly' ? 'Settings → Fee months' : 'Settings → Terms';
  const dueLine = frequency === 'weekly'
    ? 'A green light means paid, red means owed and grey means not due yet — every week in a month that’s started counts as owed straight away, not just the ones that have individually arrived. Tap one to mark it paid, or tap again to undo a mistake.'
    : `A green light means paid, red means owed and grey means not due yet. ${unit[0].toUpperCase() + unit.slice(1)}s still to come say "Not due yet" — they're never counted as owed. Tap one to mark it paid, or tap again to undo a mistake.`;
  return [
    'Pick the class at the top.',
    dueLine,
    auto ? `Fees are added by themselves. To take a ${unit} off for everyone (a holiday), switch it off in ${where}.` : `Add a ${unit} for the class with the button above the children.`,
    `Tap a child's card to see their whole year. Tap ✏️ next to an amount to change it, or the bin to take a ${unit} off just that child (Put back undoes it).`,
  ].filter(Boolean);
}

const HEAD = {
  '/': { title: 'Dashboard', steps: [
    'The boxes on top: children, classes, and this year\'s attendance and fees still owed.',
    'Tap "View all" on a box to go to that page.',
    'The charts show this week\'s attendance and this month\'s (or term\'s) fees.',
    'At the bottom, "Recommend Suhuf": send your link to another madrasah — you get a month free for each one that signs up.',
  ] },
  '/students': { title: 'Students', steps: [
    'Children are grouped by class — tap a class to open it.',
    'Tap a child to see their details, attendance and fees. Tap Edit to change them — parents, home, emergency contact, health and going home.',
    'Allergies, conditions or medication show in red on the child\'s card, and as a red heart by their name on the register.',
    'Add a new child with Enroll, or a whole spreadsheet of children with Import.',
    'Set up a parent login from the child\'s card (switch the parent portal on in Settings first) — then Share or WhatsApp the ready-made message to the parent.',
    'Children who have left are kept at the bottom.',
    'Children added by Import (or whose class was deleted) show in "Not in a class" at the top — tick them (or a whole group) and choose their class.',
    'Waiting list: oldest first. Children whose parents applied online are marked "Applied online" (new until you open them).',
  ] },
  '/attendance': { title: 'Attendance', steps: [
    'Pick the class at the top.',
    'Tap P (present), L (late) or A (absent) for each child — it saves straight away.',
    'Tap a child\'s card to see their month — tap P, L or A on any day to change it (tap it again to clear).',
    'Absences parents have told you about show at the top.',
    'Teachers (at the top): mark each teacher P, L or A for the day — use ‹ › to go to another day. Each teacher\'s totals for the month are underneath.',
  ] },
  '/fees': { title: 'Fees', steps: feesForHead },
  '/records': { title: 'Daily records', steps: [
    'Pick a class, then tap a child.',
    'Qur\'aan: tap "+ Add" on a row to record today\'s lesson, with lesson notes and a grade.',
    'Behaviour: write a comment, positives and concerns for the day.',
    'Report: write the month\'s summary — the AI reads the lesson notes and behaviour records.',
  ] },
  '/reports': { title: 'Reports', steps: [
    'Tap a class to see its children.',
    '"Ready" means the summary is written. "Not written" takes you to write it.',
    'PDF downloads this month\'s report. History shows older ones.',
    '"Download all ready" gets the whole class at once.',
    'More than one academic year? A Year box appears — tap it to browse an earlier year.',
  ] },
  '/classes': { title: 'Classes & Teachers', steps: [
    'Add classes and teachers with the + buttons.',
    'Each class or teacher is one line — tap it to see the details underneath, with Edit and Delete.',
    'A class with no teacher is marked in amber — tap the amber "No teacher" box at the top to see just those.',
    'Edit a class to choose its teacher and its Qur\'aan level (Hifdh, Naazhirah, Qaa\'idah or Mixed).',
    'Tap Login in a class or teacher to give them a login so they can sign in.',
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
    'Online applications: share the link so parents can apply; write a short message for the top of the form.',
    'Days off & extra days: add days you\'re closed (like Eid) or open extra (like Ramadhaan weekends) — one day, or From–To for several.',
    'Download a backup now and then. "Download students to spreadsheet" gives you every child and their parents\' details.',
  ] },
  '/course': { title: 'Aalim course', steps: [
    'The Aalim years, first year first. Tap a year to open its books underneath.',
    'New? Tap "Use the usual Aalim years" to start from the usual years and their classical Islamic core texts — or "Add a year" (a new class, or one you already have). A year missing its usual texts has "Add the classical core texts".',
    'Tap a book to change it or its teacher, and to see how far the class has got (what teachers record on the Timetable). Any book can be typed in. "Add a subject" adds another.',
    '"Edit" under an open year renames it, moves it to another place, takes it out of the Aalim years, or deletes it if it has no students.',
    'Hifdh and any other classes are on Classes & Staff. A class there that should be a year (e.g. a 1st year made again) shows here as "Add … to the years".',
    'At the end of the year, "Move everyone up" moves each child up a year — tap a child to keep them back. The last year finish the course. You can undo it.',
  ] },
  '/timetable': { title: 'Timetable', steps: [
    'Pick a class or a teacher at the top, then a day (on a phone, swipe the card sideways for the next day) — or Week for the whole week.',
    'New? Under "Periods & times", tap "Use a typical day" (then change any times), or add your own periods and breaks.',
    'Tap a period to add or change its lesson: pick one of that year\'s books (or "Something else"), the teacher and the days it\'s on.',
    'A red note means that teacher is already teaching another class then. Same book with two classes? It\'s one shared lesson.',
    'Fill one day, then "Copy one day to other days" to save typing.',
    'A period can be on some days only — e.g. no afternoon periods on Friday.',
    'Once a lesson has happened, tap it then "Record what this lesson covered" — teachers do this for their own lessons.',
  ] },
  '/exams': { title: 'Exams & reports', steps: [
    'Tap "Add an exam": its name, date, maximum marks and pass mark for each paper, and which classes sit it.',
    'Open an exam and pick a class at the top. Then work down the three steps.',
    '1 · Marks: tap a paper to enter its marks (or Absent). Papers start as the year\'s books — "Add a paper" for anything else. "Edit paper" gives one its own maximum and pass mark (e.g. Hifdh heard aloud) or a guest examiner.',
    '2 · Reports: tap a child — choose their behaviour, write the comments ("Write it for me" drafts the class teacher\'s) and get the PDF. "Print the whole class" makes one PDF.',
    '3 · Send to parents: tap Publish when the reports are ready — each family sees only their own child\'s.',
  ] },
  '/madaaris': { title: 'Madaaris', steps: [
    'Every madrasah using the app — you only see counts, never their children.',
    'The bar on each card: grey = free months, green = paid, yellow = due within 2 weeks, red = overdue.',
    'Tap a madrasah to open it. When they pay you, tap "Next month" or "A year" — or tap a month box to pay up to it.',
    'Payments always run from the 1st: free to the end of their 6th month, then each payment covers the next unpaid month.',
    'Add a madrasah with its head\'s login, then send them their code. Edit details, passwords and switching off are inside each one.',
    'Tap "Turn on phone notifications" (in the installed app on your phone) to hear about every new sign-up.',
    'Your AI credit, database space, how many demos were tried and madaaris signed up (kept for good), and the demo link are at the bottom.',
  ] },
};

const TEACHER = {
  '/attendance': { ...HEAD['/attendance'], steps: HEAD['/attendance'].steps.filter(t => !t.startsWith('Teachers')) }, // the teachers' register is the head's
  '/fees': { title: 'Fees', steps: [
    'Pick your class at the top.',
    'Tap a fee to mark it paid. Tap it again if it was a mistake.',
    'Green is paid, red is owed and grey is not due yet. "Not due yet" is still to come — a parent paying ahead? Tap Mark paid.',
    'Tap a child to see their whole year. Amounts and removing fees are done by the head.',
  ] },
  '/records': { title: 'Daily records', steps: [
    'Pick your class, then tap a child.',
    'Qur\'aan: tap "+ Add" on a row to record today\'s lesson, with lesson notes and a grade.',
    'Behaviour: write a comment, positives and concerns for the day.',
  ] },
  '/timetable': { title: 'Timetable', steps: [
    'It opens on your own lessons today — the one on now is marked Now. Each subject has its own colour.',
    'Tap a lesson to see its book, teacher and room. After the lesson, tap "Record what was covered" — e.g. Pages 34–36. It shows what you covered last time.',
    'Tap a day (on a phone, swipe sideways for the next one) — or Week for the whole week. You can fill in any day this week that\'s gone by.',
    'Tap the box at the top to see any class or teacher. Changes are made by the head.',
    'Covering for someone who\'s off? Tap their lesson and fill it in — it\'s saved under your name.',
  ] },
  '/exams': { title: 'Exams & reports', steps: [
    'Tap an exam, then choose a class at the top.',
    '1 · Marks: tap one of your papers to enter its marks (or Absent) and Save.',
    '2 · Reports (class teachers): tap a child to choose their behaviour and write your comment — "Write it for me" drafts it.',
  ] },
};

const PARENT = { title: 'How to use this page', steps: [
  'If you have more than one child, choose one at the top.',
  'Attendance and Fees: tap "By month" to see each day or week.',
  'Progress shows their latest Qur\'aan lessons.',
  'Reports: download a finished report as a PDF.',
  'Report an absence at the bottom to let the teacher know.',
  'Your details: tap "Check & update" to change phone numbers, address, emergency contact or health.',
  'Boarders: "Going home" shows the next home weekends and your child\'s trips home.',
] };

// Boarding (a Darul Uloom): the head, and teachers on boarding duty (who can't change rooms or home weekends).
const BOARDING_HEAD = { title: 'Boarding', steps: [
  'Boarders are the children whose details say "Boarder" (Students → a child → Edit → More details).',
  'Rooms: "Add rooms" — write the section (whatever you call it: Block A, East Wing…), the level, and each room\'s number and beds ("Another room" adds the next one).',
  'Each section has a card per floor, closed to start — tap a floor for its rooms, then a room to see who sleeps there (✕ takes someone out, "Put a boarder in this room" adds one). The amber line places boarders not in a room yet.',
  '"Edit section" is by the section\'s name; each floor has its own Edit. A floor\'s Edit changes its name and every room in it — numbers, beds, ✕ to take a room off, "Another room" to add one. "Edit section" changes its name and each level\'s name (✕ takes a level off; "Another level" adds one with 4-bed rooms). Either can be removed with all its rooms (its boarders go to "Not in a room").',
  'Tonight: each floor is one line — tap it to open (or "Expand all" under the date), then tap In, Missing (not here and not signed out) or Sick. "Rest are in" marks everyone left on that floor. Anyone signed out shows as Home.',
  'Going home: Sign out or Sign in → type a name → tap it. "Not in" lists everyone out, with Back on each.',
  'Home weekends: everyone goes home — tap a weekend to add anyone staying. The rest are signed out by themselves at the leave time.',
  'Health: "Write one down" when a boarder is unwell or given medicine. It shows on their profile on Students.',
  'Staff ticked for Boarding duty (Classes & Staff → Staff → a name → Edit) get this page too.',
] };
const BOARDING_TEACHER = { title: 'Boarding', steps: [
  'Tonight: each floor is one line — tap it to open (or "Expand all" under the date), then tap In, Missing (not here and not signed out) or Sick. "Rest are in" marks everyone left on that floor. It\'s saved under your name.',
  'Going home: Sign out or Sign in → type a name → tap it. "Not in" lists everyone out, with Back on each.',
  'Health: "Write one down" when a boarder is unwell or given medicine.',
  'Rooms and home weekends are set by the head.',
] };

// A Darul Uloom head's pages that work differently: reports are each exam's report card.
const MAINTENANCE_HEAD = { title: 'Maintenance', steps: [
  '"Add a job" for anything to fix: what, where, and whether it\'s urgent. Urgent jobs go to the top in red.',
  'Staff ticked Maintenance (Classes & Staff → Staff → a name → Edit) see this list and mark jobs done.',
  'Tap a job to see it, mark it done, or Edit it. A job marked done by mistake can be put back on the list.',
  'Jobs done are under "Done", with who did them and when.',
] };
const MAINTENANCE_STAFF = { title: 'Maintenance', steps: [
  'These are the things to fix around the school — urgent ones at the top in red.',
  'Tap a job to see where it is and any note from the head.',
  'When it\'s fixed, tap "Mark done", say what you did if you like, and save.',
] };

const DU_HEAD = {
  '/boarding': BOARDING_HEAD,
  '/maintenance': MAINTENANCE_HEAD,
  '/fees': { title: 'Fees', steps: [
    '"Prices & ways to pay": the yearly fee for boarders and day students, the ways parents can pay it (the whole year, termly, monthly — each with its dates) and, if you want one, a sibling discount.',
    'Pick a class. Each child shows what they\'ve paid of their year\'s fee — red when something is overdue.',
    'Tap a child: their instalments as boxes, extras and payments. "Record a payment" takes any amount and makes a numbered receipt to send by WhatsApp or print.',
    '"Change fee" gives a child their own yearly fee (a bursary) or another way to pay. "Add a charge" adds books, a trip… for a child, a class or everyone.',
    '"Import from a spreadsheet" brings in what each child has paid so far this year, if you kept fees somewhere else before.',
  ] },
  '/classes': { title: 'Classes & Staff', steps: [
    'Add classes and staff with the + buttons.',
    'Each class or member of staff is one line — tap it for the details. A teacher shows the books they teach in each year.',
    'Each class has a Course: Aalim (one of the Aalim years — choose its place, its books are on the Aalim course page), Hifdh, Naazhirah, Qaa\'idah, or Mixed Qur\'aan levels.',
    'Give a member of staff, or a whole class, a login so they can sign in. Edit someone and choose Boarding duty: Yes to give them the Boarding page.',
  ] },
  '/attendance': { ...HEAD['/attendance'], steps: HEAD['/attendance'].steps.map(t => (t.startsWith('Teachers (at the top)')
    ? 'Staff (at the top): mark each member of staff P, L or A for the day — use ‹ › to go to another day. Their totals for the month are underneath.' : t)) },
  '/records': { title: 'Daily records', steps: [
    'Pick a class, then tap a child.',
    'Qur\'aan: tap "+ Add" on a row to record today\'s lesson, with lesson notes and a grade.',
    'Behaviour: write a comment, positives and concerns for the day — they go into the report\'s comment.',
    'Report: their reports, one per exam, to download — they\'re written on Exams & reports.',
  ] },
};

// A Darul Uloom teacher: attendance and behaviour for every Aalim year they teach.
const DU_TEACHER = {
  '/boarding': BOARDING_TEACHER,
  '/maintenance': MAINTENANCE_STAFF,
  '/attendance': { title: 'Attendance', steps: [
    'Tap Class at the top and pick the year you\'re with — every Aalim year you teach is there.',
    'Tap P, L or A for each student. It\'s saved under your name ("Today\'s register taken by …").',
    'Tap a student to see or change any day this month.',
  ] },
  '/records': { title: 'Daily records', steps: [
    'Pick the year, then tap a student.',
    'Behaviour: write a comment, positives and concerns for the day. Another teacher may have written today already — add to it rather than replace it.',
  ] },
};

// → { title, steps: [...] } for this page and person, or null.
export function pageHelp(pathname, role, darulUloom = false) {
  const h = role === 'parent' ? PARENT : ((darulUloom && (role === 'owner' ? DU_HEAD : DU_TEACHER)[pathname]) || (role === 'owner' ? HEAD : TEACHER)[pathname]);
  if (!h) return null;
  return { title: h.title, steps: typeof h.steps === 'function' ? h.steps() : h.steps };
}
