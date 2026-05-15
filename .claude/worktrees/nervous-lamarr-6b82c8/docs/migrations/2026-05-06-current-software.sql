-- Add current_software field to accounts
-- Run this in the Supabase SQL editor.

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS current_software text;
