-- Adds manual card ordering for teachers (Classes & Teachers page). Not required
-- for production — server/routes/teachers.js adds it itself on first use, same
-- self-healing pattern as the other migrations. Kept for manual setups.
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS sort_order INTEGER;
