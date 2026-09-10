-- Adds a leave date for students who've left, alongside the existing enroll_date.
-- Run once against an existing database that was created from schema.sql before
-- this column existed. Not required for production — api/students.js adds it
-- itself on first use (same self-healing pattern as ai_summaries.behavior in
-- api/ai-summary.js), since this app has no automated migration runner. Kept
-- here for anyone who prefers to apply schema changes manually up front.
ALTER TABLE students ADD COLUMN IF NOT EXISTS leave_date DATE;
