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
- Explain things in plain language — the owner isn't a developer.

## Project conventions

- React (Create React App) front end in `src/`, Postgres, and a Vercel serverless API
  that is **one function**: `vercel.json` rewrites every `/api/<name>` to
  `api/router.js`, which dispatches to `server/routes/<name>.js` (shared helpers in
  `server/db.js`, `server/auth.js`). To add an endpoint, add a file in
  `server/routes/` and a static `require` line in `api/router.js` — never add files
  to `api/` (each file there becomes a separate function; the free Hobby plan caps
  them at 12). The app stays on the Hobby plan until the first paying madrasah.
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
  add / rename / switch off a madrasah, reset its head's password; plus an AI credit card, a database-space bar (`?action=usage`, Neon free = 0.5 GB) —
  this month's AI requests with a rough cost and a link to Anthropic's billing page — and the
  demo link to copy or share). Each madrasah is free for 6 months (`madaaris.free_until`, set
  when added, editable there; older rows count 6 months from `created_at`) — payment is by
  standing order, outside the app. The dashboard has no Ask AI any more. `requireAuth(handler)`
  is owner-only by default; pass `{ teacher: true }` only for routes teachers use, and
  scope with `accessScope(req)` / `teacherScope(req)`. Teachers get Attendance, Daily
  records and Fees for their own classes, and on Fees may only tick an added fee paid or
  untick it — never start/add/remove a week or month, or change an amount.
  `ADMIN_PASSWORD` is only the first-time-setup / platform-owner-recovery key — it never
  signs anyone in once an owner account exists.
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
  £20 a month or £200 a year" (one price per madrasah; also in the terms' Cost section). When a feature changes a lot, retake its screenshot. The parent portal and
  PDF reports carry a small "Made with Suhuf" credit (`MadeWith` in `Legal.js`, `footerText` in
  `src/lib/reportPdf.js`) linking to `/about`. Visitor counts (Vercel Web Analytics, no cookies,
  `src/lib/analytics.js` `countVisit()`, live site only): the front page, /privacy, /terms, `/demo` and
  `/demo/<role>` — never pages inside a madrasah's app (auto-tracking is off on purpose).
  "Get started free" opens WhatsApp to the owner's number (`WHATSAPP` in `Landing.js`, clicks counted
  as `/contact/whatsapp`); hello@suhuf.uk is the email.
- **Privacy policy & terms** (`src/lib/legal.js` — the words, `PROVIDER`, `TERMS_VERSION`;
  `src/components/Legal.js`): `/privacy` and `/terms` open for anyone; links on sign-in, Settings
  and the parent portal. A head (not the platform owner, not a demo) agrees once per
  `TERMS_VERSION` before using the app (`/api/session?action=accept-terms`, `madaaris.terms_*`;
  the same version string is in `server/routes/session.js` — change both). If what's stored or
  who handles it changes (a new table of personal data, a new outside service), update the
  privacy policy too.
- **Students ⇄ spreadsheets** (`src/lib/studentSheet.js`): Students → Import
  (`ImportStudents.js`, `/api/students?action=import`) takes rows pasted from Excel/Google Sheets,
  an .xlsx or a .csv, matches headings (mother/father/mum/dad columns are paired so each parent's name and number stay together), puts back phone numbers' lost leading 0 (`fixPhone`), and
  can add the sheet's new class names as classes; Settings → Backup → "Download students to spreadsheet"
  downloads every student, same columns, as a real .xlsx (dates as real dates, fee a number, the rest text; names and notes left-aligned, other columns centred — `SHEET_LEFT`). `src/lib/xlsx.js`
  writes/reads .xlsx with no library — don't go back to .csv downloads (Excel strips 0s and
  some apps show the byte-order mark as junk).
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
  system) or **termly** (one per term). A saved report summary (`ai_summaries.month`)
  is keyed `'YYYY-MM'` or `'term:<terms.id>'`; use `src/lib/reportPeriods.js`
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
  `QURAN_TYPES` in `src/lib/quran.js`). Hifdh Jadeed is never recorded in quarters; Qaa'idah offers "Same as last time" (the child's last lesson text);
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
- Reports page: class boxes ("8 of 12 ready" for the current month/term — any number of
  classes) → one card per child with boxes Ready/Not written · PDF · History; "Not written"
  opens that child's Report tab (`/records?student=<id>`); history and the PDF preview are
  in a pop-up (year boxes → month/term boxes → preview).
- History anywhere (Records, Previous summaries, a left child's Previous reports) uses
  `src/components/HistoryBoxes.js`: year boxes oldest → newest (arrow on the left, text
  centred) → month/term boxes → the chosen one shown in the same card.
- Dates are plain `YYYY-MM-DD` strings; "school month" follows the first-Monday rule
  in `src/lib/store.js`.
- **Install as an app:** on phones not running the installed app, a slim "Get the app on your
  home screen" bar (`src/components/InstallBanner.js`, staff and parents; hidden 30 days on ✕).
  Android/Chrome installs straight away; iPhone shows the Share → Add to Home Screen steps
  (`InstallSteps.js`). The manifest's `start_url` carries `?m=<code>`, so the installed app
  knows its madrasah. In the installed app (`isStandalone()`), back closes an open card first
  (`useBackToClose`), page switches replace rather than add history (`appNavigate()`), and backing out
  shows "Close the app?" (`src/components/BackToExit.js`) — a second back closes it.
- **Page instructions:** every page has a "Page instructions" button (top bar on computers,
  top of the page on phones; the parent portal too) opening a few plain numbered steps for
  that person's role — `src/lib/pageHelp.js`, opened by itself the first time a page is
  visited on a device. **When a page changes, update its steps there.**
- `public/sw.js` caches only content-hashed `/static/` files and fonts. Never cache
  `/api/` or anything that can change under the same URL (that's how a stale app icon
  once got stuck on devices); bump the cache name if caching rules change.
- Check changes with `CI=true npm run build` (warnings fail the build).
  `scripts/dev-api-server.js` runs the API locally (through the same router) against
  a Postgres in `.env.local`.
