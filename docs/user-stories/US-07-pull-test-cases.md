# US-07 — Pull test cases with last-synced snapshot

| Field      | Value                                             |
| ---------- | ------------------------------------------------- |
| Milestone  | M2 Read                                           |
| Depends on | US-06                                             |
| State      | tracked in [feature-list.json](feature-list.json) |

## User story

As a QA engineer, I want the repository index pulled without loading every test's full details, so I can browse large projects quickly and fetch exact Xray state only for tests I open or select for editing.

## Context

The snapshot is the **base** for diffs (US-15) and conflict detection (US-17). It is created or refreshed when a test is selected for editor work, not by a repository index pull.

## Scope

**In**

- Prisma models:
  - `TestCase` (workspace, `issueId`, `key`, `summary/name`, optional `testType`, `folderPath`, `origin = REMOTE | IMPORT`, timestamps).
  - `TestCaseSnapshot` (testCase 1:1, `summary`, `labels[]`, `status`, `gherkin`, `remoteUpdatedAt`, `fingerprint`, `pulledAt`).
- `fingerprint` = SHA-256 of normalized `{summary, labels (sorted), status, gherkin (LF, trimmed)}` — shared function in `shared/fingerprint.ts`.
- Service `pullTests(workspaceId)`:
  - Xray `getTests(projectId, limit: 100, start)` paginated until done; fields: `issueId`, `folder { path }`, and Jira `key` and `summary` only.
  - Upsert the lightweight TestCase index without creating or refreshing snapshots; remove tests deleted in Xray unless drafts require preserving the index/snapshot.
  - Runs folders pull first (US-06) in the same job.
  - Commits in one transaction; progress reported as `{ fetched, total }`.
- Full details (type, labels, status, Gherkin, remote update time) are fetched on every detail-view open without persistence; editor selections batch keys into one detail request of at most 100 tests.
- Editor selection fetches full details, fingerprints the normalized values, and creates or safely refreshes a snapshot; a changed remote state never replaces the existing baseline while a local draft exists.
- Test type is not part of the index and is identified as Cucumber/Manual/Generic only after details are fetched.
- `POST /api/pull` (index pull) with progress via polling `GET /api/pull/status`.
- Mock services: fixtures of 0, 5 and 1,000 tests including a Scenario Outline and a Manual test.

**Out**

- Incremental/delta pulls (full pull is acceptable for v1).
- Test steps of Manual tests (read-only display only, later).

## Acceptance criteria

```gherkin
Feature: Pull test cases

  Scenario: Pull all tests of the project
    Given Xray has 250 tests in project "ONEDS"
    When I click "Pull from Xray"
    Then 250 lightweight index entries exist locally without new snapshots or full-detail fields
    And I see progress until "Pulled 250 tests, 12 folders"

  Scenario: Pull avoids full detail fields
    Given test ONEDS-14043 in Xray has summary S, labels [a, b], status "Ready", gherkin G
    When I pull
    Then the index stores only its identity, key, name S, and folder
    And no snapshot is created by the pull

  Scenario: Opening details fetches current remote state
    When I open test ONEDS-14043
    Then its current summary, labels, status, type, and Gherkin are fetched from Xray
    And the fetched details are not persisted

  Scenario: Selecting a test creates a base snapshot
    Given a Manual test exists in Xray
    When I select it for the editor
    Then its full details are fetched and a snapshot is created
    And it is identified as read-only

  Scenario: Draft baseline survives remote change
    Given a selected test has a local draft and a prior snapshot
    And its current Xray details differ from that snapshot
    When I select it for the editor
    Then the existing snapshot and draft remain unchanged for conflict handling

  Scenario: Failed pull changes nothing
    Given Xray returns an error on page 3 of 5
    When I pull
    Then the local cache is unchanged and the error is actionable

  Scenario: Large project
    Given Xray has 1,000 tests
    When I pull against the mock
    Then the pull completes and the API response for GET /api/tests?limit=100 is under 300 ms
```

## Verification

1. Static: `pnpm check`
2. Runtime: `pnpm test:unit tests/unit/fingerprint.test.ts`, `pnpm test:int tests/integration/pull-tests.test.ts`
3. End-to-end: `pnpm test:e2e e2e/us-07-pull-tests.spec.ts`

## Story-specific done checks

- [x] `docs/architecture.md` describes snapshot vs draft vs remote and the fingerprint
- [x] GraphQL query file committed with the exact fields used
