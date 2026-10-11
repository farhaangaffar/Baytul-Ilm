-- Madaaris that sign themselves up ("Start free" on the front page, server/routes/signup.js):
-- who to contact, and a hashed address used only to limit how many one place can create.
-- The API adds these columns itself on first use (server/newMadrasah.js); this file is for manual use.
ALTER TABLE madaaris ADD COLUMN IF NOT EXISTS self_signup BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE madaaris ADD COLUMN IF NOT EXISTS contact_name TEXT;
ALTER TABLE madaaris ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE madaaris ADD COLUMN IF NOT EXISTS contact_phone TEXT;
ALTER TABLE madaaris ADD COLUMN IF NOT EXISTS signup_ip TEXT;
