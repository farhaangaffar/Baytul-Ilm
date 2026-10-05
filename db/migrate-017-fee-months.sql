-- Monthly fees: months switched off in Settings → Fee months. The API creates this table
-- itself on first use; this file is the same for manual setups. Adds a table only.
CREATE TABLE IF NOT EXISTS fee_months_off (
  madrasah_id  INTEGER NOT NULL REFERENCES madaaris(id),
  year         TEXT NOT NULL,
  month_start  DATE NOT NULL,
  PRIMARY KEY (madrasah_id, month_start)
);
