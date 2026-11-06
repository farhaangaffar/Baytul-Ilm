-- A school's Islamic Studies reports (server/routes/school-reports.js) — the API makes these itself on first use;
-- this file is for running by hand.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS studies_reports TEXT NOT NULL DEFAULT 'term'; -- 'term' | 'year'

-- An assessment point: where every pupil was on their surahs, du'aas and practicals at that moment.
CREATE TABLE IF NOT EXISTS is_assessments (
  id           BIGSERIAL PRIMARY KEY,
  madrasah_id  INTEGER NOT NULL REFERENCES madaaris(id),
  year         TEXT NOT NULL,
  name         TEXT NOT NULL,
  taken_at     DATE NOT NULL,
  taken_by     TEXT NOT NULL DEFAULT '',
  published_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_is_assessments_madrasah ON is_assessments (madrasah_id, year);

CREATE TABLE IF NOT EXISTS is_assessment_pupils (
  assessment_id BIGINT NOT NULL,
  madrasah_id   INTEGER NOT NULL REFERENCES madaaris(id),
  student_id    TEXT NOT NULL,
  class         TEXT NOT NULL DEFAULT '',
  year_group    INTEGER,
  marks         JSONB NOT NULL DEFAULT '{}',
  effort        TEXT NOT NULL DEFAULT '',
  effort_by     TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (assessment_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_is_assessment_pupils_madrasah ON is_assessment_pupils (madrasah_id);
