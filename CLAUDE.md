# Notes for Claude

## Working agreement with the owner

This app is live — Baytul 'Ilm Madrasah runs on it every day — and is being turned
into a product other madaaris can use, called **Suhuf** (صُحُف) at **https://suhuf.uk**
(`APP_NAME` / `APP_URL` in `src/lib/branding.js`; which of suhuf.uk / www.suhuf.uk redirects
to the other is set in Vercel's Domains settings — never add a redirect in the app too, that made
a redirect loop once; the old baytul-ilm-two.vercel.app address still works). Baytul 'Ilm is the first customer of the same
codebase (one codebase, not a fork).

- `main` is production: Vercel deploys it to the live site automatically. Never push
  to `main` directly — work on a branch and open a pull request.
- **Small changes** (bug fixes, tweaks, copy/UI adjustments, anything low-risk that
  doesn't restructure data or auth): once the build passes and the change is tested,
  and Vercel's preview check on the PR is green, **merge the PR yourself** and tell
  the owner it's live.
- **Large changes** (database restructuring/migrations that change existing data,
  authentication/accounts, multi-tenant work, anything hard to undo): open the PR,
  give the owner the **Vercel preview link** to try, and **leave the merge to them**.
  Write up a plan for their approval before starting anything this size.
- Preview deployments may share the production database unless Vercel's environment
  variables are split. Before testing any large change on a preview, make sure
  previews use a separate test database.
- If unsure whether a change is small or large, treat it as large.
- After a PR is merged, start follow-up work on a fresh branch from the latest `main`.
- **After merging (or closing) a PR, delete its Neon preview branch too** (Neon MCP
  tools: `list_branches` / `delete_branch`, name `preview/<git branch>`) — Neon's free
  plan caps the total number of database branches, and leftover preview ones (Vercel
  creates one per branch automatically) silently fill that cap and make every future
  preview deployment fail with no useful error, until old ones are cleared out. Never
  delete `main`'s own branch or one backing another still-open PR.
- Explain things in plain language — the owner isn't a developer.
- **Every preview shows made-up data:** when giving the owner a preview link, give the demo link
  too (`<preview>/?demo`, or `<preview>/?demo=darul-uloom` for Darul Uloom work) so they see the
  change with realistic names, not an empty madrasah. If the change needs data the demo doesn't
  make yet, add it to `server/demo.js` in the same PR.
- **The owner's design style:** cards, with **single full-width lines** inside them to tap (`.line-row` —
  the Course page, the class chooser) that open their details underneath, small grey boxes for figures and
  quick choices (`BoxRow`, `.box-row-3`), and pop-ups for editing. Selected = light blue (`.line-row.on`,
  `--teal-light`), never the dark ink fill. Keep the top of a page uncluttered: with 2 or more classes or
  academic years (and always in a Darul Uloom, head and teachers alike) the class/year pills become
  `ClassBar`'s Class ▾ / Year ▾ boxes. Rows must keep one shape
  whatever their content (e.g. Students' class rows: on phones, name then three equal boxes). Avoid squashed columns and walls of buttons.

## Project conventions

- React (Create React App) front end in `src/`, Postgres, and a Vercel serverless API
  that is **one function**: `vercel.json` rewrites every `/api/<name>` to
  `api/router.js`, which dispatches to `server/routes/<name>.js` (shared helpers in
  `server/db.js`, `server/auth.js`). To add an endpoint, add a file in
  `server/routes/` and a static `require` line in `api/router.js` — never add files
  to `api/` (each file there becomes a separate function; the free Hobby plan caps
  them at 12). The app stays on the Hobby plan until the first paying madrasah.
  The function runs in London (`"regions": ["lhr1"]` in `vercel.json`), next to the Neon database
  (eu-west-2) — every query used to cross the Atlantic from Vercel's default US region.
- **Many madaaris, one database** (`madaaris` table). Every table of school data has a
  `madrasah_id`, and **every query must be limited to `req.user.madrasahId`** — reads,
  updates and deletes by id included (`… WHERE id = $1 AND madrasah_id = $2`). Any
  student id that arrives in a request must be checked against `accessScope(req).studentIds`
  (owners: their whole madrasah; teachers: their own classes) — that's what stops one
  madrasah reaching another's records. Inserts must set `madrasah_id` (the column has
  no default on purpose). Baytul 'Ilm is madrasah 1.
- Logins (`server/auth.js`): each madrasah has an **owner** (its head) and **teacher**
  logins linked either to a `teachers` row or to one class (`class_id`, a shared class
  login). A login is a username or email (`users.login`), unique within its madrasah;
  people sign in with the madrasah's **code** (remembered per device,
  `src/lib/madrasahCode.js`) + login + password. One owner is the **platform owner**
  (`platform_admin`) with the Madaaris page (`server/routes/madaaris.js`: counts only,
  add / rename / switch off a madrasah, reset its head's password, delete one for ever (only once
  switched off, never your own, its code typed to confirm — every table in `TABLES`, `server/demo.js`); plus an AI credit card, a database-space bar (`?action=usage`, Neon free = 0.5 GB) —
  this month's AI requests with a rough cost and a link to Anthropic's billing page — and the
  demo link to copy or share). Each madrasah is free for 6 months (`madaaris.free_until`, set
  when added, editable there; older rows count 6 months from `created_at`) — payment is by
  standing order, outside the app; the platform owner records each one on the Madaaris page.
  Each madrasah is a tidy card (name, children · classes · AI this month, payment state, and a bar
  along the bottom: grey free / green paid / yellow due within 2 weeks / red overdue); tapping it
  opens everything (`DetailModal`): status, one-tap "Next month" / "A year" payments, month boxes
  (tap one to pay up to it), plan `madaaris.billing_plan` monthly/yearly + `billing_amount` (default
  £20/£200), payments received (`madrasah_payments`: date/amount/months), contact, size, and the
  manage buttons (Edit details, reset password, switch off, delete). **Payments run from the 1st**
  (`src/lib/billing.js`): free until the end of the month `free_until` falls in, then each payment's
  months cover the next unpaid months in order — the date paid moves nothing. A "Payments from
  madaaris" card totals income (`?action=income`). **Sign-up notifications**
  (`server/notify.js`, `notifyPlatformOwner()`, called by `signup.js`): a phone push to every
  device switched on in the Madaaris page's "When a madrasah signs up" card (web-push, keys made
  once and kept in `platform_kv`, devices in `push_subscriptions`, shown by `public/sw.js`), and
  an email through Resend when `RESEND_API_KEY` is set in Vercel (to `NOTIFY_EMAIL`, else
  hello@suhuf.uk; from `NOTIFY_FROM`, else notifications@suhuf.uk — suhuf.uk must be verified in
  Resend). Neither failing ever stops a sign-up. Sign-up pushes wait up to a day for a sleeping phone;
  "Send a test" ones expire after 60 s; each push has its own tag (a shared tag let Android replace
  one silently); a push with no text still shows words (never a blank notification). These tables are made by `server/platform.js`. The dashboard has no Ask AI any more. `requireAuth(handler)`
  is owner-only by default; pass `{ teacher: true }` only for routes teachers use, and
  scope with `accessScope(req)` / `teacherScope(req)`. Teachers get Attendance, Daily
  records and Fees for their own classes, and on Fees may only tick an added fee paid or
  untick it — never start/add/remove a week or month, or change an amount.
  `ADMIN_PASSWORD` is only the first-time-setup / platform-owner-recovery key — it never
  signs anyone in once an owner account exists.
- **Darul Uloom** (`madaaris.kind`: 'maktab' — the original — or 'darul_uloom', a full-time
  Darul Uloom): one codebase; a Darul Uloom gets extra pages on top of everything a maktab has,
  built in stages (the owner's plan: year groups & kitaabs → timetable → exams & report cards →
  boarding → fees & launch). **Build for every Darul Uloom, not one:** Darul Uloom London is the first
  user and its answers guide the design, but nothing may be fixed to one school — year names, periods and
  times, exam marks and pass marks, fee amounts and instalments, rooms, home-weekend times are all set by
  each madrasah (sensible defaults, everything changeable). Never put a real school's names or data in code
  or the public demo. Only the platform owner sets the kind (Madaaris page → Add / Edit details;
  changing it resets that madrasah's plan and price). Price: a Darul Uloom £500 a year (`PRICES` in
  `server/newMadrasah.js`, `KIND_PRICES` in `src/lib/billing.js`). The front end checks
  `useAuth().isDarulUloom`; a maktab must never see a Darul Uloom page. Sign-up and the front page
  only offer it once the stages are done (the terms' Cost section and `TERMS_VERSION` change then).
  **Aalim course page** (`/course`, menu "Aalim course", head only, `src/pages/Course.js`, `server/routes/course.js` — answers 403 for
  a maktab): a year group is an ordinary class with `classes.course_order` (1 = first year; NULL = not a
  course year, e.g. Hifdh), so attendance/fees/reports work unchanged. Each year's subjects & kitaabs are in
  `du_subjects` (any kitaab can be typed; the starter list's and the madrasah's own are suggested). "Use the
  usual Aalim years" adds the usual years and their classical Islamic core texts (`STARTER`); an open year
  missing some of its usual texts has "Add the classical core texts" (`?action=starter-books`, matched by name, else place). "Move everyone up" moves each Active
  child one year on (held-back ones stay); the last year are marked left (`Inactive`, leave date today);
  each move is logged in `du_year_moves` so it can be undone (only children not changed since).
  The page is single lines: year lines (tap to open its kitaab lines underneath), "Add a year" (`?action=year`: a new
  class or an existing one; rename, move to another place, take out of the Aalim years; a year with no students can be
  deleted). Only the Aalim years show there — Hifdh and other classes live on Classes & Teachers only; a class with no
  Qur'an type that isn't a year (e.g. "1st year" deleted and re-made on Classes & Teachers) gets an "Add … to the years"
  line. A new year's place follows its name until picked by hand (`guessPlace()`: "1st year" → first, else last). Classes
  are listed in course order everywhere (`classes.course_order` sorts first); on Classes & Teachers a course
  year shows "Aalim · year N". In a Darul Uloom the class pop-up's Qur'an box is a **Course** box (Aalim / Hifdh /
  Naazhirah / Qaa'idah / Mixed Qur'an levels / Something else — later secondary-school years); Aalim shows "Place in
  the Aalim years" and sends `coursePlace` (`placeInCourse()` in `server/routes/classes.js`: 0 = take out), and the
  teacher box becomes "Report writer". A new class starts as Aalim, its place guessed from its name (`src/lib/courseYears.js`).
  **Timetable** (`/timetable`, menu "Timetable", head edits, teachers read — it opens on their own lessons
  today; `src/pages/Timetable.js`, `server/routes/timetable.js`, 403 for a maktab): each madrasah's own periods
  (`du_periods`: name, times, break or lessons, which days — '' = every school day, e.g. no afternoon on Friday;
  "Use a typical day" = `STARTER_PERIODS`) and lessons (`du_lessons`, one per class/day/period: subject + book —
  usually one of the year's `du_subjects` — teacher, room). Viewed by class or teacher (Class ▾ box), a day at a
  time or the Week (on computers a colour grid; on phones day boxes with dates, one day at a time, swipe sideways — and Week, every day's card one under another).
  Calm look (the owner found it too wordy): each subject has its own soft colour (`COLOURS`, shared out among the viewed
  class's/teacher's subjects); a lesson line is just start time, subject and book (teacher and room are one tap away —
  teachers get a details pop-up, `ViewModal`, with Record); today's current lesson is marked Now; Record shows once a lesson has started. The lesson pop-up warns when the teacher is
  already with another class then; the same subject and book with two classes is one shared lesson. "Copy one
  day to other days" (`?action=copy-day`) fills the week. **What a lesson covered** is kept per class (an Aalim year
  moves through its books together — `du_lesson_logs`, one per class/date/subject/book): the teacher taps one of
  today's (or this week's past) lessons → "What did the class cover?" (e.g. Pages 34–36) + notes for the head; it
  shows last time's. The lesson's own teacher has a Record button; the head and the class's login can record too; any other teacher can, as **cover** (tapping someone else's lesson opens it with a "Covering for …" note) — the record keeps who wrote it, and the book's history shows "Recorded by … (cover)" (`mayLog`). Not for Hifdh / Naazhirah / Qaa'idah (a Qur'an class, or that subject — `QURAN_SUBJECT`): those are recorded child by child in Daily records.
  The Aalim course page shows each book's latest ("Last: …") and its history in the book's pop-up.
  **Aalim years have no one class teacher:** a teacher also gets Attendance and Daily records' Behaviour for every
  Aalim year they teach (a `du_lessons` or `du_subjects` row of theirs — `teachingClassNames()` in `server/auth.js`,
  asked for with `accessScope(req, { teaching: true })` by attendance, daily-records, absences, and the students/classes
  lists). Qur'an, fees, reports and exams stay with the class's own teacher; Hifdh and other classes are unchanged.
  Who did it is kept: `attendance.marked_by` ("Today's register taken by …", and on a child's day line, DU only) and
  `daily_records.updated_by` ("Last written by …"), via `whoName()`. An Aalim year's class teacher is shown as its
  **Report writer** on the Aalim course page (blank = the head).
  Typed fields with suggestions use `PickField` (a plain box + small grey suggestion boxes) — never `<datalist>`.
  **Exams & reports** (`/exams`, menu "Exams & reports", head + teachers; `src/pages/Exams.js`, `server/routes/exams.js`, results
  worked out in `server/examResults.js`, PDF `src/lib/reportCardPdf.js`; 403 for a maktab): the head adds an exam (`du_exams`:
  name, date, academic year, each paper's out of and the pass mark — each madrasah's own, e.g. out of 50 pass 17 — and the
  classes sitting it); each class's papers (`du_exam_papers`) start as its books (`du_subjects`) and can be added to (e.g.
  Hifdh, Tajweed) or changed (head: tap a paper → Edit paper). A paper can have its own maximum and pass mark
  (`du_exam_papers.pass_mark`, NULL = the exam's scaled — e.g. Hifdh heard aloud, 100 pass 60) and be marked by a
  **guest examiner** (`examiner` name instead of a teacher; head/class teacher enter the marks; shown on the card and PDF). Marks (`du_exam_marks`, a mark or Absent) are entered per paper by its teacher, the class
  teacher or the head. Results per class: total, %, grade (Excellent 80+ / Very good 65+ / Good 50+ / Satisfactory to the pass mark / Needs improvement),
  position (once every paper is marked; equal %s share), Passed or Resit (any failed — below the pass mark scaled to the
  paper — or absent paper). Comments (`du_exam_comments`): class teacher's (class teacher or head) and head's. Teachers see
  only their papers, plus results for the class they're class teacher of. "Publish to parents" puts the report card (marks,
  result, comments, PDF) in the parent portal (`publishedExams()` in `server/routes/parent.js`). A child's report cards also show
  on their Report tab in Daily records (`StudentExams`, `GET /api/exams?studentId=` — head or class teacher; both use
  `studentExamCards()`). "Print the whole class" is one PDF for printing; parents only ever get their own child's. The PDF has no
  signature lines and shows the head's comment only when there is one. A Darul Uloom's teachers have no Fees page (the office takes fees).
  **A Darul Uloom's report IS its exam report card** — no monthly/termly summaries: the card adds the term's attendance
  (from the previous exam this year, or 1 September, to the exam — `termOf()`), a behaviour rating
  (`du_exam_comments.behavior`, Excellent/Good/Fair/Poor) and the comments; "Write it for me" (`?action=draft`, head or
  class teacher; demo = ready-made) drafts the class teacher's comment with AI from the term's marks, attendance,
  behaviour records, lessons covered and Qur'an notes. **One place to do it all** (the owner found two pages confusing): an
  exam opens to Class ▾ then three numbered steps — 1 Marks (papers), 2 Reports (each child: Ready = every paper marked +
  teacher's comment / Marks missing / Not written; tap → `CardModal`; Print the whole class), 3 Send to parents (Publish,
  head only). A Darul Uloom has **no Reports page** (menu hidden, `/reports` → `/exams`); the child's Report tab
  (`StudentExams`) only lists their reports to download; Settings says "Reports are made: With each exam"; the parent
  portal's "Reports" are the exam cards; page help has `DU_HEAD` overrides. Settings → Backup
  includes a Darul Uloom's own records (`server/duBackup.js`, `/api/course?action=backup|restore`: the Aalim years' places, books,
  periods, lessons, lessons recorded, exams, papers, marks, comments — restored last, new row numbers with the links carried
  across); a new Darul Uloom table goes there too.
  **Darul Uloom demo** (`?demo=darul-uloom`, `createDarulUloomDemo()` in `server/demo.js`): the starter years
  with kitaabs and asatidha, a Hifdh class, ~40 made-up students (and two who have left), Mon–Fri attendance, monthly fees,
  behaviour records, last month's reports, a full timetable (8 teachers, no clashes, short Friday) with three weeks of lessons recorded; a Monthly test (out of 50, pass 17) marked, commented and published, and a Half-yearly exam in December with no marks yet; logins: head, Maulana Yusuf (1st year), the Patel family.
  A demo link opened while signed in (to a real madrasah, or the other kind of demo) still offers the demo
  (`DemoScreen`, App.js); `/api/demo` starts a fresh demo when the kind asked for differs from the current one.
- **Parent logins** (role `parent`, one per family, `parent_students` links their
  children; `server/parents.js`). They never pass `requireAuth`, so every staff route is
  closed to them; they only use `server/routes/parent.js`, which returns their own
  children's attendance, fees, **finished** reports (saved summaries — never daily
  comments) and Qur'an progress, and takes absence reports (`absence_reports`, shown to
  staff on Attendance via `server/routes/absences.js`). The front end gives them one
  page (`src/pages/ParentPortal.js`). Each madrasah switches the portal on in Settings.
  Never add parent access to a staff route — add what parents need to `parent.js`.
  Creating a parent login (or setting a new password) shows a ready-made message to send —
  link, code, username, password, install steps — with Share / WhatsApp (to the parent's
  number) / Copy (`parentLoginMessage()` in `src/components/ParentLogin.js`); passwords are
  never stored readable, so it only appears right then.
- **Demo** ("Try the demo" on the sign-in screen of a device with no madrasah yet, or any
  link ending `?demo`): `server/demo.js` builds each visitor a private made-up madrasah
  (`madaaris.demo_until`, 24 hours; expired ones stop signing in and are deleted when the
  next demo starts — no timer) with head / teacher / parent logins; `/api/demo` signs in
  as one, and the green bar (`src/components/Demo.js`) switches between them. In a demo
  (`req.user.demo`): no password, login or logo changes, no Backup, and AI summaries are
  ready-made (no AI cost). Demos never appear on the Madaaris page. If a new table of
  school data is added, add it to `TABLES` in `server/demo.js` so demos are fully deleted.
- There's no migration runner: small new columns are added by the API itself on first
  use (`ALTER TABLE … ADD COLUMN IF NOT EXISTS`), with a matching `db/migrate-NNN-*.sql`
  for manual use and `db/schema.sql` updated. Changes that restructure existing data
  (like `db/migrate-011-madaaris.sql`) are **run by hand, deliberately**, after a Backup,
  on each database before the code needing them is deployed there — the API answers
  503 until `madaaris` exists (`api/router.js`).
- **Front page** (`src/pages/Landing.js`, `src/landing.css`, screenshots in `public/landing/`
  taken from the demo as "Madrasatul Huda"): shown at `/about`, and at `/` to anyone not signed
  in on a device with no madrasah code (no `?m=`, `?demo`, `?signin`) — staff and parents never
  see it. "Sign in" → `/?signin`. Never names Baytul 'Ilm; price is "free for 6 months, then
  £20 a month or £200 a year" for up to 200 children — more than 200: "message us" (also in the terms' Cost
  section and on the sign-up page; size bands for larger madaaris to come). When a feature changes a lot, retake its screenshot. The parent portal and
  PDF reports carry a small "Made with Suhuf" credit (`MadeWith` in `Legal.js`, `footerText` in
  `src/lib/reportPdf.js`) linking to `/about`. Visitor counts (Vercel Web Analytics, no cookies,
  `src/lib/analytics.js` `countVisit()`, live site only): the front page, /privacy, /terms, `/demo` and
  `/demo/<role>` — never pages inside a madrasah's app (auto-tracking is off on purpose).
  "Start free" opens the sign-up (`/?start`, below); "Message us on WhatsApp" goes to the owner's number
  (`WHATSAPP` in `Landing.js`, clicks counted as `/contact/whatsapp`); hello@suhuf.uk is the email.
- **Self sign-up** ("Start free" on the front page and the sign-in screen of a new device → `/?start`,
  `src/pages/Signup.js`, `server/routes/signup.js`): madrasah name, head's name, email (their login), phone,
  password, a sign-in code made from the name (changeable), and a tick for the terms (recorded, so no
  agree screen after). They're straight in as the head, free for 6 months. Guards: a hidden field only bots
  fill, max 3 sign-ups per address a day (`madaaris.signup_ip`, hashed). Creating a madrasah is shared with
  the Madaaris page (`server/newMadrasah.js`). The Madaaris page marks them "New · signed themselves up"
  with contact name/phone/WhatsApp/email. A new head's Dashboard shows "Getting started"
  (`src/components/GettingStarted.js`: teachers then classes → Settings (fees, days) → children → logins, with a
  choice of Teacher logins / Class logins (`/classes?tab=teachers|classes` opens that tab);
  ticks itself, can be hidden). A Darul Uloom gets its own order: Settings → teachers → classes (with "We don't
  have any") → Aalim years & books → timetable → students → logins. The students step offers "Try it with 6 made-up students"
  (notes start "Made-up student to try the app"; they don't tick the step; "Remove the made-up students" deletes them).
  **Darul Uloom screens are in plain English** (teachers, books, Head — not asatidha/kitaabs/Muhtamim) so
  non-Urdu-speaking Darul Ulooms follow them; subject names and "Aalim" stay; say "classical Islamic core texts", not the subcontinental "Dars-e-Nizami". Code names (`kitaab`) are unchanged.
- **Privacy policy & terms** (`src/lib/legal.js` — the words, `PROVIDER`, `TERMS_VERSION`;
  `src/components/Legal.js`): `/privacy` and `/terms` open for anyone; links on sign-in, Settings
  and the parent portal. A head (not the platform owner, not a demo) agrees once per
  `TERMS_VERSION` before using the app (`/api/session?action=accept-terms`, `madaaris.terms_*`;
  the same version string is in `server/routes/session.js` — change both). If what's stored or
  who handles it changes (a new table of personal data, a new outside service), update the
  privacy policy too.
- **A child's details** (`src/lib/studentDetails.js` — the one list; columns in `DETAILS`, `server/routes/students.js`,
  plain text '' when blank, added by the API, `db/migrate-031-student-details.sql`): gender (Boy/Girl); contacts shown as "Contact 1 / Contact 2" (stored as parent1_/parent2_); each one's relation
  (Mother/Father/…) and email, who to contact first, home address & postcode; an emergency contact (if not a parent);
  allergies, medical conditions, medication; can go home alone, who else may collect them; Darul Uloom only: boarder or day
  student, school year, previous madrasah/school, Hifdh completed. No GP, no photo consent (the owner's choice). Edited in the
  Students edit pop-up and the new-student form's "More details" step (`DetailInputs`, `ParentInputs`, `ChoiceBoxes` in
  `src/components/StudentDetails.js`); a health note shows in red on the child's profile, Attendance and Daily records
  (`HealthNote`) and a red heart by the name on lists (`HealthDot`). Teachers get health, emergency and collection, never the
  address, emails or previous school (`TEACHER_HIDDEN`). In the spreadsheet too. Later, parents fill these in themselves (online sign-up).
- **Online applications** (`/join/<code>`, `src/pages/Join.js`, `server/routes/join.js` — open to anyone with the link):
  parents send one or more children (name, DOB, gender, health; Darul Uloom: boarding, school year, previous school,
  Hifdh) plus the family's contacts, home, emergency contact and who collects; the madrasah's own message is at the top
  (`settings.join_message`, Settings → Online applications card with the link to copy / WhatsApp); a tick "details
  correct and I agree to the madrasah's rules" is required. Guards: hidden bot box, 6 children per address a day
  (`students.applied_ip`, hashed); a child already applied or at the madrasah (same name + date of birth + one of the same phone numbers, not left) isn't added twice — the parent is told; same name + date of birth but different phones is added with a "Possible duplicate" note (amber "Check: possible duplicate" tag on the Waiting list). Each child lands on the **Waiting list** (`applied_online`, `applied_new` — "Applied
  online · new" until the head opens it; Dashboard shows "N new applications"); the waiting list runs oldest first
  (`students.added_at`). No login is made — the head sets up a parent login later, as usual. **Parents update their own
  details** in the portal ("Your details" → Check & update, `POST /api/parent?action=details`, `PARENT_EDITABLE`):
  contacts, home, emergency contact, health, going home — contacts/home for all the family's children, health per child;
  never name, DOB, class or fee. The child's profile shows "Updated by parent" (`parent_updated_at`).
- **A child is never left without a class:** `students.class` is the class *name* (plain text), so deleting a class
  first moves its children (not those who have left) to another class or the Waiting list (`DELETE /api/classes?id=&moveTo=`
  — refused with 409 without one; the delete pop-up has a "Select class…" drop-down). Children whose class no longer exists
  (from before this) or just imported show at the top of Students in an amber "Not in a class" card (`NotInClass`: ticks,
  grouped by the sheet's class, one "Move to" drop-down).
- **Students ⇄ spreadsheets** (`src/lib/studentSheet.js`): Students → Import
  (`ImportStudents.js`, `/api/students?action=import`) takes rows pasted from Excel/Google Sheets,
  an .xlsx or a .csv, matches headings (mother/father/mum/dad columns are paired so each parent's name and number stay together), puts back phone numbers' lost leading 0 (`fixPhone`). **Import brings in
  children only** — never classes, and nobody is put into a class (the owner's choice: keep it simple): each lands in
  Students → "Not in a class" (or the Waiting list if the sheet says so), the sheet's class kept as a hint
  (`students.sheet_class`), and the head ticks children — or a whole sheet-class group — and moves them together; Settings → Backup → "Download students to spreadsheet"
  downloads every student, same columns, as a real .xlsx (dates as real dates, fee a number, the rest text; names and notes left-aligned, other columns centred — `SHEET_LEFT`). `src/lib/xlsx.js`
  writes/reads .xlsx with no library — don't go back to .csv downloads (Excel strips 0s and
  some apps show the byte-order mark as junk).
- **Classes & Teachers** (`src/pages/ClassesTeachers.js`, maktab and Darul Uloom alike): the figures as one row of small
  white boxes (Classes · Teachers · Students · No teacher — amber when any, and tapping it shows just those classes, each tagged "No teacher"; a Darul Uloom's Aalim years don't count, the head writes their reports), then one line per class / teacher (`.line-row`
  with `.ct-two`: name on top, underneath the class's course and students, or for a teacher their class (madrasah) / their books' subjects (Darul Uloom) — no initials circle — every line the same height; teachers keep the drag grip). Tapping a
  line opens underneath: boxes (teacher or report writer · students · Login; a teacher's Phone · Email boxes (tap to ring/write), then
  classes · Login), their classes and — in a Darul Uloom — each year's books they teach (from `du_subjects`), then
  Edit / Delete. One line open at a time. Reordering (here and on Students) glides cards to their new places (`ReorderableGrid`).
- Settings page: three cards (Your madrasah · Fees [+ Fee weeks or Fee months] · Classes & parents [+ Days off, Terms])
  plus Backup; **everything saves by itself** (no Save button) with a small "Saved" tick —
  keep it that way, and keep help text to one short line.
- School-specific details (name, Arabic name, currency, logo/app icon) come from
  Settings (one row per madrasah) — never hardcode a school's name, currency symbol or
  teacher. Before sign-in, `/api/settings?m=<code>` serves that madrasah's name/logo/
  manifest; with no code, Suhuf's own (`isNeutralBranding()`). Use
  `money()` / `currencySymbol()` from `src/lib/branding.js` for amounts.
- Fee frequency (Settings): **weekly** (the original system — weeks grouped into school
  months from each month's first Monday), **monthly** (calendar months, 1st to end) or
  **termly** (the madrasah's own term dates, `terms` table). A fee record's `period` is
  'week'/'month'/'term' and `week_starting` holds the period's start date. Use
  `src/lib/feePeriods.js` (`feeFrequency()`, `currentFeePeriod()`, `feeUnit()`/`feePer()`)
  rather than assuming weeks. Weekly keeps the original Fees page; monthly/termly use
  `src/components/PeriodFees.js`.
- **Automatic fees** (Settings → "Add fees automatically", `settings.fee_auto`, on by
  default): monthly/termly — the current month's/term's fees are added for every active
  student when it starts (`/api/fees?action=auto`, run by `ensureAutoFees()` before fees
  are read); a period removed on purpose is remembered in `fee_skips` (class or student)
  so it isn't re-added. Monthly: **Settings → Fee months** (`FeeMonthsCard`, `fee_months_off`)
  switches whole months off (unpaid fees removed). With automatic fees the monthly/termly Fees
  page has no Add/Remove buttons — the head taps a child's grey box to add that month/term for
  them (owed or paid) or for everyone in the class missing it (`?action=add-period`) — and the
  weekly page has no Delete a month (Fee weeks does that). Weekly — **Settings → Fee weeks** (`FeeWeeksCard`, head only):
  every week is on unless switched off (`fee_weeks_off`); on-weeks are charged to every
  child when their school month starts — a whole month can be paid ahead (`?action=auto`, only weeks since
  `settings.fee_auto_since`, so older history is never touched); switching a week off
  removes its unpaid fees (payments stay). Removing a week for a class or child on the
  Fees page is remembered in `fee_skips`. The head can add one week for one child (`?action=add-week`,
  owed or paid — e.g. paying ahead) on any week switched on in Fee weeks; the same pop-up can put the week back as owed for everyone in that class who's missing it (`wholeClass`, lifts the class's `fee_skips`). The server takes "today" as the UK date (`ukToday()`). Joining/leaving: only active children billed,
  from their enrol date (whole period — the head edits the amount if needed), never
  after their leave date. Teachers only tick/untick fees that exist.
  The current **academic year** adds itself from 1 September (`/api/academic-years` GET).
- **School days** (Settings, `settings.school_days`, JS day numbers, Mon–Thu by default):
  `getWeekDates()` / `isSchoolDay()` in `src/lib/store.js` — never assume Mon–Thu.
  **Days off & extra days** (Settings card `DaysOffCard`, `days_off` with `kind` 'off'/'extra',
  `/api/days-off` — head edits, teachers read; both kinds can be added/removed as a From–To range —
  closed: every day; open: only days that aren't usual school days — one row per date, shown grouped): closed dates like Eid — Attendance shows "Closed today — <name>"
  and greys the day; extra dates (a Ramadhaan Saturday) count as school days in `isSchoolDay()` /
  `getWeekDates()` once `getSpecialDays()` has loaded them.
- **Attendance → a child's month** (`Attendance.js`, `.att-week` / `.att-day` in `index.css`): totals
  on top, then one card per week (two across from 900px wide) with a line per day — coloured stripe,
  date, status ("Late · 17:22"), and P / L / A buttons (tap the lit one again to clear). Any number of
  days per week (usual days + extra days); days off are a faded line with their name. On phones it
  opens scrolled to this week.
- **Teachers' attendance** (head only; Attendance → Children | Teachers tabs, remembered per device; `src/components/TeacherAttendance.js`,
  `server/routes/teacher-attendance.js`, table `teacher_attendance`): a day's register — a line per teacher with P / L / A
  (Late stamps the time when it's today), ‹ › moves a school day at a time (never past today; closed days say so) — then
  "This month": each teacher's P · L · A counts. In both demos, in Backup (`teacherAttendance`) and demo `TABLES`.
- **A child's fees** (Fees page → tap a child; `src/components/FeeRows.js`, `.fee-boxed` in `index.css`): the
  attendance look — totals on top (Paid · Owed · Collected), then each week (a card per school month, two
  across from 900px; later months behind "Show the rest of the year") or each month/term in its own box,
  tinted green (paid) / red (owed). **Show, don't store:** periods still to come that will be charged are
  shown as "Not due yet" from `?action=plan` (weeks/months off + `fee_skips`) without being saved; "Mark
  paid" on one records it paid (`add-week` / `add-period`) — teachers may do this too, but only for a
  future period not removed for that child/class. **Not due yet is never owed:** an unpaid fee whose
  period hasn't started (`isDue()` / `countedFees()` in `feePeriods.js`) is left out of every total —
  Dashboard, Stats, Students, reports (`feesForReport`) and the parent portal (which doesn't show them).
  Head only: ✏️ amount, bin = take it off that child (`DELETE ?id=`, or `?action=skip` if not charged yet;
  "Put back" undoes). Taking a week/month off for everyone is only in Settings (Fee weeks / Fee months).
- Report period (Settings): **monthly** (one report per school month — the original
  system), **termly** (one per term) or **yearly** (one per academic year, first Monday of
  September to the next). A saved report summary (`ai_summaries.month`)
  is keyed `'YYYY-MM'`, `'term:<terms.id>'` or `'year:<26-27>'`; use `src/lib/reportPeriods.js`
  (`currentReportPeriod()`, `periodForKey()`, `feesForReport()`) for ranges, labels and
  which fees belong on a report. The Terms section in Settings shows when fees or
  reports are termly.
- Qur'an progress: a class's `quran_type` (hifz / nazira / qaida, or **mixed**) and a
  student's own level (`quran_students.quran_type`, which overrides it — children move
  up; in a mixed class it's chosen per student) decide what Daily records shows
  (`effectiveQuranType()`, `src/components/QuranCards.js`). **Names on screen** (the owner's
  wording — use them everywhere, never the stored keys): levels hifz/nazira/qaida show as
  **Hifdh / Naazhirah / Qaa'idah**; kinds sabaq/sabqi/manzil/reading/lesson show as **Hifdh
  Jadeed / Muraaja'ah Qareebah / Muraaja'ah / Naazhirah / Qaa'idah** (`KIND_LABELS`,
  `QURAN_TYPES` in `src/lib/quran.js`). Spell it **Qur'aan** on screen (the owner's spelling; book titles like Tarjamat-ul-Qur'an keep theirs). Hifdh Jadeed is never recorded in quarters; Qaa'idah offers "Same as last time" (the child's last lesson text);
  Muraaja'ah Qareebah's "To" offers "Until new lesson" (the ayah before the latest Hifdh
  Jadeed). Hifz is recorded by **surah and ayah**
  (sabaq / sabqi / manzil, graded good / okay / weak / repeat, with **lesson notes** — the
  teacher's words, the AI report's main source, never shown to parents) — or, per entry, in **juz
  quarters** (`unit = 'quarter'`; the from/to positions are still stored as the
  quarters' first and last ayahs, so all progress maths is the same).
  `src/lib/quran.js` holds the surah, juz and juz-quarter data and the progress maths
  (an ayah's position 0–6235). The AI report
  summary is given exact Qur'an figures and the lesson notes (`quranFactsForReport`), then the
  behaviour records.
- Daily records (a student's page) is in **tabs** — Qur'an (Input progress, Progress) |
  Behaviour (the day editor — comment, positives, concerns; Behaviour records — academic-year boxes → month boxes → a card of
  day boxes → that day's record in the same card; This month) | Report (owners: summary, previous
  summaries) — each one centred column (`.student-page`), last tab remembered per device.
  Qur'an entries are recorded and changed in pop-ups (`NewEntryModal` / `EditEntryModal`).
  The owner disliked squashed side-by-side cards: give things room rather than more columns.
- Reports page: `ClassBar` (same chooser as Attendance/Fees/Daily records, with the "N of M
  ready" count per class in its pop-up, and a Year box once there's more than one academic
  year) → one card per child with boxes Ready/Not written · PDF · History; "Not written"
  opens that child's Report tab (`/records?student=<id>`); history and the PDF preview are
  in a pop-up (year boxes → month/term boxes → preview).
- History anywhere (Records, Previous summaries, a left child's Previous reports) uses
  `src/components/HistoryBoxes.js`: year boxes oldest → newest (arrow on the left, text
  centred) → month/term boxes → the chosen one shown in the same card.
- Dates are plain `YYYY-MM-DD` strings; "school month" follows the first-Monday rule
  in `src/lib/store.js`.
- **Big madaaris stay quick** (tested with 800 children and a full year: every page under 3 s on a
  throttled phone): `getCurrentSchoolMonth()` is remembered per date (it's called for every fee); Stats
  counts a year's attendance in one pass (`attendanceStatsByMonth`); attendance and fees have
  `(madrasah_id, year)` indexes. Don't loop over every record once per month/class/student — group in one pass.
- **Install as an app:** on phones not running the installed app, a slim "Get the app on your
  home screen" bar (`src/components/InstallBanner.js`, staff and parents; hidden 30 days on ✕).
  Android/Chrome installs straight away; iPhone shows the Share → Add to Home Screen steps
  (`InstallSteps.js`). The manifest's `start_url` carries `?m=<code>`, so the installed app
  knows its madrasah. In the installed app (`isStandalone()`), back closes an open card first
  (`useBackToClose`), page switches replace rather than add history (`appNavigate()`), back
  with nothing open goes to the home page (Dashboard; Attendance for teachers); on the home page back shows
  "Close the app?" (`src/components/BackToExit.js`) — a second back closes it.
- **Page instructions:** every page has a "Page instructions" button (top bar on computers,
  top of the page on phones; the parent portal too) opening a few plain numbered steps for
  that person's role — `src/lib/pageHelp.js`, opened by itself the first time a page is
  visited on a device. **When a page changes, update its steps there.**
- `public/sw.js` caches only content-hashed `/static/` files and fonts. Never cache
  `/api/` or anything that can change under the same URL (that's how a stale app icon
  once got stuck on devices); bump the cache name if caching rules change. It's registered with
  `updateViaCache: 'none'` and re-checked whenever the app comes back to the front (`src/index.js`),
  and its `push` handler must always show a notification (else Chrome shows an empty one).
- Check changes with `CI=true npm run build` (warnings fail the build).
  `scripts/dev-api-server.js` runs the API locally (through the same router) against
  a Postgres in `.env.local`.
