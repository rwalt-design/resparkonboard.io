-- RLS policies for deletes (items, stages, milestones, interactions)
-- and for reading items through nested Supabase joins.
-- Run in the Supabase SQL editor.

-- Helper: check that a user is a member of the org that owns a given account
-- Used in items/stages/milestones policies that don't have a direct org_id column.

-- ── items ─────────────────────────────────────────────────────────────────────
-- SELECT (needed for the sync route's nested join to work)
DROP POLICY IF EXISTS "org members can select items" ON items;
CREATE POLICY "org members can select items" ON items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM stages s
      JOIN milestones m ON m.id = s.milestone_id
      JOIN accounts a   ON a.id = m.account_id
      JOIN org_members om ON om.org_id = a.org_id
      WHERE s.id = items.stage_id
        AND om.user_id = auth.uid()
    )
  );

-- DELETE
DROP POLICY IF EXISTS "org members can delete items" ON items;
CREATE POLICY "org members can delete items" ON items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM stages s
      JOIN milestones m ON m.id = s.milestone_id
      JOIN accounts a   ON a.id = m.account_id
      JOIN org_members om ON om.org_id = a.org_id
      WHERE s.id = items.stage_id
        AND om.user_id = auth.uid()
    )
  );

-- ── stages ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "org members can delete stages" ON stages;
CREATE POLICY "org members can delete stages" ON stages
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM milestones m
      JOIN accounts a   ON a.id = m.account_id
      JOIN org_members om ON om.org_id = a.org_id
      WHERE m.id = stages.milestone_id
        AND om.user_id = auth.uid()
    )
  );

-- ── milestones ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "org members can delete milestones" ON milestones;
CREATE POLICY "org members can delete milestones" ON milestones
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM accounts a
      JOIN org_members om ON om.org_id = a.org_id
      WHERE a.id = milestones.account_id
        AND om.user_id = auth.uid()
    )
  );

-- ── interactions ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "org members can delete interactions" ON interactions;
CREATE POLICY "org members can delete interactions" ON interactions
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM accounts a
      JOIN org_members om ON om.org_id = a.org_id
      WHERE a.id = interactions.account_id
        AND om.user_id = auth.uid()
    )
  );
