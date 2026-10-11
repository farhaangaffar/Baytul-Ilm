const { query } = require('./db');

// Tables for running Suhuf itself (not a madrasah's school data):
//  - madrasah_payments: what each madrasah has paid us (Madaaris page → Payments)
//  - push_subscriptions: phones that get a notification when a madrasah signs up
//  - platform_kv: small settings, e.g. the keys phone notifications are signed with
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
  ready = true;
}

module.exports = { ensurePlatformTables };
