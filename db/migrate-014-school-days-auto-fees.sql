-- School days and automatic fees. New columns and one new table only — nothing
-- existing changes. The API adds these itself on first use (server/routes/settings.js,
-- server/routes/fees.js); this file is for manual setups. Needs migrate-011 first.

-- Days classes meet, as JS day numbers (0 Sunday … 6 Saturday). Mon–Thu to begin with.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS school_days INTEGER[] NOT NULL DEFAULT '{1,2,3,4}';
-- Monthly/termly fees are added by themselves when a period starts; a weekly week starts
-- for a class the first time someone in it is marked paid. Off = add fees by hand.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS fee_auto BOOLEAN NOT NULL DEFAULT true;

-- Fee periods removed on purpose (e.g. an August with no classes) — for a whole class
-- (class set) or one student (student_id set) — so automatic fees never put them back.
CREATE TABLE IF NOT EXISTS fee_skips (
  madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
  period      TEXT NOT NULL,
  start_date  DATE NOT NULL,
  class       TEXT NOT NULL DEFAULT '',
  student_id  TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (madrasah_id, period, start_date, class, student_id)
);
