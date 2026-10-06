-- Extra days: dates a madrasah opens outside its usual school days (e.g. a Saturday in
-- Ramadhaan). The API adds this column itself on first use; this file is for manual use.
ALTER TABLE days_off ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'off';
