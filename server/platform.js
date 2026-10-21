const { query } = require('./db');

// Tables for running Suhuf itself (not a madrasah's school data):
//  - madrasah_payments: what each madrasah has paid us (Madaaris page → Payments)
//  - push_subscriptions: phones that get a notification when a madrasah signs up
//  - platform_kv: small settings, e.g. the keys phone notifications are signed with
//  - platform_counts: how many demos were started and madaaris signed up, per day (Madaaris page → Demos & sign-ups;
//    kept for good — Vercel's visitor counts only go back 31 days, and each demo deletes itself after a day)
// madrasah_payments and push_subscriptions carry a madrasah_id, so they're in TABLES
// (server/demo.js) and go when a madrasah is deleted.
let ready = false;
async function ensurePlatformTables() {
  if (ready) return;
  await query(`CREATE TABLE IF NOT EXISTS madrasah_payments (
    id          BIGSERIAL PRIMARY KEY,
    madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
    paid_on     DATE NOT NULL,
    amount      NUMERIC(8,2) NOT NULL,
    months      INTEGER NOT NULL,
    note        TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMP NOT NULL DEFAULT now()
  )`);
  await query(`CREATE TABLE IF NOT EXISTS push_subscriptions (
    id          BIGSERIAL PRIMARY KEY,
    madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
    user_id     INTEGER NOT NULL,
    endpoint    TEXT NOT NULL UNIQUE,
    keys        JSONB NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT now()
  )`);
  await query(`CREATE TABLE IF NOT EXISTS platform_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  await query(`CREATE TABLE IF NOT EXISTS platform_counts (
    day  DATE NOT NULL,
    what TEXT NOT NULL,
    n    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, what)
  )`);
  // The first time: sign-ups from before counting began, from the madaaris that signed themselves up.
  const { rowCount } = await query(`INSERT INTO platform_kv (key, value) VALUES ('counts_seeded', '1') ON CONFLICT DO NOTHING`);
  if (rowCount) {
    await query(`INSERT INTO platform_counts (day, what, n)
      SELECT created_at::date, CASE WHEN kind = 'darul_uloom' THEN 'signup_du' ELSE 'signup' END, count(*)
      FROM madaaris WHERE self_signup AND demo_until IS NULL GROUP BY 1, 2
      ON CONFLICT (day, what) DO UPDATE SET n = platform_counts.n + EXCLUDED.n`);
  }
  ready = true;
}

// Adds one to today's count of `what` ('demo' / 'demo_du' / 'signup' / 'signup_du'). Never stops what it counts.
async function countEvent(what) {
  try {
    await ensurePlatformTables();
    await query(`INSERT INTO platform_counts (day, what, n) VALUES ((now() AT TIME ZONE 'Europe/London')::date, $1, 1)
                 ON CONFLICT (day, what) DO UPDATE SET n = platform_counts.n + 1`, [what]);
  } catch (err) { console.error('countEvent', err.message); }
}

module.exports = { ensurePlatformTables, countEvent };
