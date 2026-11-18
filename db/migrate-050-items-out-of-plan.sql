-- Islamic Studies Year plan: an item taken out of the plan keeps its marks (year_group NULL; classes don't show it).
-- Done by the API on first use (server/routes/studies.js ensure()); here for manual use.
ALTER TABLE is_items ALTER COLUMN year_group DROP NOT NULL;
