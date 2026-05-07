-- Track whether sample accounts have been seeded for each user.
-- Once true, the seed is never re-run, so deleted accounts stay deleted.
ALTER TABLE org_members
  ADD COLUMN IF NOT EXISTS seeded_sample_accounts boolean NOT NULL DEFAULT false;
