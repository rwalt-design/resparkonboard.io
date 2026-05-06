-- Go Live + KO Date migration
-- Run this in the Supabase SQL editor.
-- Safe: additive then renaming. Existing target_launch_date values are preserved.

BEGIN;

-- 1. Add new kickoff_date column (nullable, optional manual entry)
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS kickoff_date date;

-- 2. Rename target_launch_date -> go_live_date (preserves existing values)
ALTER TABLE accounts
  RENAME COLUMN target_launch_date TO go_live_date;

COMMIT;
