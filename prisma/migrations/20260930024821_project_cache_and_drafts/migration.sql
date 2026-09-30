-- CreateEnum
CREATE TYPE "TestCaseOrigin" AS ENUM ('REMOTE', 'IMPORT');

-- AlterTable
ALTER TABLE "JiraConnection" ALTER COLUMN "scopes" SET DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "Folder" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "jiraProjectId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentPath" TEXT,
    "remoteTestsCount" INTEGER NOT NULL DEFAULT 0,
    "pulledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Folder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestCase" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "jiraProjectId" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "testType" TEXT NOT NULL,
    "folderPath" TEXT,
    "origin" "TestCaseOrigin" NOT NULL DEFAULT 'REMOTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestCaseSnapshot" (
    "id" TEXT NOT NULL,
    "testCaseId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "labels" TEXT[],
    "status" TEXT NOT NULL,
    "gherkin" TEXT,
    "remoteUpdatedAt" TIMESTAMP(3),
    "fingerprint" TEXT NOT NULL,
    "pulledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestCaseSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestCaseDraft" (
    "id" TEXT NOT NULL,
    "testCaseId" TEXT NOT NULL,
    "summary" TEXT,
    "labels" JSONB,
    "status" TEXT,
    "gherkin" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestCaseDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Folder_workspaceId_jiraProjectId_idx" ON "Folder"("workspaceId", "jiraProjectId");

-- CreateIndex
CREATE UNIQUE INDEX "Folder_workspaceId_path_key" ON "Folder"("workspaceId", "path");

-- CreateIndex
CREATE INDEX "TestCase_workspaceId_jiraProjectId_idx" ON "TestCase"("workspaceId", "jiraProjectId");

-- CreateIndex
CREATE UNIQUE INDEX "TestCase_workspaceId_issueId_key" ON "TestCase"("workspaceId", "issueId");

-- CreateIndex
CREATE UNIQUE INDEX "TestCase_workspaceId_key_key" ON "TestCase"("workspaceId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "TestCaseSnapshot_testCaseId_key" ON "TestCaseSnapshot"("testCaseId");

-- CreateIndex
CREATE UNIQUE INDEX "TestCaseDraft_testCaseId_key" ON "TestCaseDraft"("testCaseId");

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestCase" ADD CONSTRAINT "TestCase_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestCaseSnapshot" ADD CONSTRAINT "TestCaseSnapshot_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestCaseDraft" ADD CONSTRAINT "TestCaseDraft_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
