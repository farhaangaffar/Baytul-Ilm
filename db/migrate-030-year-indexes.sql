-- Faster reads of one madrasah's year of registers and fees once many madaaris share the
-- database. The API adds these itself on first use (attendance.js, fees.js); this file is
-- for manual use. Nothing existing is changed.
CREATE INDEX IF NOT EXISTS idx_attendance_madrasah_year ON attendance (madrasah_id, year);
CREATE INDEX IF NOT EXISTS idx_fees_madrasah_year ON fees (madrasah_id, year);
