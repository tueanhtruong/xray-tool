# US-11 — Bulk actions across a selection

| Field      | Value                                             |
| ---------- | ------------------------------------------------- |
| Milestone  | M3 Edit                                           |
| Depends on | US-10                                             |
| State      | tracked in [feature-list.json](feature-list.json) |

## User story

As a QA engineer, I want to apply one change to many selected test cases at once, so that updating labels, statuses or wording across a suite is a single action.

## Scope

**In**

- Row selection in the grid: checkbox, Shift+click range, "select all matching filter" (not only visible rows).
- Bulk actions (all produce drafts, never remote writes):
  - Add labels, remove labels, rename a label.
  - Set status.
  - Find & replace in summary and/or Gherkin — plain text or regex, case toggle.
- Preview before apply: number of tests affected and a sample of up to 5 before/after values; regex errors shown inline.
- Apply runs server-side in one transaction (`POST /api/drafts/bulk`), reusing the draft rule from US-10 (no-op changes create no drafts).
- Undo the whole bulk action in one step.
- Read-only tests in the selection are skipped and reported ("2 read-only tests skipped").
- Regex safety: execution time limit per test (e.g. use `re2` or a timeout) to prevent ReDoS.

**Out**

- Moving tests between folders.

## Acceptance criteria

```gherkin
Feature: Bulk actions

  Scenario: Add a label to many tests
    Given I selected 40 tests
    When I add label "regression" and confirm
    Then all 40 tests show "regression" as an added label
    And tests that already had it are not counted as changed

  Scenario: Remove a label
    When I remove label "need-review" from the selection
    Then only tests that had it get a draft

  Scenario: Set status
    When I set status "Ready" for 10 tests
    Then 10 drafts contain status "Ready"

  Scenario: Find and replace with preview
    When I replace "Storybook" with "Docs site" in Gherkin
    Then the preview shows the number of affected tests and sample diffs
    When I apply
    Then drafts contain the replaced Gherkin

  Scenario: Invalid regex
    When I enter regex "("
    Then I see "Invalid regular expression" and Apply is disabled

  Scenario: Undo a bulk action
    Given I applied a bulk label change to 40 tests
    When I click Undo
    Then all 40 drafts return to their previous state

  Scenario: Select all matching filter
    Given the filter matches 1,200 tests but only 50 are visible
    When I choose "Select all 1,200"
    Then the bulk action applies to all 1,200 tests
```

## Verification

1. Static: `pnpm check`
2. Runtime: `pnpm test:unit tests/unit/bulk-actions`, `pnpm test:int tests/integration/bulk-drafts.test.ts`
3. End-to-end: `pnpm test:e2e e2e/us-11-bulk-actions.spec.ts`

## Story-specific done checks

- [ ] Bulk logic lives in `shared/bulk-actions/` as pure functions with unit tests
