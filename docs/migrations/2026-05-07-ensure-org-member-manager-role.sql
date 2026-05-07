-- Updated ensure_org_member:
--   • First person to join the org gets role = 'manager'
--   • Everyone after gets role = 'member'
--
-- This replaces whatever version is currently deployed. Run in the Supabase SQL editor.

CREATE OR REPLACE FUNCTION ensure_org_member(p_user_id uuid, p_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id      uuid;
  v_member_count int;
BEGIN
  -- Already a member — just keep the display name current.
  SELECT org_id INTO v_org_id
  FROM org_members
  WHERE user_id = p_user_id
  LIMIT 1;

  IF v_org_id IS NOT NULL THEN
    UPDATE org_members SET name = p_name WHERE user_id = p_user_id;
    RETURN;
  END IF;

  -- Find the single shared org, or create it on the very first sign-in.
  SELECT id INTO v_org_id FROM organizations LIMIT 1;

  IF v_org_id IS NULL THEN
    INSERT INTO organizations (name)
    VALUES ('ReSPARK')
    RETURNING id INTO v_org_id;
  END IF;

  -- First member becomes manager; everyone after is a member (implementation specialist).
  SELECT COUNT(*) INTO v_member_count FROM org_members WHERE org_id = v_org_id;

  INSERT INTO org_members (org_id, user_id, name, role)
  VALUES (
    v_org_id,
    p_user_id,
    p_name,
    CASE WHEN v_member_count = 0 THEN 'manager' ELSE 'member' END
  );
END;
$$;
