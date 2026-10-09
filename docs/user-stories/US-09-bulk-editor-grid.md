# US-09 — Bulk editor grid with local drafts

| Field      | Value                                             |
| ---------- | ------------------------------------------------- |
| Milestone  | M3 Edit                                           |
| Depends on | US-08.2                                           |
| State      | tracked in [feature-list.json](feature-list.json) |

## User story

As a QA engineer, I want to edit many test cases in a spreadsheet-like grid, so that coordinated changes take minutes instead of one-by-one edits in Xray.

## Context

Edits are **local drafts only**. Nothing is written to Xray until the diff-review and sync stories (US-16 → US-18). Drafts are stored server-side so they survive reloads and devices.

## Scope

**In**

- Prisma model `TestCaseDraft` (user/testCase 1:1, nullable edit fields `summary`, `labels[]`, `status`, `gherkin`, plus an immutable normalized base snapshot/fingerprint and `updatedAt`). A null edit field means "unchanged". The same testcase may have independent drafts for multiple users.
- Draft rule: if every draft field equals the snapshot, the draft row is deleted (no phantom changes).
- The grid lives in the `/repository` page built in [US-08.1](US-08.1-ui-redesign.md) (there is no separate `/editor` page), following the XrayBulk design tokens and [refer/template](../../refer/template/UI-SPEC.md) §5. Adds the header "N drafts" chip (slot reserved by US-08.1), the toolbar button "Review N changes" (disabled when N = 0; it navigates to the US-16 review page once that exists), the warning dot before drafted keys, and the footer note "Edits are saved as local drafts. Nothing is written to Xray until you review and sync."
- Grid (virtualized, 1,000 rows smooth) with columns: select, key (link to `/tests/:key`), summary ✎, labels ✎ (chips), status ✎, folder, Gherkin preview (opens US-12 editor later; read-only here). Labels and status load with test details (the US-07 index does not cache them).
- `/tests/:key` gains the editable details card (summary, status, labels, `Undo all`) using the same draft rules.
- Status options = statuses available for the Test issue type (from US-05 metadata).
- Keyboard: arrows move, Enter/F2 edit, Esc cancel, Tab next cell, Ctrl/Cmd+Z / Shift+Z undo/redo within the session.
- Changed cells highlighted; row "Revert" button; toolbar badge "N tests changed".
- Autosave: debounced (e.g. 500 ms) `PUT /api/drafts/:testCaseId`; save indicator (saving / saved / error with retry).
- Validation: summary required, ≤ 255 chars; labels must not contain spaces; invalid cells block save and show the reason.
- Read-only (Manual/Generic) rows are visibly locked.

**Out**

- Multi-row bulk actions (US-10), Gherkin editing (US-12).

## Acceptance criteria

```gherkin
Feature: Bulk editor grid

  Scenario: Edit summary inline
    Given 3 tests are shown in the repository grid
    When I change the summary of ONEDS-14043 and press Enter
    Then the cell is highlighted as changed
    And a draft is saved for ONEDS-14043
    And nothing is sent to Xray or Jira

  Scenario: Drafts survive reload
    Given I edited labels of 2 tests
    When I reload the page
    Then both edits are still shown as changed

  Scenario: Editing back to the original removes the draft
    Given I changed a summary
    When I type the original summary again
    Then the cell is no longer marked changed and no draft exists

  Scenario: Invalid label
    When I add the label "needs review"
    Then I see "Jira labels cannot contain spaces" and the draft is not saved

  Scenario: Undo
    Given I changed the status of a test
    When I press Cmd+Z
    Then the previous status is restored and the draft is updated

  Scenario: Read-only tests
    Given a Manual test is in the grid
    Then its cells are not editable

  Scenario: Keyboard-only editing
    When I navigate and edit cells using only the keyboard
    Then all editable cells are reachable and editable
```

## Verification

1. Static: `pnpm check`
2. Runtime: `pnpm test:unit tests/unit/draft-rules.test.ts tests/unit/draft-grid-window.test.ts`, `pnpm test:int tests/integration/project-cache.test.ts tests/integration/tests-query-api.test.ts`
3. End-to-end regression: `pnpm test:e2e e2e/us-08-repository-browser.spec.ts` (existing repository spec; no separate US-09 spec)

## Story-specific done checks

- [ ] Integration assertion: mock services received zero write requests during draft editing operations
