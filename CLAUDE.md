# Notes for Claude

## Working agreement with the owner

This app is live — Baytul 'Ilm Madrasah runs on it every day — and is being turned
into a product other madaaris can use. Baytul 'Ilm is the first customer of the same
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
  add / rename / switch off a madrasah, reset its head's password). `requireAuth(handler)`
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
- Settings page: three cards (Your madrasah · Fees [+ Fee weeks] · Classes & parents [+ Terms])
  plus Backup; **everything saves by itself** (no Save button) with a small "Saved" tick —
  keep it that way, and keep help text to one short line.
- School-specific details (name, Arabic name, currency, logo/app icon) come from
  Settings (one row per madrasah) — never hardcode a school's name, currency symbol or
  teacher. Before sign-in, `/api/settings?m=<code>` serves that madrasah's name/logo/
  manifest; with no code, a neutral one. Use
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
  so it isn't re-added. Weekly — **Settings → Fee weeks** (`FeeWeeksCard`, head only):
  every week is on unless switched off (`fee_weeks_off`); on-weeks are charged to every
  child when their school month starts — a whole month can be paid ahead (`?action=auto`, only weeks since
  `settings.fee_auto_since`, so older history is never touched); switching a week off
  removes its unpaid fees (payments stay). Removing a week for a class or child on the
  Fees page is remembered in `fee_skips`. The head can add one week for one child (`?action=add-week`,
  owed or paid — e.g. paying ahead) on any week switched on in Fee weeks. Joining/leaving: only active children billed,
  from their enrol date (whole period — the head edits the amount if needed), never
  after their leave date. Teachers only tick/untick fees that exist.
  The current **academic year** adds itself from 1 September (`/api/academic-years` GET).
- **School days** (Settings, `settings.school_days`, JS day numbers, Mon–Thu by default):
  `getWeekDates()` / `isSchoolDay()` in `src/lib/store.js` — never assume Mon–Thu.
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
  `QURAN_TYPES` in `src/lib/quran.js`). Hifdh Jadeed is never recorded in quarters;
  Muraaja'ah Qareebah's "To" offers "Until new lesson" (the ayah before the latest Hifdh
  Jadeed). Hifz is recorded by **surah and ayah**
  (sabaq / sabqi / manzil, graded good / weak / repeat) — or, per entry, in **juz
  quarters** (`unit = 'quarter'`; the from/to positions are still stored as the
  quarters' first and last ayahs, so all progress maths is the same).
  `src/lib/quran.js` holds the surah, juz and juz-quarter data and the progress maths
  (an ayah's position 0–6235). The AI report
  summary is given exact Qur'an figures (`quranFactsForReport`).
- Daily records (a student's page) is in **tabs** — Qur'an (Input progress, Progress) |
  Daily record (the day editor; Records — academic-year boxes → month boxes → a card of
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
- `public/sw.js` caches only content-hashed `/static/` files and fonts. Never cache
  `/api/` or anything that can change under the same URL (that's how a stale app icon
  once got stuck on devices); bump the cache name if caching rules change.
- Check changes with `CI=true npm run build` (warnings fail the build).
  `scripts/dev-api-server.js` runs the API locally (through the same router) against
  a Postgres in `.env.local`.
