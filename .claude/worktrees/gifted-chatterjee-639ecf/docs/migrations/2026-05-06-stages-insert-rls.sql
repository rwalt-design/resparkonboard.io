-- RLS INSERT (and SELECT/UPDATE) policies for stages
-- The stages table has no direct org_id/user_id column, so we join through milestones → accounts → org_members.
-- Run in the Supabase SQL editor.

-- ── stages SELECT ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "org members can select stages" ON stages;
CREATE POLICY "org members can select stages" ON stages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM milestones m
      JOIN accounts a   ON a.id = m.account_id
      JOIN org_members om ON om.org_id = a.org_id
      WHERE m.id = stages.milestone_id
        AND om.user_id = auth.uid()
    )
  );

-- ── stages INSERT ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "org members can insert stages" ON stages;
CREATE POLICY "org members can insert stages" ON stages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM milestones m
      JOIN accounts a   ON a.id = m.account_id
      JOIN org_members om ON om.org_id = a.org_id
      WHERE m.id = stages.milestone_id
        AND om.user_id = auth.uid()
    )
  );

-- ── stages UPDATE ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "org members can update stages" ON stages;
CREATE POLICY "org members can update stages" ON stages
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM milestones m
      JOIN accounts a   ON a.id = m.account_id
      JOIN org_members om ON om.org_id = a.org_id
      WHERE m.id = stages.milestone_id
        AND om.user_id = auth.uid()
    )
  );

-- ── items INSERT ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "org members can insert items" ON items;
CREATE POLICY "org members can insert items" ON items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM stages s
      JOIN milestones m ON m.id = s.milestone_id
      JOIN accounts a   ON a.id = m.account_id
      JOIN org_members om ON om.org_id = a.org_id
      WHERE s.id = items.stage_id
        AND om.user_id = auth.uid()
    )
  );

-- ── items UPDATE ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "org members can update items" ON items;
CREATE POLICY "org members can update items" ON items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM stages s
      JOIN milestones m ON m.id = s.milestone_id
      JOIN accounts a   ON a.id = m.account_id
      JOIN org_members om ON om.org_id = a.org_id
      WHERE s.id = items.stage_id
        AND om.user_id = auth.uid()
    )
  );
