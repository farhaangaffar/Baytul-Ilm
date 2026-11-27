-- A child in two classes ("+ Add to another class"): each class is its own enrolment (own fees, register,
-- records, report); they share link_group, the first enrolment's id. Added by the API on first use too.
ALTER TABLE students ADD COLUMN IF NOT EXISTS link_group TEXT;
