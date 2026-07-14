-- Adds manual card-ordering support. Run once against an existing database
-- that was created from schema.sql before this column existed.
ALTER TABLE students ADD COLUMN IF NOT EXISTS sort_order INTEGER;
