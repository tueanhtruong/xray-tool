BEGIN;

CREATE TYPE "TenantIdentityKind" AS ENUM ('CLOUD_ID', 'SITE_ORIGIN');

ALTER TABLE "Folder" ADD COLUMN "projectId" TEXT;
ALTER TABLE "TestCase" ADD COLUMN "projectId" TEXT;
ALTER TABLE "TestCase" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "TestCase" ALTER COLUMN "issueId" DROP NOT NULL;

CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "tenantIdentityKind" "TenantIdentityKind" NOT NULL,
    "tenantIdentity" TEXT NOT NULL,
    "jiraProjectId" TEXT NOT NULL,
    "jiraProjectKey" TEXT NOT NULL,
    "jiraProjectName" TEXT NOT NULL,
    "projectReadyAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "testIssueTypeId" TEXT NOT NULL,
    "testIssueTypeName" TEXT NOT NULL,
    "projectStatuses" JSONB NOT NULL,
    "foldersPulledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkspaceProject" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkspaceProject_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Project_tenantIdentityKind_tenantIdentity_jiraProjectId_key"
ON "Project"("tenantIdentityKind", "tenantIdentity", "jiraProjectId");

CREATE INDEX "Project_jiraProjectKey_idx" ON "Project"("jiraProjectKey");
CREATE UNIQUE INDEX "WorkspaceProject_workspaceId_projectId_key" ON "WorkspaceProject"("workspaceId", "projectId");
CREATE INDEX "WorkspaceProject_projectId_idx" ON "WorkspaceProject"("projectId");

INSERT INTO "Project" (
  "id", "tenantIdentityKind", "tenantIdentity", "jiraProjectId",
  "jiraProjectKey", "jiraProjectName", "projectReadyAt",
  "testIssueTypeId", "testIssueTypeName", "projectStatuses", "foldersPulledAt",
  "createdAt", "updatedAt"
)
SELECT
  'project_' || md5(tenant.kind || ':' || tenant.identity || ':' || workspace."jiraProjectId"),
  tenant.kind::"TenantIdentityKind",
  tenant.identity,
  workspace."jiraProjectId",
  workspace."jiraProjectKey",
  workspace."jiraProjectName",
  workspace."projectReadyAt",
  COALESCE(workspace."testIssueTypeId", 'unknown'),
  COALESCE(workspace."testIssueTypeName", 'Unknown'),
  COALESCE(workspace."projectStatuses", '[]'::jsonb),
  workspace."foldersPulledAt",
  workspace."createdAt",
  workspace."updatedAt"
FROM "Workspace" workspace
CROSS JOIN LATERAL (
  SELECT
    CASE WHEN workspace."cloudId" IS NOT NULL THEN 'CLOUD_ID' ELSE 'SITE_ORIGIN' END AS kind,
    COALESCE(workspace."cloudId", lower(regexp_replace(workspace."siteOrigin", '/+$', ''))) AS identity
) tenant
WHERE workspace."jiraProjectId" IS NOT NULL
ON CONFLICT ("tenantIdentityKind", "tenantIdentity", "jiraProjectId") DO NOTHING;

INSERT INTO "WorkspaceProject" ("id", "workspaceId", "projectId", "verifiedAt", "createdAt")
SELECT
  'workspace_project_' || md5(workspace.id || ':' || project.id),
  workspace.id,
  project.id,
  COALESCE(workspace."projectReadyAt", CURRENT_TIMESTAMP),
  CURRENT_TIMESTAMP
FROM "Workspace" workspace
JOIN "Project" project
  ON project."jiraProjectId" = workspace."jiraProjectId"
 AND project."tenantIdentity" = COALESCE(workspace."cloudId", lower(regexp_replace(workspace."siteOrigin", '/+$', '')))
 AND project."tenantIdentityKind" = CASE WHEN workspace."cloudId" IS NOT NULL THEN 'CLOUD_ID'::"TenantIdentityKind" ELSE 'SITE_ORIGIN'::"TenantIdentityKind" END
WHERE workspace."jiraProjectId" IS NOT NULL
ON CONFLICT ("workspaceId", "projectId") DO NOTHING;

UPDATE "Workspace" workspace SET
  "jiraProjectKey" = project."jiraProjectKey",
  "jiraProjectId" = project."jiraProjectId",
  "jiraProjectName" = project."jiraProjectName",
  "projectReadyAt" = project."projectReadyAt",
  "testIssueTypeId" = project."testIssueTypeId",
  "testIssueTypeName" = project."testIssueTypeName",
  "projectStatuses" = project."projectStatuses",
  "foldersPulledAt" = project."foldersPulledAt"
FROM "WorkspaceProject" access
JOIN "Project" project ON project.id = access."projectId"
WHERE access."workspaceId" = workspace.id;

UPDATE "Folder" folder
SET "projectId" = project.id
FROM "Workspace" workspace
JOIN "Project" project
  ON project."jiraProjectId" = workspace."jiraProjectId"
 AND project."tenantIdentity" = COALESCE(workspace."cloudId", lower(regexp_replace(workspace."siteOrigin", '/+$', '')))
 AND project."tenantIdentityKind" = CASE WHEN workspace."cloudId" IS NOT NULL THEN 'CLOUD_ID'::"TenantIdentityKind" ELSE 'SITE_ORIGIN'::"TenantIdentityKind" END
WHERE folder."workspaceId" = workspace.id
  AND folder."jiraProjectId" = workspace."jiraProjectId";

UPDATE "TestCase" test_case
SET "projectId" = project.id
FROM "Workspace" workspace
JOIN "Project" project
  ON project."jiraProjectId" = workspace."jiraProjectId"
 AND project."tenantIdentity" = COALESCE(workspace."cloudId", lower(regexp_replace(workspace."siteOrigin", '/+$', '')))
 AND project."tenantIdentityKind" = CASE WHEN workspace."cloudId" IS NOT NULL THEN 'CLOUD_ID'::"TenantIdentityKind" ELSE 'SITE_ORIGIN'::"TenantIdentityKind" END
WHERE test_case."workspaceId" = workspace.id
  AND test_case."jiraProjectId" = workspace."jiraProjectId"
  AND test_case.origin = 'REMOTE';

UPDATE "TestCase" test_case
SET "ownerId" = workspace."ownerId"
FROM "Workspace" workspace
WHERE test_case."workspaceId" = workspace.id
  AND test_case.origin = 'IMPORT';

CREATE UNIQUE INDEX "Folder_projectId_path_key" ON "Folder"("projectId", "path") WHERE "projectId" IS NOT NULL;
CREATE UNIQUE INDEX "TestCase_projectId_issueId_key" ON "TestCase"("projectId", "issueId");
CREATE UNIQUE INDEX "TestCase_projectId_key_key" ON "TestCase"("projectId", "key");
CREATE INDEX "TestCase_ownerId_key_idx" ON "TestCase"("ownerId", "key");

ALTER TABLE "TestCaseDraft" ADD COLUMN "userId" TEXT;
ALTER TABLE "TestCaseDraft" ADD COLUMN "baseSummary" TEXT;
ALTER TABLE "TestCaseDraft" ADD COLUMN "baseLabels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "TestCaseDraft" ADD COLUMN "baseStatus" TEXT;
ALTER TABLE "TestCaseDraft" ADD COLUMN "baseGherkin" TEXT;
ALTER TABLE "TestCaseDraft" ADD COLUMN "baseRemoteUpdatedAt" TIMESTAMP(3);
ALTER TABLE "TestCaseDraft" ADD COLUMN "baseFingerprint" TEXT;
ALTER TABLE "TestCaseDraft" ADD COLUMN "baseAvailable" BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE "TestCaseDraft" draft
SET "userId" = workspace_owner.id,
    "baseSummary" = snapshot.summary,
    "baseLabels" = COALESCE(snapshot.labels, ARRAY[]::TEXT[]),
    "baseStatus" = snapshot.status,
    "baseGherkin" = snapshot.gherkin,
    "baseRemoteUpdatedAt" = snapshot."remoteUpdatedAt",
    "baseFingerprint" = snapshot.fingerprint,
    "baseAvailable" = snapshot.id IS NOT NULL
FROM "TestCase" test_case
JOIN "User" workspace_owner ON workspace_owner.id = COALESCE(test_case."ownerId", (
  SELECT w."ownerId" FROM "Workspace" w WHERE w.id = test_case."workspaceId"
))
LEFT JOIN "TestCaseSnapshot" snapshot ON snapshot."testCaseId" = test_case.id
WHERE draft."testCaseId" = test_case.id;

UPDATE "TestCaseDraft" draft SET "userId" = test_case."ownerId"
FROM "TestCase" test_case
WHERE draft."testCaseId" = test_case.id AND test_case."origin" = 'IMPORT';

ALTER TABLE "TestCaseDraft" ALTER COLUMN "userId" SET NOT NULL;
DROP INDEX "TestCaseDraft_testCaseId_key";
CREATE UNIQUE INDEX "TestCaseDraft_userId_testCaseId_key" ON "TestCaseDraft"("userId", "testCaseId");
CREATE INDEX "TestCaseDraft_testCaseId_idx" ON "TestCaseDraft"("testCaseId");

ALTER TABLE "WorkspaceProject" ADD CONSTRAINT "WorkspaceProject_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceProject" ADD CONSTRAINT "WorkspaceProject_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TestCase" ADD CONSTRAINT "TestCase_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TestCase" ADD CONSTRAINT "TestCase_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TestCaseDraft" ADD CONSTRAINT "TestCaseDraft_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP TRIGGER "Folder_lockWorkspace" ON "Folder";
DROP TRIGGER "TestCase_lockWorkspace" ON "TestCase";
DROP TRIGGER "TestCaseDraft_lockWorkspace" ON "TestCaseDraft";
DROP FUNCTION "lockFolderWorkspace"();
DROP FUNCTION "lockTestCaseWorkspace"();
DROP FUNCTION "lockDraftWorkspace"();

ALTER TABLE "Folder" DROP CONSTRAINT "Folder_workspaceId_fkey";
ALTER TABLE "TestCase" DROP CONSTRAINT "TestCase_workspaceId_fkey";
ALTER TABLE "Folder" ALTER COLUMN "workspaceId" DROP NOT NULL;
ALTER TABLE "Folder" ALTER COLUMN "jiraProjectId" DROP NOT NULL;
ALTER TABLE "TestCase" ALTER COLUMN "workspaceId" DROP NOT NULL;
ALTER TABLE "TestCase" ALTER COLUMN "jiraProjectId" DROP NOT NULL;

CREATE OR REPLACE FUNCTION "lockFolderProject"() RETURNS TRIGGER AS $$
DECLARE
  old_project_id TEXT;
  new_project_id TEXT;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_project_id := OLD."projectId"; END IF;
  IF TG_OP <> 'DELETE' THEN new_project_id := NEW."projectId"; END IF;
  PERFORM "id" FROM "Project" WHERE "id" IN (old_project_id, new_project_id) ORDER BY "id" FOR UPDATE;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "lockTestCaseProject"() RETURNS TRIGGER AS $$
DECLARE
  old_project_id TEXT;
  new_project_id TEXT;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_project_id := OLD."projectId"; END IF;
  IF TG_OP <> 'DELETE' THEN new_project_id := NEW."projectId"; END IF;
  PERFORM "id" FROM "Project" WHERE "id" IN (old_project_id, new_project_id) ORDER BY "id" FOR UPDATE;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "lockDraftProject"() RETURNS TRIGGER AS $$
DECLARE
  old_project_id TEXT;
  new_project_id TEXT;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    SELECT "projectId" INTO old_project_id FROM "TestCase" WHERE "id" = OLD."testCaseId";
  END IF;
  IF TG_OP <> 'DELETE' THEN
    SELECT "projectId" INTO new_project_id FROM "TestCase" WHERE "id" = NEW."testCaseId";
  END IF;
  PERFORM "id" FROM "Project" WHERE "id" IN (old_project_id, new_project_id) ORDER BY "id" FOR UPDATE;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Folder_lockProject" BEFORE INSERT OR UPDATE OR DELETE ON "Folder"
FOR EACH ROW EXECUTE FUNCTION "lockFolderProject"();
CREATE TRIGGER "TestCase_lockProject" BEFORE INSERT OR UPDATE OR DELETE ON "TestCase"
FOR EACH ROW EXECUTE FUNCTION "lockTestCaseProject"();
CREATE TRIGGER "TestCaseDraft_lockProject" BEFORE INSERT OR UPDATE OR DELETE ON "TestCaseDraft"
FOR EACH ROW EXECUTE FUNCTION "lockDraftProject"();

COMMIT;
