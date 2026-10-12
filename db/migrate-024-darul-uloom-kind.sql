-- What kind of school each madrasah is: 'maktab' (evening/weekend classes, the original) or
-- 'darul_uloom' (full-time; switches on the Darul Uloom pages). The API adds this itself on
-- first use (server/newMadrasah.js) — this file is only for running by hand.
ALTER TABLE madaaris ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'maktab';
