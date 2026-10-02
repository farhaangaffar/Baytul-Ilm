-- Qur'an progress (hifz / nazira / qaida). New tables and one new column only —
-- nothing existing changes. The API creates these itself on first use
-- (server/routes/quran.js, server/routes/classes.js); this file is for manual setups.
-- Needs db/migrate-011-madaaris.sql first.

-- What a class studies: 'hifz' | 'nazira' | 'qaida', or NULL for none.
ALTER TABLE classes ADD COLUMN IF NOT EXISTS quran_type TEXT;

-- One entry per student per day per kind. Positions are surah + ayah (Hafs numbering);
-- a qaida lesson is free text.
CREATE TABLE IF NOT EXISTS quran_progress (
  id           BIGSERIAL PRIMARY KEY,
  madrasah_id  INTEGER NOT NULL REFERENCES madaaris(id),
  student_id   TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  date         DATE NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('sabaq','sabqi','manzil','reading','lesson')),
  from_surah   INTEGER, from_ayah INTEGER, to_surah INTEGER, to_ayah INTEGER,
  lesson       TEXT NOT NULL DEFAULT '',
  grade        TEXT CHECK (grade IN ('good','weak','repeat')),
  note         TEXT NOT NULL DEFAULT '',
  updated_at   TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (student_id, date, kind)
);
CREATE INDEX IF NOT EXISTS idx_quran_progress_madrasah ON quran_progress (madrasah_id);
-- 'ayah' (recorded by surah and ayah) or 'quarter' (recorded in juz quarters; the
-- positions above are then the quarters' first and last ayahs).
ALTER TABLE quran_progress ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT 'ayah';

-- Juz a student had already memorised before records started here.
CREATE TABLE IF NOT EXISTS quran_students (
  student_id   TEXT PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  madrasah_id  INTEGER NOT NULL REFERENCES madaaris(id),
  prior_juz    INTEGER[] NOT NULL DEFAULT '{}'
);
