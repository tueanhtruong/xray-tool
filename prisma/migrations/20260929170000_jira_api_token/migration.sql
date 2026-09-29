-- Add API-token Jira connections while preserving existing OAuth identity and rows.
ALTER TYPE "AuthMethod" ADD VALUE 'API_TOKEN';

ALTER TABLE "Workspace"
  ALTER COLUMN "cloudId" DROP NOT NULL,
  ADD COLUMN "siteOrigin" TEXT;

UPDATE "Workspace"
SET "siteOrigin" = regexp_replace(lower("siteUrl"), '/+$', '');

ALTER TABLE "Workspace"
  ALTER COLUMN "siteOrigin" SET NOT NULL;

CREATE UNIQUE INDEX "Workspace_ownerId_siteOrigin_key"
  ON "Workspace"("ownerId", "siteOrigin");

ALTER TABLE "JiraConnection"
  ALTER COLUMN "accessToken" DROP NOT NULL,
  ALTER COLUMN "refreshToken" DROP NOT NULL,
  ALTER COLUMN "expiresAt" DROP NOT NULL,
  ADD COLUMN "apiToken" TEXT,
  ADD COLUMN "apiEmail" TEXT,
  ADD COLUMN "tokenSavedAt" TIMESTAMP(3);

CREATE TABLE "ApiTokenSignInAttempt" (
  "id" TEXT NOT NULL,
  "ipHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApiTokenSignInAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ApiTokenSignInAttempt_ipHash_createdAt_idx"
  ON "ApiTokenSignInAttempt"("ipHash", "createdAt");
