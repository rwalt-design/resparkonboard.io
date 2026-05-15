-- Tracks days the account spent on-hold or blocked (outside CSM control).
-- Subtracted from Days to Live calculation in the Handed Off view.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS paused_days INTEGER DEFAULT 0;
