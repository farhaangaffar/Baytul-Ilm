-- Demo madaaris ("Try the demo", server/demo.js). The API adds these columns itself on
-- first use; this file is the same change for manual setups. Only adds columns —
-- existing madaaris are untouched (NULL = a real madrasah).
ALTER TABLE madaaris ADD COLUMN IF NOT EXISTS demo_until TIMESTAMP; -- a demo deletes itself after this
ALTER TABLE madaaris ADD COLUMN IF NOT EXISTS demo_ip TEXT;          -- hashed address, only to limit demos per visitor
