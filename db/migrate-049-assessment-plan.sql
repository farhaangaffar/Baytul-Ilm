-- Islamic Studies year plan: each assessment point keeps the year plan it was taken with (item id → year group).
-- Added by the API on first use (server/routes/school-reports.js); here for manual use.
ALTER TABLE is_assessments ADD COLUMN IF NOT EXISTS plan JSONB;
