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
- There's no migration runner: new columns are added by the API itself on first use
  (`ALTER TABLE … ADD COLUMN IF NOT EXISTS`), with a matching `db/migrate-NNN-*.sql`
  for manual use and `db/schema.sql` updated.
- School-specific details (name, Arabic name, currency, logo/app icon) come from
  Settings — never hardcode a school's name, currency symbol or teacher. Use
  `money()` / `currencySymbol()` from `src/lib/branding.js` for amounts.
- Dates are plain `YYYY-MM-DD` strings; "school month" follows the first-Monday rule
  in `src/lib/store.js`.
- `public/sw.js` caches only content-hashed `/static/` files and fonts. Never cache
  `/api/` or anything that can change under the same URL (that's how a stale app icon
  once got stuck on devices); bump the cache name if caching rules change.
- Check changes with `CI=true npm run build` (warnings fail the build).
  `scripts/dev-api-server.js` runs the API locally (through the same router) against
  a Postgres in `.env.local`.
