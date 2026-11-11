-- Quizzes (a school's Islamic Studies, stage 4b): a quiz is homework with kind 'quiz', its questions and settings in quiz;
-- each time a pupil hands one in is a row in is_quiz_attempts. The API makes these itself on first use.
ALTER TABLE is_homework ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'task';
ALTER TABLE is_homework ADD COLUMN IF NOT EXISTS quiz JSONB;
ALTER TABLE is_homework ADD COLUMN IF NOT EXISTS draft BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE is_homework ADD COLUMN IF NOT EXISTS scores_sent_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS is_quiz_attempts (
  id           BIGSERIAL PRIMARY KEY,
  homework_id  BIGINT NOT NULL REFERENCES is_homework(id) ON DELETE CASCADE,
  student_id   TEXT NOT NULL,
  madrasah_id  INTEGER NOT NULL REFERENCES madaaris(id),
  answers      JSONB NOT NULL,
  results      JSONB NOT NULL,
  score        NUMERIC NOT NULL DEFAULT 0,
  max          NUMERIC NOT NULL DEFAULT 0,
  waiting      INTEGER NOT NULL DEFAULT 0,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_is_quiz_attempts_hw ON is_quiz_attempts (homework_id, student_id);
