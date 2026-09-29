# US-20 — Sync history & audit log

| Field      | Value                                             |
| ---------- | ------------------------------------------------- |
| Milestone  | M4 Sync                                           |
| Depends on | US-18                                             |
| State      | tracked in [feature-list.json](feature-list.json) |

## User story

As a QA lead, I want a history of every sync with exactly what was changed and what failed, so that I can audit changes and recover from mistakes.

## Scope

**In**

- `/history` page listing SyncBatches: started/finished time, user, project, counts (updated, created, failed, skipped), final status.
- Batch detail: each SyncItem with its frozen diff (rendered by the US-16 components), per-operation results, error messages, requestId.
- Actions: "Retry failed items" (re-enters Review with those items preselected, goes through conflict check); "Export batch as Markdown" (the "after" state of the batch, via US-14 builder).
- Import history (`ImportBatch` from US-13) shown in the same timeline.
- Filters: date range, status, test key.
- Retention: keep 180 days by default (configurable); cleanup job is idempotent.
- Audit data contains no secrets, tokens or raw upstream response bodies.

**Out**

- Automatic rollback of a batch to previous values (manual via export/import is acceptable in v1).

## Acceptance criteria

```gherkin
Feature: Sync history

  Scenario: Batch appears in history
    Given I completed a sync of 5 tests
    When I open History
    Then I see the batch with "5 updated, 0 failed" and my name

  Scenario: Inspect what changed
    When I open the batch detail
    Then each test shows the exact diff that was applied

  Scenario: Retry failed items
    Given a PARTIAL batch with 2 failed items
    When I click "Retry failed items"
    Then Review opens with those 2 tests preselected

  Scenario: Search by test
    When I filter history by "ONEDS-14043"
    Then only batches containing that test are listed

  Scenario: Retention cleanup is idempotent
    Given batches older than the retention period exist
    When the cleanup job runs twice
    Then they are deleted once and the second run changes nothing

  Scenario: No secrets in audit data
    When I scan all stored SyncItem results
    Then no token, client secret or Authorization header is present
```

## Verification

1. Static: `pnpm check`
2. Runtime: `pnpm test:int tests/integration/history.test.ts`
3. End-to-end: `pnpm test:e2e e2e/us-20-history.spec.ts`
