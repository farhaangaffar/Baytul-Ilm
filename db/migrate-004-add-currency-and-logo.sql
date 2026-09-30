-- Adds a per-school currency symbol (shown on fees, stats and PDF reports) and
-- an uploaded logo (printed on PDF reports). Run once against an existing
-- database created from schema.sql before these columns existed. Not required
-- for production — api/settings.js adds them itself on first use, same
-- self-healing pattern as migrate-003. Kept here for anyone who prefers to apply
-- schema changes manually up front.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS currency_symbol TEXT NOT NULL DEFAULT '£';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS logo TEXT;
