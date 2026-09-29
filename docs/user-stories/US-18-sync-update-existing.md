# US-18 — Sync edits of existing tests to Xray/Jira

| Field      | Value                                             |
| ---------- | ------------------------------------------------- |
| Milestone  | M4 Sync                                           |
| Depends on | US-17                                             |
| State      | tracked in [feature-list.json](feature-list.json) |

## User story

As a QA engineer, I want my confirmed changes pushed to Xray and Jira reliably, with a clear per-test result, so that the remote test repository matches what I reviewed.

## Context

Executes a `SyncBatch` created in US-16. Writes are split by system: summary/labels via Jira REST, status via Jira transitions, Gherkin via Xray `updateGherkinTestDefinition` (see [refer/cucumber-bdd-test-suite/api/update/update-gherkin.graphql](../../refer/cucumber-bdd-test-suite/api/update/update-gherkin.graphql)). Operations come from `toSyncPlan` (US-15).

## Scope

**In**

- Prisma: `SyncBatch` (status `PENDING | RUNNING | COMPLETED | PARTIAL | FAILED`), `SyncItem` (test, frozen diff, plan, status, per-operation results, error message, requestId).
- Sync job (server-side, survives the browser closing):
  1. Mark batch `RUNNING`; one running batch per workspace.
  2. Conflict pre-check (US-17) for all items immediately before writing; conflicted items → `SKIPPED_CONFLICT`.
  3. For each item (concurrency limit, e.g. 4):
     - `PUT /rest/api/3/issue/{key}` with changed `summary` / `labels`.
     - Status: `GET transitions` → find transition to target status → `POST transitions`; no path → item error "No workflow transition from X to Y".
     - Gherkin: Xray `updateGherkinTestDefinition(issueId, gherkin)`.
  4. Re-fetch the test from Xray → write new snapshot; clear only the draft fields that succeeded.
  5. Record per-operation result; batch ends `COMPLETED`, `PARTIAL` or `FAILED`.
- Retries: 429/5xx with backoff (US-04 client); 4xx not retried.
- Idempotent re-run: re-running a `PARTIAL` batch recomputes the diff and sends only remaining changes.
- Progress UI: live counters and per-test status; final summary with links to failed items.
- Structured logs per operation (no payload secrets).

**Out**

- Creating new tests (US-19), history UI (US-20).

## Acceptance criteria

```gherkin
Feature: Sync existing tests

  Scenario: Successful sync of mixed field changes
    Given a confirmed batch updating summary and labels of ONEDS-14043 and Gherkin of ONEDS-14044
    When the sync runs
    Then Jira receives one issue update for ONEDS-14043
    And Xray receives updateGherkinTestDefinition for ONEDS-14044
    And both tests have new snapshots and no drafts
    And the batch is COMPLETED

  Scenario: Status change via workflow transition
    Given a draft status "Ready" and a transition to "Ready" exists
    When the sync runs
    Then the transition is executed and the snapshot status is "Ready"

  Scenario: Missing transition
    Given no transition leads to the target status
    When the sync runs
    Then that item fails with "No workflow transition from Draft to Ready" and its status draft remains

  Scenario: Partial failure keeps unsent changes
    Given the Gherkin update of ONEDS-14044 fails with 400
    When the sync runs
    Then ONEDS-14044 keeps its Gherkin draft, other items succeed, and the batch is PARTIAL

  Scenario: Re-run sends only what is left
    Given a PARTIAL batch
    When I retry it
    Then only the previously failed operations are sent

  Scenario: Conflict detected at sync time
    Given ONEDS-14043 changed in Xray after the batch was confirmed
    When the sync runs
    Then ONEDS-14043 is SKIPPED_CONFLICT and nothing is written for it

  Scenario: Only one sync at a time
    Given a batch is RUNNING
    When I start another sync
    Then I am told a sync is already in progress
```

## Verification

1. Static: `pnpm check`
2. Runtime: `pnpm test:int tests/integration/sync-update.test.ts` (asserts exact requests received by mock services)
3. End-to-end: `pnpm test:e2e e2e/us-18-sync-update.spec.ts`

## Story-specific done checks

- [ ] Mock services record every write; tests assert request count and payloads, not just UI
- [ ] `docs/integrations/jira.md` documents the fields and transition flow used
