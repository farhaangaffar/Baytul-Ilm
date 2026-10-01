-- Monthly or termly reports (Settings). Not required for production —
-- server/routes/settings.js adds it itself on first use. Kept for manual setups.
-- Saved report summaries (ai_summaries.month) hold either a 'YYYY-MM' school month
-- or 'term:<terms.id>' for a termly report.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS report_period TEXT NOT NULL DEFAULT 'monthly';
