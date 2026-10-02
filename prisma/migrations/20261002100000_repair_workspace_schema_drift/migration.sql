BEGIN;

-- Restore nullable legacy fields omitted from the live schema despite the
-- corresponding historical migrations being recorded as applied. IF NOT
-- EXISTS keeps this forward repair safe in databases whose schema is intact.
ALTER TABLE "Workspace"
  ADD COLUMN IF NOT EXISTS "jiraProjectKey" TEXT,
  ADD COLUMN IF NOT EXISTS "jiraProjectId" TEXT,
  ADD COLUMN IF NOT EXISTS "jiraProjectName" TEXT,
  ADD COLUMN IF NOT EXISTS "projectReadyAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "testIssueTypeId" TEXT,
  ADD COLUMN IF NOT EXISTS "testIssueTypeName" TEXT,
  ADD COLUMN IF NOT EXISTS "projectStatuses" JSONB,
  ADD COLUMN IF NOT EXISTS "foldersPulledAt" TIMESTAMP(3);

ALTER TABLE "Folder"
  ADD COLUMN IF NOT EXISTS "workspaceId" TEXT,
  ADD COLUMN IF NOT EXISTS "jiraProjectId" TEXT;

-- The legacy workspace project fields represented a single selection. Restore
-- them only when one verified project association makes the source unambiguous.
WITH single_project AS (
  SELECT "workspaceId", MIN("projectId") AS "projectId"
  FROM "WorkspaceProject"
  GROUP BY "workspaceId"
  HAVING COUNT(*) = 1
)
UPDATE "Workspace" AS workspace
SET "jiraProjectKey" = COALESCE(workspace."jiraProjectKey", project."jiraProjectKey"),
    "jiraProjectId" = COALESCE(workspace."jiraProjectId", project."jiraProjectId"),
    "jiraProjectName" = COALESCE(workspace."jiraProjectName", project."jiraProjectName"),
    "projectReadyAt" = COALESCE(workspace."projectReadyAt", project."projectReadyAt"),
    "testIssueTypeId" = COALESCE(workspace."testIssueTypeId", project."testIssueTypeId"),
    "testIssueTypeName" = COALESCE(workspace."testIssueTypeName", project."testIssueTypeName"),
    "projectStatuses" = COALESCE(workspace."projectStatuses", project."projectStatuses"),
    "foldersPulledAt" = COALESCE(workspace."foldersPulledAt", project."foldersPulledAt")
FROM single_project AS association
JOIN "Project" AS project ON project.id = association."projectId"
WHERE workspace.id = association."workspaceId";

-- Project identity is authoritative for every folder. A legacy workspace owner
-- is restored only when exactly one workspace remains associated with project;
-- otherwise preserve shared ownership and keep the nullable legacy field empty.
WITH single_workspace AS (
  SELECT "projectId", MIN("workspaceId") AS "workspaceId"
  FROM "WorkspaceProject"
  GROUP BY "projectId"
  HAVING COUNT(*) = 1
)
UPDATE "Folder" AS folder
SET "jiraProjectId" = COALESCE(folder."jiraProjectId", project."jiraProjectId"),
    "workspaceId" = COALESCE(folder."workspaceId", association."workspaceId")
FROM "Project" AS project
LEFT JOIN single_workspace AS association ON association."projectId" = project.id
WHERE folder."projectId" = project.id
  AND (folder."jiraProjectId" IS NULL OR folder."workspaceId" IS NULL);

COMMIT;
