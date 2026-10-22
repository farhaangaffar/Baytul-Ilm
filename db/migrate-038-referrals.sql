-- "Recommend Suhuf": which madrasah recommended this one, and when that madrasah was given its free month for it.
-- The API adds these itself on first use (server/newMadrasah.js); this file is for running by hand.
ALTER TABLE madaaris ADD COLUMN IF NOT EXISTS referred_by INTEGER;
ALTER TABLE madaaris ADD COLUMN IF NOT EXISTS referral_reward_at TIMESTAMP;
