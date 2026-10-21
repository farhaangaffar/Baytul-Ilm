-- Demos started and madaaris signed up, per day (Madaaris page → Demos & sign-ups). The API makes this itself on
-- first use (server/platform.js) and fills in earlier self sign-ups once; this file is for running by hand.
CREATE TABLE IF NOT EXISTS platform_counts (
  day  DATE NOT NULL,
  what TEXT NOT NULL,          -- 'demo' / 'demo_du' / 'signup' / 'signup_du'
  n    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, what)
);
