ALTER TABLE "Workspace"
ADD COLUMN "jiraProjectKey" TEXT,
ADD COLUMN "jiraProjectId" TEXT,
ADD COLUMN "jiraProjectName" TEXT,
ADD COLUMN "projectReadyAt" TIMESTAMP(3),
ADD COLUMN "testIssueTypeId" TEXT,
ADD COLUMN "testIssueTypeName" TEXT,
ADD COLUMN "projectStatuses" JSONB;
