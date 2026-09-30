# US-08 — Browse the cached Test Repository

| Field      | Value                                             |
| ---------- | ------------------------------------------------- |
| Milestone  | M2 Read                                           |
| Depends on | US-07                                             |
| State      | tracked in [feature-list.json](feature-list.json) |

> **UI superseded by [US-08.1](US-08.1-ui-redesign.md):** the page layout adopts the XrayBulk design; the detail drawer becomes the `/tests/:key` page and the "Open N selected in editor" stub becomes "Open in editor" (one selected test). Data, query, and safety behavior below is unchanged.

## User story

As a QA engineer, I want to browse folders and test cases like in Xray's Test Repository, so that I can find and select the tests I want to work on.

## Scope

**In**

- `/repository` page: folder tree (left) and test list (right).
- Folder tree: expand/collapse, test counts, keyboard navigable, remembers expanded state per workspace (localStorage).
- Test list columns: key, name/summary, and folder.
- Search by key or name/summary; toggle "include subfolders".
- Server-side pagination/virtualized list; URL reflects folder + search (shareable, back-button safe).
- Header shows "Last pulled <relative time>" and a "Pull from Xray" button (US-07) with progress.
- Detail drawer: fetches fresh Xray details on every open and displays summary, labels, status, type and syntax-highlighted Gherkin without persisting the response.
- "Open in Jira" link: `target="_blank" rel="noopener noreferrer"`, URL built from stored site, never from user input.
- Row selection (checkbox) with "Open N selected in editor" action (target page stubbed until US-09).
- Empty states: not pulled yet, empty folder, no search results.

**Out**

- Editing (US-09+).

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

  Scenario: Deep link
    Given I searched by name in a folder
    When I reload the page
    Then the same folder and search are applied

  Scenario: Read-only detail
    When I open test ONEDS-14043
    Then fresh Xray details are fetched and I see its Gherkin with syntax highlighting and no edit controls
    And the detail response is not persisted

  Scenario: Lightweight test list
    When I browse tests before opening them
    Then I see only each test's key, name, and folder

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
3. End-to-end: `pnpm test:e2e e2e/us-08-repository-browser.spec.ts`

## Story-specific done checks

- [x] No `v-html` on user/Xray-provided content (lint rule `vue/no-v-html` enabled)
- [x] Axe accessibility check in the e2e spec has no serious violations
