-- A school's homework (Islamic Studies, stage 4). The API makes these itself on first use (server/schoolHomework.js,
-- called from server/routes/studies.js ensure()); this file is for doing it by hand.
CREATE TABLE IF NOT EXISTS is_homework (
  id          BIGSERIAL PRIMARY KEY,
  madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
  class_id    TEXT NOT NULL,
  item_id     BIGINT,
  text        TEXT NOT NULL,
  due         DATE,
  all_pupils  BOOLEAN NOT NULL DEFAULT true,
  set_by      TEXT NOT NULL DEFAULT '',
  set_by_user TEXT NOT NULL DEFAULT '',
  set_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_is_homework_class ON is_homework (madrasah_id, class_id);
CREATE TABLE IF NOT EXISTS is_homework_pupils (
  homework_id BIGINT NOT NULL REFERENCES is_homework(id) ON DELETE CASCADE,
  student_id  TEXT NOT NULL,
  madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
  PRIMARY KEY (homework_id, student_id)
);
CREATE TABLE IF NOT EXISTS is_homework_done (
  homework_id BIGINT NOT NULL REFERENCES is_homework(id) ON DELETE CASCADE,
  student_id  TEXT NOT NULL,
  madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
  done_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (homework_id, student_id)
);
