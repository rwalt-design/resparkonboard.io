-- Stores the actual event time (email sent/received, Slack message ts, etc.)
-- so the timeline sorts by when things happened, not when they were synced.
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS event_at TIMESTAMPTZ;
