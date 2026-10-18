-- Online applications (/join/<code>) and parents updating their details. The API adds these itself
-- on first use (server/routes/students.js, settings.js); this file is for manual use.
ALTER TABLE students ADD COLUMN IF NOT EXISTS added_at TIMESTAMP DEFAULT now();
ALTER TABLE students ADD COLUMN IF NOT EXISTS applied_online BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE students ADD COLUMN IF NOT EXISTS applied_new BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE students ADD COLUMN IF NOT EXISTS applied_ip TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_updated_at TIMESTAMP;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS join_message TEXT NOT NULL DEFAULT '';
