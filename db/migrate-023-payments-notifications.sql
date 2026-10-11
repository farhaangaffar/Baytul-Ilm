-- Madrasah payments (Madaaris page → Payments) and sign-up notifications (server/notify.js).
-- The API adds these itself on first use (server/routes/madaaris.js, server/platform.js);
-- this file is for manual use. Nothing existing is changed.
ALTER TABLE madaaris ADD COLUMN IF NOT EXISTS billing_plan TEXT NOT NULL DEFAULT 'monthly';
ALTER TABLE madaaris ADD COLUMN IF NOT EXISTS billing_amount NUMERIC(8,2);

CREATE TABLE IF NOT EXISTS madrasah_payments (
  id          BIGSERIAL PRIMARY KEY,
  madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
  paid_on     DATE NOT NULL,
  amount      NUMERIC(8,2) NOT NULL,
  months      INTEGER NOT NULL,
  note        TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMP NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          BIGSERIAL PRIMARY KEY,
  madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
  user_id     INTEGER NOT NULL,
  endpoint    TEXT NOT NULL UNIQUE,
  keys        JSONB NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS platform_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
