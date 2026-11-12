// The privacy policy and the terms each madrasah's head agrees to, in plain English.
// Shown at /privacy and /terms (anyone, signed in or not) and in pop-ups inside the app.
// Bump TERMS_VERSION when the terms change in a way heads should agree to again — every
// head is then asked once more (server/routes/session.js). A Darul Uloom has its own version
// (DU_TERMS_VERSION), so a change that only concerns Darul Ulooms — like their price — asks only their heads. A school has
// its own too (SCHOOL_TERMS_VERSION), which also covers the data processing agreement (DPA below) — a school agrees to both at once.
export const TERMS_VERSION = '2026-10';
export const DU_TERMS_VERSION = 'du-2026-10';
export const SCHOOL_TERMS_VERSION = 'school-2026-11';
export const LEGAL_UPDATED = 'November 2026';

// Who runs the service (a sole trader for now — change to the company if one is set up).
export const PROVIDER = {
  name: 'Farhaan Gaffar, trading as Suhuf', // the person or business madaaris deal with
  email: 'hello@suhuf.uk',                  // where heads and parents can write (forwarded by Cloudflare)
};

export const PRIVACY = [
  ['Who we are', [
    `Suhuf (suhuf.uk) is a madrasah management app run by ${PROVIDER.name}. Each madrasah that uses it decides what goes into it and is responsible for the information about its own children, parents and staff — in data-protection terms, the madrasah is the "controller" and we are its "processor". If you're a parent, your madrasah is the first place to ask about your information; you can also write to us at ${PROVIDER.email}.`,
    'A school using Suhuf for its Islamic Studies department is the controller in the same way, and has a data processing agreement with us (suhuf.uk/dpa) saying how we look after its pupils\' information. If you\'re a pupil or a parent at a school, ask the school first.',
  ]],
  ['What we keep', [
    'About children: name, date of birth, whether a boy or girl, class, attendance, fees, Qur\'aan progress (lessons, grades and the teacher\'s lesson notes), behaviour records, the reports written about them, and (at a Darul Uloom) exam marks and report cards, whether they board, and their previous madrasah or school.',
    'For boarders at a Darul Uloom: their room, the night register, when they went home and came back (and who collected them), who is staying for a home weekend, and when they were unwell or given medicine (what, how much and by whom) — seen by the head and the teachers on boarding duty.',
    'A Darul Uloom\'s maintenance list: things to fix around the school, and which member of staff marked each one done — seen by the head and the staff ticked for maintenance.',
    'At a school (its Islamic Studies department): each pupil\'s progress with the school\'s lists of surahs, du\'aas and practicals — Incomplete, Completed with help or Achieved, and which teacher marked it — seen by the head, the pupil\'s own teachers, and their parents in the portal.',
    'A Darul Uloom\'s fees: each child\'s yearly fee, any extras, and each payment (amount, date, how it was paid, receipt number and who recorded it) — seen by the head, and by the child\'s own parents in the portal.',
    'If the madrasah adds them: a child\'s home address, allergies, medical conditions and medication (so staff can keep them safe — teachers see these, but not the home address), whether they may go home alone and who else may collect them.',
    'About parents: names, phone numbers, email addresses and whether they\'re the child\'s mother, father or guardian, an emergency contact\'s name and number, a parent login if the madrasah sets one up, and any absences reported through the app.',
    'At a school, if it gives its pupils logins: each pupil\'s username (from the school), when they last signed in, and what they do in the app (homework they tick as done, and their answers to quizzes with their marks) — a pupil only ever sees their own homework and marks. The school types in or imports the usernames and passwords; passwords are stored scrambled (hashed). So brothers and sisters can share a device, the phone or computer a pupil signs in on remembers their first name and username (never the password) for the sign-in screen, until it\'s removed there with ✕.',
    'About staff: names, contact details the madrasah adds, their attendance if the head records it, and login details. Passwords are stored scrambled (hashed) — nobody, including us, can read them.',
    'When a parent applies online through a madrasah\'s link: the details they type in for the madrasah, and a scrambled (hashed) form of the internet address used, only to stop too many applications from one place.',
    'When a madrasah signs up: the head\'s name, email and phone number, so we can help them get set up, and a scrambled (hashed) form of the internet address used, only to stop too many sign-ups from one place.',
    'About the madrasah: its name, logo, fee settings, term dates and similar settings.',
  ]],
  ['What it\'s used for', [
    'Only to run the madrasah\'s records: registers, fees, Qur\'aan progress, behaviour, reports and exams, and the parent portal. We don\'t sell information, show adverts or use it for marketing.',
  ]],
  ['Who else handles it', [
    'Vercel (the web hosting) and Neon (the database) store and serve Suhuf. They may keep data in the UK, the EU or the US, under the legal safeguards UK law requires for that.',
    'Schools: nothing about a school\'s pupils is ever sent to an AI company — a school\'s pages have no AI.',
    'When the head (or, at a Darul Uloom, a class teacher writing an exam report) asks the app to write a report, that child\'s records for the period — at a Darul Uloom including their exam marks — are sent to Anthropic (the AI company behind Claude) to draft it. Under Anthropic\'s business terms this data is not used to train its AI.',
    'When a madrasah or school signs up, we\'re told by email through Resend (an email service), with its name and the head\'s name, email and phone number.',
    'We don\'t pass information to anyone else unless the law requires it.',
  ]],
  ['Parents see', [
    'Their own children\'s attendance, fees, Qur\'aan progress, finished reports and published exam report cards, and for a boarder the home weekends and when they were signed out and back in — never teachers\' daily comments or lesson notes, and never anyone else\'s child.',
  ]],
  ['Cookies', [
    'One cookie keeps you signed in. Your device also remembers small things, such as your madrasah\'s code and which tab you last used. There are no tracking or advertising cookies.',
    'On the public pages only (the front page, this policy and the terms, and the demo) we count visits with Vercel Web Analytics: which page, roughly which country, and the type of device. It uses no cookies and doesn\'t identify anyone. Nothing inside a madrasah\'s app is counted.',
  ]],
  ['How long it\'s kept', [
    'For as long as the madrasah uses the app. A madrasah can download everything at any time (Settings → Backup). When a madrasah stops using the app, its information is deleted within 30 days of it asking, or within 90 days of its account being switched off. Demo madaaris are made up and are deleted after 24 hours.',
  ]],
  ['Keeping it safe', [
    'Children under 13 never sign themselves up: at a school, the school decides whether its pupils have logins and gives them their usernames and passwords, and a pupil only ever sees their own homework, quizzes and marks.',
    'Everything travels encrypted (https). Each madrasah\'s information is kept apart — staff only ever see their own madrasah, teachers only their own classes, parents only their own children. If something ever went wrong with anyone\'s information, we would tell the madrasah straight away.',
  ]],
  ['Your rights', [
    'You can ask to see the information held about you or your child, to correct it, or to have it deleted. Ask your madrasah — we\'ll help them do it. If you\'re unhappy with how your information is handled, you can complain to the Information Commissioner\'s Office (ico.org.uk).',
  ]],
];

export const TERMS = [
  ['The agreement', [
    `These terms are between ${PROVIDER.name} ("we") and the madrasah using Suhuf (suhuf.uk). The head agrees to them on the madrasah's behalf when signing up, or when they first sign in.`,
  ]],
  ['Cost', [
    'Suhuf is free for the madrasah\'s first 6 months. After that it costs £20 a month, or £200 a year, for a madrasah of up to 200 children, paid by standing order; for more than 200 children we\'ll agree a price with you. A Darul Uloom (a full-time madrasah) costs £50 a month, or £500 a year, for up to 500 students; for more than 500 we\'ll agree a price with you. A school\'s Islamic Studies department has its first term free (to 31 December, 31 March or 31 August — and the term after too if fewer than 6 weeks are left when it joins), then pays yearly by invoice: £500 for one form of entry, £800 for two, £1,000 for three; for four or more we\'ll agree a price with you. If the price ever changes we\'ll tell you at least a month beforehand. If you don\'t want to carry on, just tell us — there\'s no contract period and nothing to pay for the free months.',
  ]],
  ['Your side', [
    'Keep your logins private and give staff and parents only the access they need.',
    'Tell parents that their children\'s records are kept in Suhuf (you can point them to the privacy policy), and only add information you have a proper reason to keep.',
    'Health details (allergies, conditions, medication) are sensitive: only add what helps keep a child safe, with the parents\' agreement.',
    'Use the app for running your madrasah only, and don\'t try to reach another madrasah\'s information.',
  ]],
  ['Schools', [
    'For a school, these terms come with our data processing agreement (suhuf.uk/dpa), which says how we look after its pupils\' information on its behalf. The person signing up confirms they\'re allowed to agree to both for the school. Where the two differ about personal information, the data processing agreement wins.',
  ]],
  ['Our side', [
    'We keep the app running and your information safe, as the privacy policy describes, and only use your information to provide the app to you.',
    'We act only on your instructions about your information, make sure anyone who works on the app keeps it confidential, help you answer requests from parents or staff about their information, and tell you without delay if anything goes wrong with it.',
    'We use Vercel, Neon, Anthropic and Resend to provide the app (see the privacy policy), and will tell you before adding anyone new who would handle your information.',
    'When you leave, you can download everything first; then we delete your information as the privacy policy says.',
  ]],
  ['The app itself', [
    'We work hard to keep the app reliable and your information backed up, but it\'s provided as it is — please download a Backup now and then. We may improve or change features over time and will tell you about anything big.',
    'So far as the law allows, we aren\'t responsible for indirect losses, and our total responsibility is limited to what you\'ve paid us in the past 12 months. Nothing here limits responsibilities the law doesn\'t allow to be limited.',
  ]],
  ['Ending', [
    'Either side can stop at any time. We may switch off a madrasah that doesn\'t pay after the free months or misuses the app, after telling you first.',
  ]],
  ['Changes and law', [
    'If these terms change in a way that matters, you\'ll be asked to agree again when you next sign in. These terms are under the law of England and Wales.',
    `Questions about these terms or your information: ${PROVIDER.email}.`,
  ]],
];

// The data processing agreement a school agrees to with its terms (SCHOOL_TERMS_VERSION) — shown at /dpa, and as a PDF
// with the school's name and the date it was agreed (Settings → Your school; src/lib/dpaPdf.js). Plain English, written
// from the ICO's guidance on contracts between controllers and processors (UK GDPR Article 28).
export const DPA_UPDATED = 'November 2026';
export const DPA = [
  ['Who this is between', [
    `This agreement is between the school using Suhuf for its Islamic Studies department (the "school") and ${PROVIDER.name} ("we", "Suhuf"). It goes with the terms of use and starts when the school signs up (or agrees to it in the app).`,
    'The school is the controller of its pupils\', parents\' and staff\'s personal information in Suhuf. We are its processor: we only handle that information to run Suhuf for the school, as this agreement says.',
  ]],
  ['What is handled, and why', [
    'Purpose: to provide Suhuf to the school — its Islamic Studies records, assessments and reports, homework and quizzes, pupil and parent logins, and backups — for as long as the school uses it.',
    'People: the school\'s pupils, their parents or carers, and its staff.',
    'Information: pupils\' names, dates of birth, gender, classes and year groups; their Islamic Studies marks, assessment points and effort ratings; homework set and done; quiz answers and marks; pupil usernames and when they last signed in; parents\' or carers\' names, phone numbers and email addresses; staff names, contact details and logins. Passwords are stored scrambled (hashed) and nobody can read them. The school decides what it adds; we ask for no special category information (such as health) for a school.',
    'How: stored and shown in the app to the people the school gives logins to, each seeing only what their role allows.',
  ]],
  ['What we do', [
    'Act only on the school\'s instructions — this agreement, the terms and how the school uses the app are those instructions. If we\'re ever required by law to do something else with the information, we\'ll tell the school first unless the law forbids it.',
    'Make sure everyone who works on Suhuf keeps the information confidential.',
    'Keep it secure: everything travels encrypted (https), each school\'s information is kept apart from every other\'s, access is limited by role, passwords are hashed, and the database is backed up.',
    'Tell the school without undue delay — and within 48 hours of finding out — if anything goes wrong with its information (a personal data breach), with what we know and what we\'re doing about it.',
    'Help the school answer requests from pupils, parents or staff about their information (to see it, correct it or delete it), and help with any data protection impact assessment or question from the ICO, as far as is reasonable.',
    'Give the school the information it needs to show we keep to this agreement, and answer its reasonable questions about it.',
  ]],
  ['Who else handles it (sub-processors)', [
    'Vercel Inc. (web hosting) and Neon (the database, hosted in London — eu-west-2) store and serve Suhuf. Resend (email) is used only to tell us when a school signs up (its name and the head\'s contact details). Where any of them handles information outside the UK, it\'s under the safeguards UK law requires (such as the UK addendum to the EU standard contractual clauses).',
    'A school\'s pages use no AI: nothing about its pupils is sent to an AI company.',
    'We have written agreements with each of them that protect the information at least as well as this one. We\'ll tell the school at least 30 days before adding or changing anyone who would handle its information, so it can object — and if it does, it can leave with its information.',
  ]],
  ['When the school leaves', [
    'The school can download everything at any time (Settings → Backup). When it stops using Suhuf, we delete its information within 30 days of it asking, or within 90 days of its account being switched off, unless the law requires us to keep it. Backups roll over and are gone within a further 30 days.',
  ]],
  ['The school\'s side', [
    'The school makes sure it has a lawful basis for the information it puts into Suhuf (for a school, usually its public task or legitimate interests), tells pupils and parents that it uses Suhuf (it can point them to suhuf.uk/privacy), gives logins only to the people who need them, and keeps its own logins private.',
  ]],
  ['Liability, changes and law', [
    'Each side is responsible for its own part in keeping to UK data protection law (the UK GDPR and the Data Protection Act 2018). The limits on responsibility in the terms of use apply, except where the law doesn\'t allow them to.',
    'If this agreement needs to change, we\'ll tell the school and ask it to agree again in the app. It is under the law of England and Wales.',
    `Questions, or to report a concern: ${PROVIDER.email}.`,
  ]],
];
