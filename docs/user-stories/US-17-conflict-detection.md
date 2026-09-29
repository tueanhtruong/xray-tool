# US-17 — Detect and resolve remote conflicts

| Field      | Value                                             |
| ---------- | ------------------------------------------------- |
| Milestone  | M4 Sync                                           |
| Depends on | US-16                                             |
| State      | tracked in [feature-list.json](feature-list.json) |

## User story

As a QA engineer, I want to be warned when a test changed in Xray after my last pull, so that I never silently overwrite a colleague's edits.

## Context

Three versions exist per test: **base** (snapshot), **remote** (current Xray state), **local** (draft). A conflict exists when remote ≠ base (fingerprint mismatch) _and_ the same field changed on both sides.

## Scope

**In**

- `refreshRemote(testCaseIds)` fetches current remote state for specific tests (batched GraphQL `getTests` by issue IDs) and computes fingerprints.
- Three-way classification per test (pure function in `shared/merge/`):
  - remote unchanged → **clean**.
  - remote changed, disjoint fields vs local → **auto-rebase**: snapshot updated to remote, draft kept; labels merged as sets when both sides changed different labels.
  - same field changed both sides with different values → **conflict** for that field.
  - remote deleted → **deleted remotely**.
- Triggers: "Check for remote changes" button on Review; automatically when a SyncBatch starts (US-18) and after every pull.
- Pull rule update (extends US-08): pull never overwrites a draft; tests with drafts go through the same three-way logic.
- Conflict UI: per conflicted field show Base / Xray now / Mine; choose "Keep mine" or "Take Xray" (and for Gherkin, edit a merged result in the US-12 editor).
- Conflicted or remotely deleted tests cannot be included in a sync until resolved; resolution updates snapshot + draft accordingly.

**Out**

- Automatic line-level Gherkin merge (manual merge via editor is enough for v1).

## Acceptance criteria

```gherkin
Feature: Conflict detection

  Scenario: No remote change
    Given I edited ONEDS-14043 and Xray has not changed since pull
    When I check for remote changes
    Then ONEDS-14043 is "clean"

  Scenario: Remote changed a different field
    Given I edited the summary and a colleague added a label in Xray
    When I check for remote changes
    Then ONEDS-14043 is auto-rebased: the snapshot has the new label and my summary draft remains

  Scenario: Same field changed on both sides
    Given I changed the summary to "Mine" and Xray now has "Theirs"
    When I check for remote changes
    Then ONEDS-14043 shows a summary conflict with Base, Xray now and Mine
    And it cannot be synced until resolved

  Scenario: Resolve by keeping mine
    When I choose "Keep mine"
    Then the snapshot is updated to Xray's current state and my draft summary stays "Mine"
    And the test becomes syncable

  Scenario: Resolve by taking Xray
    When I choose "Take Xray"
    Then the draft summary field is cleared and the snapshot equals Xray's state

  Scenario: Deleted in Xray
    Given ONEDS-14044 was deleted in Xray
    When I check for remote changes
    Then it is marked "Deleted in Xray" with options "Discard my changes" or "Re-create as new test"

  Scenario: Pull does not destroy drafts
    Given I have drafts for 5 tests
    When I pull from Xray
    Then all 5 drafts still exist and conflicts are flagged where applicable
```

## Verification

1. Static: `pnpm check`
2. Runtime: `pnpm test:unit tests/unit/merge`, `pnpm test:int tests/integration/conflicts.test.ts`
3. End-to-end: `pnpm test:e2e e2e/us-17-conflicts.spec.ts` (mock services expose a test-only endpoint to mutate remote state)

## Story-specific done checks

- [ ] `docs/architecture.md` has the three-way model and the classification table
