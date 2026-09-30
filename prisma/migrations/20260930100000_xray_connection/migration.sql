-- Add workspace-scoped Xray credentials and an encrypted JWT cache.
CREATE TYPE "XrayRegion" AS ENUM ('GLOBAL', 'US', 'EU', 'AU');

CREATE TABLE "XrayConnection" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "region" "XrayRegion" NOT NULL DEFAULT 'GLOBAL',
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT NOT NULL,
    "jwt" TEXT,
    "jwtExpiresAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3) NOT NULL,
    "configuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "XrayConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "XrayConnection_workspaceId_key" ON "XrayConnection"("workspaceId");

ALTER TABLE "XrayConnection"
    ADD CONSTRAINT "XrayConnection_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
