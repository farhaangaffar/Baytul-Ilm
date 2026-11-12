-- A school's phase and forms of entry (stage 5: schools sign themselves up). The API adds these itself on first use.
ALTER TABLE madaaris ADD COLUMN IF NOT EXISTS school_phase TEXT;
ALTER TABLE madaaris ADD COLUMN IF NOT EXISTS school_forms INTEGER;
