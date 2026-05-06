-- Tracks which plan template an account was built from.
-- Used by the template sync feature to push new items to matching accounts.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS plan_template_id UUID REFERENCES plan_templates(id) ON DELETE SET NULL;
