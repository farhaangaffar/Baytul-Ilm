-- Days the madrasah is closed (Settings → Days off). The API creates this table itself on
-- first use; this file is the same for manual setups. Adds a table only.
CREATE TABLE IF NOT EXISTS days_off (
  madrasah_id  INTEGER NOT NULL REFERENCES madaaris(id),
  date         DATE NOT NULL,
  name         TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (madrasah_id, date)
);
