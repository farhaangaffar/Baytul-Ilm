-- Qur'an grades: "Okay" between Good and Weak. The API makes this change itself on first
-- use; this file is the same for manual setups. Only widens what's allowed.
ALTER TABLE quran_progress DROP CONSTRAINT IF EXISTS quran_progress_grade_check;
ALTER TABLE quran_progress ADD CONSTRAINT quran_progress_grade_check CHECK (grade IN ('good','okay','weak','repeat'));
