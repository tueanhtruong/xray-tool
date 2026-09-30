# US-16 — Review changes before sync

| Field      | Value                                             |
| ---------- | ------------------------------------------------- |
| Milestone  | M4 Sync                                           |
| Depends on | US-13, US-15                                      |
| State      | tracked in [feature-list.json](feature-list.json) |

## User story

As a QA engineer, I want to see every pending change as an explicit diff and choose what to push, so that nothing reaches Xray without my confirmation.

## Scope

**In**

- `/review` page (also reachable from the repository toolbar button "Review N changes", added by US-09 to the US-08.1 toolbar; disabled when N = 0). Uses the US-08.1 design system and `/login?next=` route guard.
- Summary header: tests to update, tests to create, fields changed.
- Grouped list per test: key (or "New"), folder, changed fields; expand to see:
  - summary inline diff, label chips (+ green / − red), status before → after,
  - Gherkin unified or side-by-side diff with line numbers.
- Include/exclude checkbox per test; "select all / none"; filter by change type.
- Discard per test (deletes draft or local new test, with confirmation).
- "Sync N tests" opens a confirmation dialog: "Update X and create Y tests in project KEY?" — sync itself is triggered only after this dialog (implemented in US-18; here the button creates a `SyncBatch` in `PENDING` with the selected change set and the exact diff payload frozen).
- Empty state when there are no changes.

**Out**

- Conflict handling (US-17), executing the sync (US-18/US-19).

## Acceptance criteria

```gherkin
Feature: Diff review

  Scenario: Review shows every pending change
    Given 3 tests have drafts and 1 new test was imported
    When I open Review
    Then I see "3 to update, 1 to create"
    And each test lists exactly the fields that differ from its snapshot

  Scenario: Label and Gherkin diffs
    When I expand ONEDS-14043
    Then added labels are marked "+" and removed labels "−"
    And the Gherkin diff shows removed and added lines with line numbers

  Scenario: Exclude a test
    When I uncheck ONEDS-14044
    Then the sync confirmation counts exclude it and its draft remains

  Scenario: Discard a change
    When I discard ONEDS-14043 and confirm
    Then its draft is deleted and it disappears from Review

  Scenario: Frozen batch
    When I confirm "Sync"
    Then a SyncBatch is created with the selected tests and their diffs
    And later edits to drafts do not alter that batch

  Scenario: No changes
    Given there are no drafts
    Then Review shows "Everything is in sync with Xray"
```

## Verification

1. Static: `pnpm check`
2. Runtime: `pnpm test:int tests/integration/review-api.test.ts`
3. End-to-end: `pnpm test:e2e e2e/us-16-diff-review.spec.ts`

## Story-specific done checks

- [ ] Review UI renders diffs exclusively from `shared/diff` output (no second diff implementation)
