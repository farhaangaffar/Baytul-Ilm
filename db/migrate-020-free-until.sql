-- Free trial: each madrasah is free until this date (6 months from joining by default;
-- the platform owner can change it on the Madaaris page). The API adds this column itself
-- on first use; this file is for manual use.
ALTER TABLE madaaris ADD COLUMN IF NOT EXISTS free_until DATE;
