-- Terms of use: when a madrasah's head agreed to them, and which version. The API adds
-- these columns itself on first use; this file is for manual use.
ALTER TABLE madaaris ADD COLUMN IF NOT EXISTS terms_version TEXT;
ALTER TABLE madaaris ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP;
ALTER TABLE madaaris ADD COLUMN IF NOT EXISTS terms_accepted_by TEXT;
