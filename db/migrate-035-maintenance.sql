-- A Darul Uloom's maintenance list (the Maintenance page). The API makes these itself on first use
-- (server/routes/maintenance.js, server/routes/teachers.js); this file is for running by hand.
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS maintenance_duty BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS du_maintenance (
  id          BIGSERIAL PRIMARY KEY,
  madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
  what        TEXT NOT NULL,
  place       TEXT NOT NULL DEFAULT '',
  urgent      BOOLEAN NOT NULL DEFAULT false,
  note        TEXT NOT NULL DEFAULT '',
  added_by    TEXT NOT NULL DEFAULT '',
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  done_at     TIMESTAMPTZ,
  done_by     TEXT NOT NULL DEFAULT '',
  done_note   TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_du_maintenance_madrasah ON du_maintenance (madrasah_id);
