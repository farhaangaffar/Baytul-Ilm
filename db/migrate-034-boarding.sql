-- Boarding at a Darul Uloom (the Boarding page, server/routes/boarding.js). The API makes these itself
-- on first use; this file is for manual use. Nothing existing is changed.
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS boarding_duty BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS du_rooms (
  id          BIGSERIAL PRIMARY KEY,
  madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
  block       TEXT NOT NULL DEFAULT '',   -- the section, as the madrasah writes it (Block A, East Wing…)
  level       TEXT NOT NULL DEFAULT '',   -- e.g. Ground, 1, 2
  name        TEXT NOT NULL,              -- the room's number or name
  beds        INTEGER NOT NULL DEFAULT 0,
  teacher_id  TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS du_room_places (
  student_id  TEXT PRIMARY KEY,
  madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
  room_id     BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS du_night_register (
  madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
  student_id  TEXT NOT NULL,
  date        DATE NOT NULL,
  status      TEXT NOT NULL,
  marked_by   TEXT NOT NULL DEFAULT '',
  marked_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, date)
);
CREATE INDEX IF NOT EXISTS du_night_register_madrasah_date ON du_night_register (madrasah_id, date);
CREATE TABLE IF NOT EXISTS du_home_weekends (
  id          BIGSERIAL PRIMARY KEY,
  madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
  name        TEXT NOT NULL DEFAULT '',
  starts      DATE NOT NULL,
  leave_time  TEXT NOT NULL DEFAULT '',
  ends        DATE NOT NULL,
  return_time TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS du_leaves (
  id           BIGSERIAL PRIMARY KEY,
  madrasah_id  INTEGER NOT NULL REFERENCES madaaris(id),
  student_id   TEXT NOT NULL,
  reason       TEXT NOT NULL DEFAULT '',
  collected_by TEXT NOT NULL DEFAULT '',
  out_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  out_by       TEXT NOT NULL DEFAULT '',
  back_due     DATE,
  back_at      TIMESTAMPTZ,
  back_by      TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS du_leaves_madrasah ON du_leaves (madrasah_id, out_at);
CREATE TABLE IF NOT EXISTS du_health_log (
  id          BIGSERIAL PRIMARY KEY,
  madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
  student_id  TEXT NOT NULL,
  at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  kind        TEXT NOT NULL,
  note        TEXT NOT NULL DEFAULT '',
  medicine    TEXT NOT NULL DEFAULT '',
  dose        TEXT NOT NULL DEFAULT '',
  by_name     TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS du_health_log_madrasah ON du_health_log (madrasah_id, at);
