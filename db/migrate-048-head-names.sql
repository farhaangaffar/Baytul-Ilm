-- A head's own name (Settings → Heads: a second head, handing over). The API adds it itself on first use.
ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;
