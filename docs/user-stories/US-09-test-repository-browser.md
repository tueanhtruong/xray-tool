# US-09 — Browse the cached Test Repository

| Field      | Value                                             |
| ---------- | ------------------------------------------------- |
| Milestone  | M2 Read                                           |
| Depends on | US-08                                             |
| State      | tracked in [feature-list.json](feature-list.json) |

## User story

As a QA engineer, I want to browse folders and test cases like in Xray's Test Repository, so that I can find and select the tests I want to work on.

## Scope

**In**

- `/repository` page: folder tree (left) and test list (right).
- Folder tree: expand/collapse, test counts, keyboard navigable, remembers expanded state per workspace (localStorage).
- Test list columns: key, summary, labels, status, folder, test type, read-only badge.
- Search by key, summary text, or label; filter by status, label, test type; toggle "include subfolders".
- Server-side pagination/virtualized list; URL reflects folder + filters (shareable, back-button safe).
- Header shows "Last pulled <relative time>" and a "Pull from Xray" button (US-08) with progress.
- Detail drawer: read-only view of summary, labels, status and syntax-highlighted Gherkin.
- "Open in Jira" link: `target="_blank" rel="noopener noreferrer"`, URL built from stored site, never from user input.
- Row selection (checkbox) with "Open N selected in editor" action (target page stubbed until US-10).
- Empty states: not pulled yet, empty folder, no search results.

**Out**

- Editing (US-10+).

## Acceptance criteria

```gherkin
Feature: Browse test repository

  Scenario: Navigate folders
    Given tests have been pulled
    When I click folder "/Autocomplete"
    Then I see only tests in that folder
    When I enable "include subfolders"
    Then tests from "/Autocomplete/Focus" also appear

  Scenario: Search
    When I search "ONEDS-14043"
    Then exactly that test is listed

  Scenario: Filter by label
    When I filter by label "need-review"
    Then only tests having that label are listed

  Scenario: Deep link
    Given I filtered by folder and label
    When I reload the page
    Then the same folder and filters are applied

  Scenario: Read-only detail
    When I open test ONEDS-14043
    Then I see its Gherkin with syntax highlighting and no edit controls

  Scenario: Content is rendered safely
    Given a test summary contains "<img src=x onerror=alert(1)>"
    When the list renders
    Then the text is shown literally and no script runs

  Scenario: Never pulled
    Given the workspace has never been pulled
    When I open the repository
    Then I see a call to action "Pull from Xray"
```

## Verification

1. Static: `pnpm check`
2. Runtime: `pnpm test:int tests/integration/tests-query-api.test.ts`
3. End-to-end: `pnpm test:e2e e2e/us-09-repository-browser.spec.ts`

## Story-specific done checks

- [ ] No `v-html` on user/Xray-provided content (lint rule `vue/no-v-html` enabled)
- [ ] Axe accessibility check in the e2e spec has no serious violations
