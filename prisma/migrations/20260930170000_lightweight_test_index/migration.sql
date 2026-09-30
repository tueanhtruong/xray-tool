ALTER TABLE "TestCase" ALTER COLUMN "testType" DROP NOT NULL;
ALTER TABLE "TestCase" ADD COLUMN "summary" TEXT;

UPDATE "TestCase" AS test_case
SET "summary" = snapshot.summary
FROM "TestCaseSnapshot" AS snapshot
WHERE snapshot."testCaseId" = test_case.id;
