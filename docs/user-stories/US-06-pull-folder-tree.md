# US-06 — Pull Xray folder tree into local cache

| Field      | Value                                             |
| ---------- | ------------------------------------------------- |
| Milestone  | M2 Read                                           |
| Depends on | US-05                                             |
| State      | tracked in [feature-list.json](feature-list.json) |

## User story

As a QA engineer, I want the Xray Test Repository folder structure available locally, so that I can navigate and organize test cases the same way my team does in Xray.

## Context

Xray is the source of truth. Folder data is fetched via GraphQL `getFolder(projectId, path)` (see [refer/cucumber-bdd-test-suite/api/create/get-folder.graphql](../../refer/cucumber-bdd-test-suite/api/create/get-folder.graphql)) and cached in Postgres for fast browsing.

## Scope

**In**

- Prisma model `Folder` (workspace, `path` unique per workspace, name, parentPath, `remoteTestsCount`, `pulledAt`).
- Service `pullFolders(workspaceId)`: fetches the full tree from `/`, upserts folders, deletes folders no longer in Xray — **in a single transaction** (all or nothing).
- `Workspace.foldersPulledAt` timestamp.
- `POST /api/pull/folders` and `GET /api/folders` (tree JSON).
- Pull is idempotent: running twice with no remote change produces no DB writes after the first.
- Only one pull per workspace at a time (second request gets 409 with "A pull is already running").
- Mock services: folder tree fixtures (empty, flat, deep 6 levels, 500 folders).

**Out**

- Creating, renaming or moving folders in Xray.
- UI tree (US-08) — this story exposes the API only, plus a minimal "Pull folders" button with result counts.

## Acceptance criteria

```gherkin
Feature: Pull folder tree

  Scenario: First pull
    Given the Xray project has folders "/Autocomplete" and "/Autocomplete/Focus"
    When I pull folders
    Then both folders exist locally with correct parent relationships
    And I see "Pulled 2 folders"

  Scenario: Remote deletion is reflected
    Given folder "/Old" exists locally but no longer exists in Xray
    When I pull folders
    Then "/Old" is removed locally

  Scenario: Failure leaves cache untouched
    Given Xray fails midway through the pull
    When I pull folders
    Then the local folder cache is exactly as before
    And I see an actionable error with the request ID

  Scenario: Idempotent pull
    Given I pulled folders and nothing changed in Xray
    When I pull again
    Then no folder rows are updated

  Scenario: Concurrent pulls are rejected
    Given a pull is running
    When I start another pull
    Then I get "A pull is already running"
```

## Verification

1. Static: `pnpm check`
2. Runtime: `pnpm test:int tests/integration/pull-folders.test.ts`
3. End-to-end: `pnpm test:e2e e2e/us-06-pull-folders.spec.ts`

## Story-specific done checks

- [ ] Pull emits structured log events: start, counts (created/updated/deleted), duration, requestId
