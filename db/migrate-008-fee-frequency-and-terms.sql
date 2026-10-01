-- Fee frequency (weekly / monthly / termly), per-period fee records and term dates.
-- Not required for production — the API applies these itself on first use
-- (server/routes/settings.js, fees.js, terms.js). Kept for manual setups.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS fee_frequency TEXT NOT NULL DEFAULT 'weekly';
ALTER TABLE fees ADD COLUMN IF NOT EXISTS period TEXT NOT NULL DEFAULT 'week';
ALTER TABLE fees DROP CONSTRAINT IF EXISTS fees_year_student_id_week_starting_key;
CREATE UNIQUE INDEX IF NOT EXISTS fees_year_student_period_start_key ON fees (year, student_id, period, week_starting);
CREATE TABLE IF NOT EXISTS terms (
  id          BIGSERIAL PRIMARY KEY,
  year        TEXT NOT NULL,
  name        TEXT NOT NULL,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  CHECK (end_date >= start_date)
);
