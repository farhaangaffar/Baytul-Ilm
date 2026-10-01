-- The time a student was marked Late ('HH:MM'), stamped automatically on the day.
-- The API adds this itself on first use; this file is for manual setups.
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS late_time TEXT;
