/*
  Warnings:

  - Added the required column `accessExpiresAt` to the `PendingOAuthGrant` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "PendingOAuthGrant" ADD COLUMN     "accessExpiresAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "scopes" TEXT[];
