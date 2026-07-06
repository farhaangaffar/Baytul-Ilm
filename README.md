# Al-Noor Madrasah Management System

A full student management system for madrasahs, deployable for free on Vercel.

## Features

- **Dashboard** — Live overview: students, attendance, fees, today's classes
- **Students** — Full profiles, Juz progress, grades, search & filter
- **Enrollment form** — 3-step wizard to enroll new students
- **Timetable** — Weekly class schedule with colour-coded subjects
- **Attendance** — Click-to-mark register (Present / Absent / Excused) for 7-day view
- **Fees** — Track paid / pending / overdue fees, mark payments
- **Courses** — Course catalogue with teachers and schedules
- **Progress Reports** — Preview and download PDF reports per student (or all at once)

---

## Deploy to Vercel (free) — step by step

### Option A — GitHub + Vercel (recommended, easiest updates)

1. **Create a GitHub account** at https://github.com if you don't have one
2. **Create a new repository** — click "+ New" → name it `madrasah-system` → Create
3. **Upload this project folder** — drag the entire folder into the GitHub repo page, commit
4. **Go to** https://vercel.com and sign up with your GitHub account (free)
5. Click **"Add New Project"** → Import your `madrasah-system` repo
6. Leave all settings as default — Vercel auto-detects Create React App
7. Click **Deploy** — your site will be live in ~2 minutes at `your-project.vercel.app`

### Option B — Vercel CLI (fastest for developers)

```bash
# 1. Install Node.js from https://nodejs.org (if not installed)

# 2. Install Vercel CLI
npm install -g vercel

# 3. Inside this project folder, install dependencies
npm install

# 4. Deploy
vercel

# Follow the prompts — choose your account, confirm settings
# Your URL will appear at the end, e.g. https://madrasah-system.vercel.app
```

### Option C — Netlify (alternative free host)

1. Run `npm run build` inside the project folder
2. Go to https://netlify.com → drag the `build/` folder onto the deploy zone
3. Your site is live instantly

---

## Running locally (for testing)

```bash
npm install
npm start
# Opens at http://localhost:3000
```

---

## Data storage

All data is stored in the browser's **localStorage** — no server or database needed.
- Data persists between sessions on the same device/browser
- To share data across devices, replace `src/lib/store.js` with a Supabase backend

### Upgrading to Supabase (optional, free tier)

1. Create a free project at https://supabase.com
2. Create tables: `students`, `attendance`, `fees`
3. Replace the localStorage functions in `src/lib/store.js` with Supabase client calls
4. Add your Supabase URL and anon key to a `.env` file

---

## Customisation

| What to change | Where |
|---|---|
| Madrasah name | `src/components/Layout.js` — sidebar logo |
| Colour scheme | `src/index.css` — `:root` CSS variables |
| Classes list | `src/lib/store.js` — `CLASSES` array |
| Subjects / timetable | `src/pages/Timetable.js` — `schedule` array |
| Seed student data | `src/lib/store.js` — `seed.students` array |
| Report header/footer | `src/lib/reportPDF.js` |

---

## Tech stack (all free)

- **React 18** — UI framework
- **React Router 6** — page navigation
- **jsPDF + jsPDF-autotable** — PDF report generation
- **Lucide React** — icons
- **Vercel / Netlify** — free hosting
- **localStorage** — zero-cost data persistence

---

*Built for Al-Noor Madrasah · Academic year 1446 AH*
