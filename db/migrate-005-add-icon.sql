-- Adds the app icon (a square version of the uploaded logo, built in the browser)
-- used for the home-screen/installed app and the browser tab. Not required for
-- production — api/settings.js adds it itself on first use, same self-healing
-- pattern as migrate-004. Kept for anyone who applies schema changes manually.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS icon TEXT;
