-- A Darul Uloom / Aalimiyyah course with no boarders (a local course) can switch Boarding off in Settings.
-- The API adds this itself on first use (server/routes/settings.js).
ALTER TABLE settings ADD COLUMN IF NOT EXISTS boarding_on BOOLEAN NOT NULL DEFAULT true;
