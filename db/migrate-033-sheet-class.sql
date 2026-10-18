-- Students → Import brings children in without a class; the class their spreadsheet named is kept
-- as a hint for placing them ("Not in a class" on Students). The API adds this itself on first use
-- (server/routes/students.js); this file is for manual use.
ALTER TABLE students ADD COLUMN IF NOT EXISTS sheet_class TEXT NOT NULL DEFAULT '';
