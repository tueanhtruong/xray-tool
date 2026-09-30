CREATE OR REPLACE FUNCTION "lockTestCaseWorkspace"() RETURNS TRIGGER AS $$
DECLARE
  old_workspace_id TEXT;
  new_workspace_id TEXT;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    old_workspace_id := OLD."workspaceId";
  END IF;
  IF TG_OP <> 'DELETE' THEN
    new_workspace_id := NEW."workspaceId";
  END IF;

  PERFORM "id"
  FROM "Workspace"
  WHERE "id" IN (old_workspace_id, new_workspace_id)
  ORDER BY "id"
  FOR UPDATE;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "TestCase_lockWorkspace"
BEFORE INSERT OR UPDATE OR DELETE ON "TestCase"
FOR EACH ROW EXECUTE FUNCTION "lockTestCaseWorkspace"();
