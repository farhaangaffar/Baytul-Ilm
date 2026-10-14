-- Darul Uloom exams & report cards (server/routes/exams.js creates these itself on first use).
CREATE TABLE IF NOT EXISTS du_exams (
  id          BIGSERIAL PRIMARY KEY,
  madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
  name        TEXT NOT NULL,
  year        TEXT NOT NULL,                 -- academic year, e.g. '26-27'
  held_on     DATE,
  out_of      INTEGER NOT NULL DEFAULT 100,  -- each paper's usual out of
  pass_mark   NUMERIC NOT NULL DEFAULT 35,   -- out of out_of; scaled for a paper marked out of something else
  class_ids   TEXT[] NOT NULL DEFAULT '{}',  -- the classes sitting it
  published   BOOLEAN NOT NULL DEFAULT false,-- report cards shown in the parent portal
  created_at  TIMESTAMP NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS du_exam_papers (
  id          BIGSERIAL PRIMARY KEY,
  madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
  exam_id     BIGINT NOT NULL,
  class_id    TEXT NOT NULL,
  subject     TEXT NOT NULL,
  kitaab      TEXT NOT NULL DEFAULT '',
  teacher_id  TEXT,                          -- who enters its marks
  out_of      INTEGER NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_du_exam_papers ON du_exam_papers (madrasah_id, exam_id);
CREATE TABLE IF NOT EXISTS du_exam_marks (
  madrasah_id INTEGER NOT NULL REFERENCES madaaris(id),
  exam_id     BIGINT NOT NULL,
  paper_id    BIGINT NOT NULL,
  student_id  TEXT NOT NULL,
  mark        NUMERIC,
  absent      BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (paper_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_du_exam_marks ON du_exam_marks (madrasah_id, exam_id);
CREATE TABLE IF NOT EXISTS du_exam_comments (
  madrasah_id     INTEGER NOT NULL REFERENCES madaaris(id),
  exam_id         BIGINT NOT NULL,
  student_id      TEXT NOT NULL,
  teacher_comment TEXT NOT NULL DEFAULT '',
  head_comment    TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (exam_id, student_id)
);
