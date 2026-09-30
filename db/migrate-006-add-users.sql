-- Adds individual logins (owner + teachers). Not required for production —
-- server/auth.js creates the table itself on first use (ensureUsersTable).
-- Kept for anyone who applies schema changes manually.
CREATE TABLE IF NOT EXISTS users (
  id               BIGSERIAL PRIMARY KEY,
  username         TEXT NOT NULL UNIQUE,
  password_hash    TEXT NOT NULL,
  role             TEXT NOT NULL CHECK (role IN ('owner','teacher')),
  teacher_id       TEXT UNIQUE REFERENCES teachers(id) ON DELETE CASCADE,
  active           BOOLEAN NOT NULL DEFAULT true,
  session_version  INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMP NOT NULL DEFAULT now()
);
