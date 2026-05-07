-- Add avatar_url to org_members so each member's Google headshot is available
-- for the dashboard owner display without needing auth.admin access client-side.
ALTER TABLE org_members ADD COLUMN IF NOT EXISTS avatar_url text;
