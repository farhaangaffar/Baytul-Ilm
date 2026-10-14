-- Who took each attendance mark and who last wrote a day's behaviour record (in a Darul Uloom
-- several teachers share an Aalim year). The API adds these by itself on first use; this file is
-- for running by hand.
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS marked_by TEXT;
ALTER TABLE daily_records ADD COLUMN IF NOT EXISTS updated_by TEXT;
