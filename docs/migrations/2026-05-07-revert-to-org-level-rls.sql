-- Revert ownership-based RLS back to plain org-level access.
--
-- The global "Viewing" filter in the UI handles who sees what.
-- owner_id and role columns stay — they power the filter and the manager
-- reassignment feature. Only the database-level ownership enforcement is removed.
--
-- Run AFTER 2026-05-07-account-ownership-rls.sql (this supersedes it).
-- Run in the Supabase SQL editor.

-- ── accounts ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "org members can select accounts" ON accounts;
CREATE POLICY "org members can select accounts" ON accounts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM org_members om WHERE om.org_id = accounts.org_id AND om.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "org members can insert accounts" ON accounts;
CREATE POLICY "org members can insert accounts" ON accounts
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM org_members om WHERE om.org_id = accounts.org_id AND om.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "org members can update accounts" ON accounts;
CREATE POLICY "org members can update accounts" ON accounts
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM org_members om WHERE om.org_id = accounts.org_id AND om.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "org members can delete accounts" ON accounts;
CREATE POLICY "org members can delete accounts" ON accounts
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM org_members om WHERE om.org_id = accounts.org_id AND om.user_id = auth.uid())
  );

-- ── contacts ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "org members can select contacts" ON contacts;
CREATE POLICY "org members can select contacts" ON contacts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM accounts a JOIN org_members om ON om.org_id = a.org_id
      WHERE a.id = contacts.account_id AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "org members can insert contacts" ON contacts;
CREATE POLICY "org members can insert contacts" ON contacts
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM accounts a JOIN org_members om ON om.org_id = a.org_id
      WHERE a.id = contacts.account_id AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "org members can update contacts" ON contacts;
CREATE POLICY "org members can update contacts" ON contacts
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM accounts a JOIN org_members om ON om.org_id = a.org_id
      WHERE a.id = contacts.account_id AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "org members can delete contacts" ON contacts;
CREATE POLICY "org members can delete contacts" ON contacts
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM accounts a JOIN org_members om ON om.org_id = a.org_id
      WHERE a.id = contacts.account_id AND om.user_id = auth.uid()
    )
  );

-- ── milestones ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "org members can select milestones" ON milestones;
CREATE POLICY "org members can select milestones" ON milestones
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM accounts a JOIN org_members om ON om.org_id = a.org_id
      WHERE a.id = milestones.account_id AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "org members can insert milestones" ON milestones;
CREATE POLICY "org members can insert milestones" ON milestones
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM accounts a JOIN org_members om ON om.org_id = a.org_id
      WHERE a.id = milestones.account_id AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "org members can update milestones" ON milestones;
CREATE POLICY "org members can update milestones" ON milestones
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM accounts a JOIN org_members om ON om.org_id = a.org_id
      WHERE a.id = milestones.account_id AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "org members can delete milestones" ON milestones;
CREATE POLICY "org members can delete milestones" ON milestones
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM accounts a JOIN org_members om ON om.org_id = a.org_id
      WHERE a.id = milestones.account_id AND om.user_id = auth.uid()
    )
  );

-- ── stages ────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "org members can select stages" ON stages;
CREATE POLICY "org members can select stages" ON stages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM milestones m
      JOIN accounts a ON a.id = m.account_id
      JOIN org_members om ON om.org_id = a.org_id
      WHERE m.id = stages.milestone_id AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "org members can insert stages" ON stages;
CREATE POLICY "org members can insert stages" ON stages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM milestones m
      JOIN accounts a ON a.id = m.account_id
      JOIN org_members om ON om.org_id = a.org_id
      WHERE m.id = stages.milestone_id AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "org members can update stages" ON stages;
CREATE POLICY "org members can update stages" ON stages
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM milestones m
      JOIN accounts a ON a.id = m.account_id
      JOIN org_members om ON om.org_id = a.org_id
      WHERE m.id = stages.milestone_id AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "org members can delete stages" ON stages;
CREATE POLICY "org members can delete stages" ON stages
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM milestones m
      JOIN accounts a ON a.id = m.account_id
      JOIN org_members om ON om.org_id = a.org_id
      WHERE m.id = stages.milestone_id AND om.user_id = auth.uid()
    )
  );

-- ── items ─────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "org members can select items" ON items;
CREATE POLICY "org members can select items" ON items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM stages s
      JOIN milestones m ON m.id = s.milestone_id
      JOIN accounts a ON a.id = m.account_id
      JOIN org_members om ON om.org_id = a.org_id
      WHERE s.id = items.stage_id AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "org members can insert items" ON items;
CREATE POLICY "org members can insert items" ON items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM stages s
      JOIN milestones m ON m.id = s.milestone_id
      JOIN accounts a ON a.id = m.account_id
      JOIN org_members om ON om.org_id = a.org_id
      WHERE s.id = items.stage_id AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "org members can update items" ON items;
CREATE POLICY "org members can update items" ON items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM stages s
      JOIN milestones m ON m.id = s.milestone_id
      JOIN accounts a ON a.id = m.account_id
      JOIN org_members om ON om.org_id = a.org_id
      WHERE s.id = items.stage_id AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "org members can delete items" ON items;
CREATE POLICY "org members can delete items" ON items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM stages s
      JOIN milestones m ON m.id = s.milestone_id
      JOIN accounts a ON a.id = m.account_id
      JOIN org_members om ON om.org_id = a.org_id
      WHERE s.id = items.stage_id AND om.user_id = auth.uid()
    )
  );

-- ── interactions ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "org members can select interactions" ON interactions;
CREATE POLICY "org members can select interactions" ON interactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM accounts a JOIN org_members om ON om.org_id = a.org_id
      WHERE a.id = interactions.account_id AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "org members can insert interactions" ON interactions;
CREATE POLICY "org members can insert interactions" ON interactions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM accounts a JOIN org_members om ON om.org_id = a.org_id
      WHERE a.id = interactions.account_id AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "org members can update interactions" ON interactions;
CREATE POLICY "org members can update interactions" ON interactions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM accounts a JOIN org_members om ON om.org_id = a.org_id
      WHERE a.id = interactions.account_id AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "org members can delete interactions" ON interactions;
CREATE POLICY "org members can delete interactions" ON interactions
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM accounts a JOIN org_members om ON om.org_id = a.org_id
      WHERE a.id = interactions.account_id AND om.user_id = auth.uid()
    )
  );

-- ── open_tasks, requests, ai_suggestions ─────────────────────────────────────

DROP POLICY IF EXISTS "org members can select open_tasks" ON open_tasks;
CREATE POLICY "org members can select open_tasks" ON open_tasks
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM accounts a JOIN org_members om ON om.org_id = a.org_id
      WHERE a.id = open_tasks.account_id AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "org members can insert open_tasks" ON open_tasks;
DROP POLICY IF EXISTS "org members can update open_tasks" ON open_tasks;
DROP POLICY IF EXISTS "org members can delete open_tasks" ON open_tasks;

DROP POLICY IF EXISTS "org members can select requests" ON requests;
CREATE POLICY "org members can select requests" ON requests
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM accounts a JOIN org_members om ON om.org_id = a.org_id
      WHERE a.id = requests.account_id AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "org members can insert requests" ON requests;
DROP POLICY IF EXISTS "org members can update requests" ON requests;
DROP POLICY IF EXISTS "org members can delete requests" ON requests;

DROP POLICY IF EXISTS "org members can select ai_suggestions" ON ai_suggestions;
CREATE POLICY "org members can select ai_suggestions" ON ai_suggestions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM accounts a JOIN org_members om ON om.org_id = a.org_id
      WHERE a.id = ai_suggestions.account_id AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "org members can insert ai_suggestions" ON ai_suggestions;
DROP POLICY IF EXISTS "org members can update ai_suggestions" ON ai_suggestions;
DROP POLICY IF EXISTS "org members can delete ai_suggestions" ON ai_suggestions;

-- ── account_resources, item_resources ────────────────────────────────────────

DROP POLICY IF EXISTS "org members can manage account_resources" ON account_resources;
CREATE POLICY "org members can manage account_resources" ON account_resources
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM accounts a JOIN org_members om ON om.org_id = a.org_id
      WHERE a.id = account_resources.account_id AND om.user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM accounts a JOIN org_members om ON om.org_id = a.org_id
      WHERE a.id = account_resources.account_id AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "org members can manage item_resources" ON item_resources;
CREATE POLICY "org members can manage item_resources" ON item_resources
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM items i
      JOIN stages s ON s.id = i.stage_id
      JOIN milestones m ON m.id = s.milestone_id
      JOIN accounts a ON a.id = m.account_id
      JOIN org_members om ON om.org_id = a.org_id
      WHERE i.id = item_resources.item_id AND om.user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM items i
      JOIN stages s ON s.id = i.stage_id
      JOIN milestones m ON m.id = s.milestone_id
      JOIN accounts a ON a.id = m.account_id
      JOIN org_members om ON om.org_id = a.org_id
      WHERE i.id = item_resources.item_id AND om.user_id = auth.uid()
    )
  );
