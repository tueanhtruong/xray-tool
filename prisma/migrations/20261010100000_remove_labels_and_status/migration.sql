-- US-09.1: remove labels and status. Fingerprint version 2 covers summary and Gherkin only.

CREATE FUNCTION "fingerprint_v2"(summary_value text, gherkin_value text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(
    sha256(convert_to(
      '{"version":2,"summary":'
        || to_json(btrim(summary_value, E' \t\n\r\f\v'))::text
        || ',"gherkin":'
        || COALESCE(
          to_json(btrim(replace(replace(gherkin_value, E'\r\n', E'\n'), E'\r', E'\n'), E' \t\n\f\v'))::text,
          'null'
        )
        || '}',
      'UTF8'
    )),
    'hex'
  )
$$;

DO $$
DECLARE
  deleted_drafts integer;
  changed_drafts integer;
BEGIN
  DELETE FROM "TestCaseDraft"
  WHERE "summary" IS NULL
    AND "gherkin" IS NULL
    AND ("labels" IS NOT NULL OR "status" IS NOT NULL);
  GET DIAGNOSTICS deleted_drafts = ROW_COUNT;

  SELECT count(*) INTO changed_drafts
  FROM "TestCaseDraft"
  WHERE "labels" IS NOT NULL OR "status" IS NOT NULL;

  RAISE NOTICE 'US-09.1 migration: deleted % label/status-only drafts, changed % drafts', deleted_drafts, changed_drafts;
END $$;

ALTER TABLE "TestCaseDraft"
  DROP COLUMN "labels",
  DROP COLUMN "status",
  DROP COLUMN "baseLabels",
  DROP COLUMN "baseStatus";

ALTER TABLE "TestCaseSnapshot"
  DROP COLUMN "labels",
  DROP COLUMN "status";

UPDATE "TestCaseSnapshot"
SET "fingerprint" = "fingerprint_v2"("summary", "gherkin");

UPDATE "TestCaseDraft"
SET "baseFingerprint" = "fingerprint_v2"("baseSummary", "baseGherkin")
WHERE "baseSummary" IS NOT NULL AND "baseFingerprint" IS NOT NULL;

DROP FUNCTION "fingerprint_v2"(text, text);
