CREATE OR REPLACE FUNCTION "lockDraftWorkspace"() RETURNS TRIGGER AS $$
DECLARE
  old_workspace_id TEXT;
  new_workspace_id TEXT;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    SELECT "workspaceId" INTO old_workspace_id FROM "TestCase" WHERE "id" = OLD."testCaseId";
  END IF;
  IF TG_OP <> 'DELETE' THEN
    SELECT "workspaceId" INTO new_workspace_id FROM "TestCase" WHERE "id" = NEW."testCaseId";
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

CREATE TRIGGER "TestCaseDraft_lockWorkspace"
BEFORE INSERT OR UPDATE OR DELETE ON "TestCaseDraft"
FOR EACH ROW EXECUTE FUNCTION "lockDraftWorkspace"();
