-- Account ownership enforcement + manager role
--
-- Every account has an owner_id (the implementation specialist who owns it).
-- Managers (role = 'manager' in org_members) can read and edit all accounts.
-- Implementation specialists (role = 'member') see and edit only their own accounts.
--
-- Prerequisites already in schema:
--   accounts.owner_id uuid  (set to auth.uid() on creation)
--   org_members.role text   (was added earlier — this migration enforces the constraint)
--
-- Run in the Supabase SQL editor.

-- ── Role constraint ───────────────────────────────────────────────────────────

ALTER TABLE org_members ALTER COLUMN role SET DEFAULT 'member';

ALTER TABLE org_members DROP CONSTRAINT IF EXISTS org_members_role_check;
ALTER TABLE org_members ADD CONSTRAINT org_members_role_check
  CHECK (role IN ('member', 'manager'));

UPDATE org_members SET role = 'member' WHERE role IS NULL OR role NOT IN ('member', 'manager');
ALTER TABLE org_members ALTER COLUMN role SET NOT NULL;

-- ── is_manager() helper ───────────────────────────────────────────────────────
-- Returns true if the currently authenticated user has role='manager'.
-- SECURITY DEFINER so RLS policies can call it without recursion.

CREATE OR REPLACE FUNCTION is_manager()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_members
    WHERE user_id = auth.uid()
      AND role = 'manager'
  )
$$;

-- ── accounts ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "org members can select accounts" ON accounts;
CREATE POLICY "org members can select accounts" ON accounts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM org_members om WHERE om.org_id = accounts.org_id AND om.user_id = auth.uid())
    AND (accounts.owner_id = auth.uid() OR is_manager())
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
    AND (accounts.owner_id = auth.uid() OR is_manager())
  );

DROP POLICY IF EXISTS "org members can delete accounts" ON accounts;
CREATE POLICY "org members can delete accounts" ON accounts
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM org_members om WHERE om.org_id = accounts.org_id AND om.user_id = auth.uid())
    AND (accounts.owner_id = auth.uid() OR is_manager())
  );

-- ── contacts ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "org members can select contacts" ON contacts;
CREATE POLICY "org members can select contacts" ON contacts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM accounts a JOIN org_members om ON om.org_id = a.org_id
      WHERE a.id = contacts.account_id AND om.user_id = auth.uid()
        AND (a.owner_id = auth.uid() OR is_manager())
    )
  );

DROP POLICY IF EXISTS "org members can insert contacts" ON contacts;
CREATE POLICY "org members can insert contacts" ON contacts
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM accounts a JOIN org_members om ON om.org_id = a.org_id
      WHERE a.id = contacts.account_id AND om.user_id = auth.uid()
        AND (a.owner_id = auth.uid() OR is_manager())
    )
  );

DROP POLICY IF EXISTS "org members can update contacts" ON contacts;
CREATE POLICY "org members can update contacts" ON contacts
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM accounts a JOIN org_members om ON om.org_id = a.org_id
      WHERE a.id = contacts.account_id AND om.user_id = auth.uid()
        AND (a.owner_id = auth.uid() OR is_manager())
    )
  );

DROP POLICY IF EXISTS "org members can delete contacts" ON contacts;
CREATE POLICY "org members can delete contacts" ON contacts
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM accounts a JOIN org_members om ON om.org_id = a.org_id
      WHERE a.id = contacts.account_id AND om.user_id = auth.uid()
        AND (a.owner_id = auth.uid() OR is_manager())
    )
  );

-- ── milestones ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "org members can select milestones" ON milestones;
CREATE POLICY "org members can select milestones" ON milestones
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM accounts a JOIN org_members om ON om.org_id = a.org_id
      WHERE a.id = milestones.account_id AND om.user_id = auth.uid()
        AND (a.owner_id = auth.uid() OR is_manager())
    )
  );

DROP POLICY IF EXISTS "org members can insert milestones" ON milestones;
CREATE POLICY "org members can insert milestones" ON milestones
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM accounts a JOIN org_members om ON om.org_id = a.org_id
      WHERE a.id = milestones.account_id AND om.user_id = auth.uid()
        AND (a.owner_id = auth.uid() OR is_manager())
    )
  );

DROP POLICY IF EXISTS "org members can update milestones" ON milestones;
CREATE POLICY "org members can update milestones" ON milestones
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM accounts a JOIN org_members om ON om.org_id = a.org_id
      WHERE a.id = milestones.account_id AND om.user_id = auth.uid()
        AND (a.owner_id = auth.uid() OR is_manager())
    )
  );

DROP POLICY IF EXISTS "org members can delete milestones" ON milestones;
CREATE POLICY "org members can delete milestones" ON milestones
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM accounts a JOIN org_members om ON om.org_id = a.org_id
      WHERE a.id = milestones.account_id AND om.user_id = auth.uid()
        AND (a.owner_id = auth.uid() OR is_manager())
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
        AND (a.owner_id = auth.uid() OR is_manager())
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
        AND (a.owner_id = auth.uid() OR is_manager())
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
        AND (a.owner_id = auth.uid() OR is_manager())
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
        AND (a.owner_id = auth.uid() OR is_manager())
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
        AND (a.owner_id = auth.uid() OR is_manager())
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
        AND (a.owner_id = auth.uid() OR is_manager())
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
        AND (a.owner_id = auth.uid() OR is_manager())
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
        AND (a.owner_id = auth.uid() OR is_manager())
    )
  );

-- ── interactions ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "org members can select interactions" ON interactions;
CREATE POLICY "org members can select interactions" ON interactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM accounts a JOIN org_members om ON om.org_id = a.org_id
      WHERE a.id = interactions.account_id AND om.user_id = auth.uid()
        AND (a.owner_id = auth.uid() OR is_manager())
    )
  );

DROP POLICY IF EXISTS "org members can insert interactions" ON interactions;
CREATE POLICY "org members can insert interactions" ON interactions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM accounts a JOIN org_members om ON om.org_id = a.org_id
      WHERE a.id = interactions.account_id AND om.user_id = auth.uid()
        AND (a.owner_id = auth.uid() OR is_manager())
    )
  );

DROP POLICY IF EXISTS "org members can update interactions" ON interactions;
CREATE POLICY "org members can update interactions" ON interactions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM accounts a JOIN org_members om ON om.org_id = a.org_id
      WHERE a.id = interactions.account_id AND om.user_id = auth.uid()
        AND (a.owner_id = auth.uid() OR is_manager())
    )
  );

DROP POLICY IF EXISTS "org members can delete interactions" ON interactions;
CREATE POLICY "org members can delete interactions" ON interactions
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM accounts a JOIN org_members om ON om.org_id = a.org_id
      WHERE a.id = interactions.account_id AND om.user_id = auth.uid()
        AND (a.owner_id = auth.uid() OR is_manager())
    )
  );

-- ── open_tasks ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "org members can select open_tasks" ON open_tasks;
CREATE POLICY "org members can select open_tasks" ON open_tasks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM accounts a JOIN org_members om ON om.org_id = a.org_id
      WHERE a.id = open_tasks.account_id AND om.user_id = auth.uid()
        AND (a.owner_id = auth.uid() OR is_manager())
    )
  );

DROP POLICY IF EXISTS "org members can insert open_tasks" ON open_tasks;
CREATE POLICY "org members can insert open_tasks" ON open_tasks
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM accounts a JOIN org_members om ON om.org_id = a.org_id
      WHERE a.id = open_tasks.account_id AND om.user_id = auth.uid()
        AND (a.owner_id = auth.uid() OR is_manager())
    )
  );

DROP POLICY IF EXISTS "org members can update open_tasks" ON open_tasks;
CREATE POLICY "org members can update open_tasks" ON open_tasks
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM accounts a JOIN org_members om ON om.org_id = a.org_id
      WHERE a.id = open_tasks.account_id AND om.user_id = auth.uid()
        AND (a.owner_id = auth.uid() OR is_manager())
    )
  );

DROP POLICY IF EXISTS "org members can delete open_tasks" ON open_tasks;
CREATE POLICY "org members can delete open_tasks" ON open_tasks
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM accounts a JOIN org_members om ON om.org_id = a.org_id
      WHERE a.id = open_tasks.account_id AND om.user_id = auth.uid()
        AND (a.owner_id = auth.uid() OR is_manager())
    )
  );

-- ── requests ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "org members can select requests" ON requests;
CREATE POLICY "org members can select requests" ON requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM accounts a JOIN org_members om ON om.org_id = a.org_id
      WHERE a.id = requests.account_id AND om.user_id = auth.uid()
        AND (a.owner_id = auth.uid() OR is_manager())
    )
  );

DROP POLICY IF EXISTS "org members can insert requests" ON requests;
CREATE POLICY "org members can insert requests" ON requests
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM accounts a JOIN org_members om ON om.org_id = a.org_id
      WHERE a.id = requests.account_id AND om.user_id = auth.uid()
        AND (a.owner_id = auth.uid() OR is_manager())
    )
  );

DROP POLICY IF EXISTS "org members can update requests" ON requests;
CREATE POLICY "org members can update requests" ON requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM accounts a JOIN org_members om ON om.org_id = a.org_id
      WHERE a.id = requests.account_id AND om.user_id = auth.uid()
        AND (a.owner_id = auth.uid() OR is_manager())
    )
  );

DROP POLICY IF EXISTS "org members can delete requests" ON requests;
CREATE POLICY "org members can delete requests" ON requests
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM accounts a JOIN org_members om ON om.org_id = a.org_id
      WHERE a.id = requests.account_id AND om.user_id = auth.uid()
        AND (a.owner_id = auth.uid() OR is_manager())
    )
  );

-- ── ai_suggestions ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "org members can select ai_suggestions" ON ai_suggestions;
CREATE POLICY "org members can select ai_suggestions" ON ai_suggestions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM accounts a JOIN org_members om ON om.org_id = a.org_id
      WHERE a.id = ai_suggestions.account_id AND om.user_id = auth.uid()
        AND (a.owner_id = auth.uid() OR is_manager())
    )
  );

DROP POLICY IF EXISTS "org members can insert ai_suggestions" ON ai_suggestions;
CREATE POLICY "org members can insert ai_suggestions" ON ai_suggestions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM accounts a JOIN org_members om ON om.org_id = a.org_id
      WHERE a.id = ai_suggestions.account_id AND om.user_id = auth.uid()
        AND (a.owner_id = auth.uid() OR is_manager())
    )
  );

DROP POLICY IF EXISTS "org members can update ai_suggestions" ON ai_suggestions;
CREATE POLICY "org members can update ai_suggestions" ON ai_suggestions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM accounts a JOIN org_members om ON om.org_id = a.org_id
      WHERE a.id = ai_suggestions.account_id AND om.user_id = auth.uid()
        AND (a.owner_id = auth.uid() OR is_manager())
    )
  );

DROP POLICY IF EXISTS "org members can delete ai_suggestions" ON ai_suggestions;
CREATE POLICY "org members can delete ai_suggestions" ON ai_suggestions
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM accounts a JOIN org_members om ON om.org_id = a.org_id
      WHERE a.id = ai_suggestions.account_id AND om.user_id = auth.uid()
        AND (a.owner_id = auth.uid() OR is_manager())
    )
  );

-- ── account_resources ─────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "org members can manage account_resources" ON account_resources;
CREATE POLICY "org members can manage account_resources" ON account_resources
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM accounts a JOIN org_members om ON om.org_id = a.org_id
      WHERE a.id = account_resources.account_id AND om.user_id = auth.uid()
        AND (a.owner_id = auth.uid() OR is_manager())
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM accounts a JOIN org_members om ON om.org_id = a.org_id
      WHERE a.id = account_resources.account_id AND om.user_id = auth.uid()
        AND (a.owner_id = auth.uid() OR is_manager())
    )
  );

-- ── item_resources ────────────────────────────────────────────────────────────

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
        AND (a.owner_id = auth.uid() OR is_manager())
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM items i
      JOIN stages s ON s.id = i.stage_id
      JOIN milestones m ON m.id = s.milestone_id
      JOIN accounts a ON a.id = m.account_id
      JOIN org_members om ON om.org_id = a.org_id
      WHERE i.id = item_resources.item_id AND om.user_id = auth.uid()
        AND (a.owner_id = auth.uid() OR is_manager())
    )
  );

-- ── After running: set your own role to manager ───────────────────────────────
-- Replace <your-user-id> with your UUID from Authentication > Users.
--
-- UPDATE org_members SET role = 'manager' WHERE user_id = '<your-user-id>';
