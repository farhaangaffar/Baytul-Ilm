-- A Darul Uloom exam paper's own pass mark (e.g. Hifdh heard aloud: out of 100, pass 60) and a guest
-- examiner's name. The API adds these by itself on first use; this file is for running by hand.
ALTER TABLE du_exam_papers ADD COLUMN IF NOT EXISTS pass_mark NUMERIC;
ALTER TABLE du_exam_papers ADD COLUMN IF NOT EXISTS examiner TEXT NOT NULL DEFAULT '';
