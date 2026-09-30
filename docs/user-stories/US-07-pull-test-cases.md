# US-07 — Pull test cases with last-synced snapshot

| Field      | Value                                             |
| ---------- | ------------------------------------------------- |
| Milestone  | M2 Read                                           |
| Depends on | US-06                                             |
| State      | tracked in [feature-list.json](feature-list.json) |

## User story

As a QA engineer, I want all test cases of my project cached locally together with an exact snapshot of their Xray state, so that I can edit quickly offline-from-Xray and later see precisely what I changed.

## Context

The snapshot is the **base** for diffs (US-15) and conflict detection (US-17). It must represent the remote state exactly as last pulled or synced.

## Scope

**In**

- Prisma models:
  - `TestCase` (workspace, `issueId`, `key`, `testType`, `folderPath`, `origin = REMOTE | IMPORT`, timestamps).
  - `TestCaseSnapshot` (testCase 1:1, `summary`, `labels[]`, `status`, `gherkin`, `remoteUpdatedAt`, `fingerprint`, `pulledAt`).
- `fingerprint` = SHA-256 of normalized `{summary, labels (sorted), status, gherkin (LF, trimmed)}` — shared function in `shared/fingerprint.ts`.
- Service `pullTests(workspaceId)`:
  - Xray `getTests(jql: "project = KEY", limit: 100, start)` paginated until done; fields: `issueId`, `testType { name kind }`, `gherkin`, `folder { path }`, `lastModified`, `jira(fields: ["key","summary","labels","status","updated"])`.
  - Upsert TestCase + TestCaseSnapshot; remove tests deleted in Xray (no drafts can exist yet — US-17 later refines this rule).
  - Runs folders pull first (US-06) in the same job.
  - Commits in one transaction; progress reported as `{ fetched, total }`.
- Non-Cucumber tests (Manual/Generic) are stored with `testType` and flagged read-only.
- `POST /api/pull` (full pull) with progress via polling `GET /api/pull/status` (or SSE — record decision).
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
    Then 250 test cases exist locally with snapshots
    And I see progress until "Pulled 250 tests, 12 folders"

  Scenario: Snapshot is exact
    Given test ONEDS-14043 in Xray has summary S, labels [a, b], status "Ready", gherkin G
    When I pull
    Then its snapshot has exactly S, [a, b], "Ready", G and a fingerprint

  Scenario: Fingerprint is stable
    Given the same test is pulled twice without remote change
    Then the fingerprint is identical

  Scenario: Manual tests are read-only
    Given a Manual test exists in Xray
    When I pull
    Then it is cached with testType "Manual" and marked read-only

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

- [ ] `docs/architecture.md` describes snapshot vs draft vs remote and the fingerprint
- [ ] GraphQL query file committed with the exact fields used
