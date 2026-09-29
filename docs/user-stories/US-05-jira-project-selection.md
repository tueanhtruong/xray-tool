# US-05 — Select Jira/Xray project for the workspace

| Field      | Value                                             |
| ---------- | ------------------------------------------------- |
| Milestone  | M1 Connect                                        |
| Depends on | US-03, US-04                                      |
| State      | tracked in [feature-list.json](feature-list.json) |

## User story

As a QA engineer, I want to choose which Jira project my workspace manages, so that pulls, edits and syncs are scoped to the right Xray Test Repository.

## Context

Xray GraphQL uses the numeric Jira project ID (see [refer/cucumber-bdd-test-suite/api/map_id/get-project-id.graphql](../../refer/cucumber-bdd-test-suite/api/map_id/get-project-id.graphql) and `lookup-project-id.js`). This story resolves and stores it, and confirms both Jira and Xray can access the project before any data is pulled.

## Scope

**In**

- Onboarding checklist on workspace home: Jira connected ✓ → Xray connected ✓ → Project selected.
- `GET /api/jira/projects?query=` → Jira `project/search` (paginated, searchable).
- Selecting a project stores `projectKey`, `projectId`, `projectName` on the Workspace.
- Readiness probe after selection: Xray `getFolder(projectId, path: "/")` succeeds → "Ready"; otherwise an actionable error.
- Fetch and cache project metadata needed later: issue type "Test" exists, available statuses for the Test issue type.
- Changing project later: blocked while unsynced local drafts exist (message tells the user to sync or discard); otherwise confirmation, then local cache for the old project is cleared.

**Out**

- Managing multiple projects in one workspace simultaneously.

## Acceptance criteria

```gherkin
Feature: Project selection

  Scenario: Select a project
    Given Jira and Xray are connected
    When I search "ONEDS" and pick project "ONEDS"
    Then the workspace stores the project key and numeric project ID
    And the onboarding checklist shows "Ready"

  Scenario: Xray cannot access the project
    Given the Xray API key has no access to project "ABC"
    When I pick project "ABC"
    Then I see "Xray cannot access project ABC. Check the API key's project permissions in Xray settings."
    And the project is not saved as ready

  Scenario: Project without a Test issue type
    When I pick a project that has no "Test" issue type
    Then I see that Xray is not enabled for that project

  Scenario: Changing project with pending drafts is blocked
    Given the workspace has unsynced drafts
    When I try to change the project
    Then I am told to sync or discard drafts first

  Scenario: Protected pages require a ready workspace
    Given no project is selected
    When I open the test repository page
    Then I am redirected to the onboarding checklist
```

## Verification

1. Static: `pnpm check`
2. Runtime: `pnpm test:int tests/integration/project-selection.test.ts`
3. End-to-end: `pnpm test:e2e e2e/us-05-project-selection.spec.ts`

## Story-specific done checks

- [ ] The "pending drafts" guard is implemented as a service function reused later (drafts table may still be empty)
