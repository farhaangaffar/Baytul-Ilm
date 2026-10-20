-- A Darul Uloom's fees: a yearly fee in instalments (the Fees page, server/routes/du-fees.js). The API makes these
-- itself on first use; this file is for running by hand.
CREATE TABLE IF NOT EXISTS du_fee_setup (
  madrasah_id  INTEGER NOT NULL REFERENCES madaaris(id),
  year         TEXT NOT NULL,                       -- '26-27'
  boarder_fee  NUMERIC(10,2) NOT NULL DEFAULT 0,    -- a year
  day_fee      NUMERIC(10,2) NOT NULL DEFAULT 0,    -- a year
  plans        JSONB NOT NULL DEFAULT '[]',         -- ways to pay: [{ id, name, dues: ['YYYY-MM-DD', …] }]
  default_plan TEXT NOT NULL DEFAULT '',
  sibling_on   BOOLEAN NOT NULL DEFAULT false,
  sibling_2    NUMERIC(5,2) NOT NULL DEFAULT 10,    -- % off the second child
  sibling_3    NUMERIC(5,2) NOT NULL DEFAULT 15,    -- % off the third and more
  PRIMARY KEY (madrasah_id, year)
);
CREATE TABLE IF NOT EXISTS du_fee_accounts (       -- a child's own fee / way to pay / paid before using the app
  madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
  year        TEXT NOT NULL,
  student_id  TEXT NOT NULL,
  plan_id     TEXT NOT NULL DEFAULT '',
  own_amount  NUMERIC(10,2),                        -- a bursary or agreed fee (NULL = the price)
  no_discount BOOLEAN NOT NULL DEFAULT false,
  paid_before NUMERIC(10,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (madrasah_id, year, student_id)
);
CREATE TABLE IF NOT EXISTS du_fee_charges (        -- extras: books, a trip…
  id          BIGSERIAL PRIMARY KEY,
  madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
  year        TEXT NOT NULL,
  student_id  TEXT NOT NULL,
  label       TEXT NOT NULL,
  amount      NUMERIC(10,2) NOT NULL,
  due         DATE NOT NULL,
  added_by    TEXT NOT NULL DEFAULT '',
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS du_fee_payments (
  id          BIGSERIAL PRIMARY KEY,
  madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
  year        TEXT NOT NULL,
  student_id  TEXT NOT NULL,
  amount      NUMERIC(10,2) NOT NULL,
  paid_on     DATE NOT NULL,
  method      TEXT NOT NULL DEFAULT '',
  note        TEXT NOT NULL DEFAULT '',
  receipt_no  INTEGER NOT NULL,                     -- runs on per madrasah
  recorded_by TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_du_fee_charges ON du_fee_charges (madrasah_id, year);
CREATE INDEX IF NOT EXISTS idx_du_fee_payments ON du_fee_payments (madrasah_id, year);
