# US-15 — Field-level diff engine (library)

| Field      | Value                                             |
| ---------- | ------------------------------------------------- |
| Milestone  | M4 Sync                                           |
| Depends on | US-07                                             |
| State      | tracked in [feature-list.json](feature-list.json) |

## User story

As a QA engineer, I want every local change computed as an exact field-level diff against the last-synced snapshot, so that what I review is precisely what will be written to Xray.

## Context

Pure library in `shared/diff/`. It is the single source for the review UI (US-16), conflict detection (US-17), sync payloads (US-18/US-19) and the audit log (US-20). One implementation avoids "UI shows X, sync sends Y" defects (Lecture 10: interface mismatches).

## Scope

**In**

- `computeChange(snapshot | null, draft) → TestCaseChange` where:
  - `kind`: `update` | `create` | `none`
  - `fields`: `summary` (before/after + inline text diff), `labels` (`added[]`, `removed[]`), `status` (before/after), `gherkin` (unified line diff with hunks).
- Normalization before comparing: CRLF → LF, trailing whitespace trimmed, labels de-duplicated and sorted; normalization shared with `shared/fingerprint.ts`.
- `computeBatch(changes[])` → totals (tests, fields, creates) for UI summaries.
- `toSyncPlan(change)` → ordered list of remote operations, e.g. `jira.updateFields{summary,labels}`, `jira.transition{status}`, `xray.updateGherkin`, `xray.createTest`. The plan is data, not side effects.
- Deterministic output (stable ordering) so snapshot tests are reliable.

**Out**

- Three-way merge (US-17 builds on this).

## Acceptance criteria

```gherkin
Feature: Diff engine

  Scenario: Summary change
    Given snapshot summary "A" and draft summary "B"
    Then the change has kind "update" and a summary field diff A → B

  Scenario: Labels as sets
    Given snapshot labels [x, y] and draft labels [y, z]
    Then labels added = [z] and removed = [x]

  Scenario: Whitespace-only change is not a change
    Given draft Gherkin equals the snapshot except CRLF line endings and trailing spaces
    Then the change kind is "none"

  Scenario: Gherkin line diff
    Given one step line differs
    Then the gherkin diff has exactly one hunk with one removed and one added line

  Scenario: Create
    Given no snapshot and a draft with all fields
    Then the change kind is "create" and the sync plan starts with xray.createTest

  Scenario: Sync plan matches the diff
    Given a change of summary and status only
    Then the plan contains jira.updateFields(summary) and jira.transition(status) and nothing for gherkin
```

## Verification

1. Static: `pnpm check`
2. Runtime: `pnpm test:unit tests/unit/diff`
3. End-to-end: n/a (pure library; exercised by US-16/US-18/US-21)

## Story-specific done checks

- [ ] Line coverage ≥ 90% for `shared/diff`
- [ ] Property test: `computeChange(s, s)` is always `none`
