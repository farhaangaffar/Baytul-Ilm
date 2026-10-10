// The privacy policy and the terms each madrasah's head agrees to, in plain English.
// Shown at /privacy and /terms (anyone, signed in or not) and in pop-ups inside the app.
// Bump TERMS_VERSION when the terms change in a way heads should agree to again — every
// head is then asked once more (server/routes/session.js).
export const TERMS_VERSION = '2026-10';
export const LEGAL_UPDATED = 'October 2026';

// Who runs the service (a sole trader for now — change to the company if one is set up).
export const PROVIDER = {
  name: 'Farhaan Gaffar, trading as Suhuf', // the person or business madaaris deal with
  email: 'hello@suhuf.uk',                  // where heads and parents can write (forwarded by Cloudflare)
};

export const PRIVACY = [
  ['Who we are', [
    `Suhuf (suhuf.uk) is a madrasah management app run by ${PROVIDER.name}. Each madrasah that uses it decides what goes into it and is responsible for the information about its own children, parents and staff — in data-protection terms, the madrasah is the "controller" and we are its "processor". If you're a parent, your madrasah is the first place to ask about your information; you can also write to us at ${PROVIDER.email}.`,
  ]],
  ['What we keep', [
    'About children: name, date of birth, class, attendance, fees, Qur\'an progress (lessons, grades and the teacher\'s lesson notes), behaviour records and the reports written about them.',
    'About parents: names and phone numbers, a parent login if the madrasah sets one up, and any absences reported through the app.',
    'About staff: names, contact details the madrasah adds, and login details. Passwords are stored scrambled (hashed) — nobody, including us, can read them.',
    'About the madrasah: its name, logo, fee settings, term dates and similar settings.',
  ]],
  ['What it\'s used for', [
    'Only to run the madrasah\'s records: registers, fees, Qur\'an progress, behaviour and reports, and the parent portal. We don\'t sell information, show adverts or use it for marketing.',
  ]],
  ['Who else handles it', [
    'Vercel (the web hosting) and Neon (the database) store and serve Suhuf. They may keep data in the UK, the EU or the US, under the legal safeguards UK law requires for that.',
    'When the head asks the app to write a report, that child\'s records for the period are sent to Anthropic (the AI company behind Claude) to draft it. Under Anthropic\'s business terms this data is not used to train its AI.',
    'We don\'t pass information to anyone else unless the law requires it.',
  ]],
  ['Parents see', [
    'Their own children\'s attendance, fees, Qur\'an progress and finished reports — never teachers\' daily comments or lesson notes, and never anyone else\'s child.',
  ]],
  ['Cookies', [
    'One cookie keeps you signed in. Your device also remembers small things, such as your madrasah\'s code and which tab you last used. There are no tracking or advertising cookies.',
    'On the public pages only (the front page, this policy and the terms, and the demo) we count visits with Vercel Web Analytics: which page, roughly which country, and the type of device. It uses no cookies and doesn\'t identify anyone. Nothing inside a madrasah\'s app is counted.',
  ]],
  ['How long it\'s kept', [
    'For as long as the madrasah uses the app. A madrasah can download everything at any time (Settings → Backup). When a madrasah stops using the app, its information is deleted within 30 days of it asking, or within 90 days of its account being switched off. Demo madaaris are made up and are deleted after 24 hours.',
  ]],
  ['Keeping it safe', [
    'Everything travels encrypted (https). Each madrasah\'s information is kept apart — staff only ever see their own madrasah, teachers only their own classes, parents only their own children. If something ever went wrong with anyone\'s information, we would tell the madrasah straight away.',
  ]],
  ['Your rights', [
    'You can ask to see the information held about you or your child, to correct it, or to have it deleted. Ask your madrasah — we\'ll help them do it. If you\'re unhappy with how your information is handled, you can complain to the Information Commissioner\'s Office (ico.org.uk).',
  ]],
];

export const TERMS = [
  ['The agreement', [
    `These terms are between ${PROVIDER.name} ("we") and the madrasah using Suhuf (suhuf.uk). The head agrees to them on the madrasah's behalf when they first sign in.`,
  ]],
  ['Cost', [
    'Suhuf is free for the madrasah\'s first 6 months. After that it costs £20 a month, or £200 a year, for the whole madrasah, paid by standing order. If the price ever changes we\'ll tell you at least a month beforehand. If you don\'t want to carry on, just tell us — there\'s no contract period and nothing to pay for the free months.',
  ]],
  ['Your side', [
    'Keep your logins private and give staff and parents only the access they need.',
    'Tell parents that their children\'s records are kept in Suhuf (you can point them to the privacy policy), and only add information you have a proper reason to keep.',
    'Use the app for running your madrasah only, and don\'t try to reach another madrasah\'s information.',
  ]],
  ['Our side', [
    'We keep the app running and your information safe, as the privacy policy describes, and only use your information to provide the app to you.',
    'We act only on your instructions about your information, make sure anyone who works on the app keeps it confidential, help you answer requests from parents or staff about their information, and tell you without delay if anything goes wrong with it.',
    'We use Vercel, Neon and Anthropic to provide the app (see the privacy policy), and will tell you before adding anyone new who would handle your information.',
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
