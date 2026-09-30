# US-19 — Create new tests in Xray from imports

| Field      | Value                                             |
| ---------- | ------------------------------------------------- |
| Milestone  | M4 Sync                                           |
| Depends on | US-18                                             |
| State      | tracked in [feature-list.json](feature-list.json) |

## User story

As a QA engineer, I want scenarios imported without an Xray key to be created as Cucumber tests in the right folder, so that a new Markdown file becomes a real Xray test suite in one sync.

## Context

Uses Xray `createTest` and folder mutations (see [refer/cucumber-bdd-test-suite/api/create/](../../refer/cucumber-bdd-test-suite/api/create/)). Creation is not naturally idempotent, so duplicate prevention is a first-class concern.

## Scope

**In**

- `create` items in a SyncBatch execute:
  1. Ensure target folder exists (`createFolder` for missing path segments; refresh folder cache).
  2. `createTest(testType: { name: "Cucumber" }, gherkin, folderPath, jira: { fields: { summary, project: { key }, labels } })`.
  3. If a status other than the default is requested → transition (US-18 logic).
  4. Store returned `issueId` + `key` on the local `TestCase`, set `origin` history, write snapshot, delete draft.
- Duplicate prevention:
  - Item marked `CREATING` with a client-generated `createToken` **before** the call.
  - If the process dies between request and response, the item becomes `UNKNOWN_OUTCOME`; retry first searches Jira (JQL: project + summary + created by me in the last hour) and asks the user to link an existing match or create anew.
- After sync, "Download updated Markdown" offers the original imported file content with `@xray-KEY` tags inserted for created scenarios (via US-11 serializer).
- Created tests appear in the repository browser immediately.

**Out**

- Creating Preconditions from `Background`.
- Adding tests to Test Sets / Test Executions.

## Acceptance criteria

```gherkin
Feature: Create new tests

  Scenario: Create tests in an existing folder
    Given 2 imported scenarios target folder "/Autocomplete"
    When the sync runs
    Then Xray receives 2 createTest calls with testType Cucumber and folderPath "/Autocomplete"
    And the local tests now have keys and snapshots, and no drafts

  Scenario: Missing folder is created
    Given an imported scenario targets "/New/Sub"
    When the sync runs
    Then folders "/New" and "/New/Sub" are created before the test

  Scenario: Updated Markdown with keys
    Given the sync created ONEDS-20001 from my imported file
    When I click "Download updated Markdown"
    Then that scenario is tagged "@xray-ONEDS-20001"
    And re-importing the file shows it as "Unchanged"

  Scenario: Interrupted create does not duplicate
    Given the server crashed after sending createTest but before storing the key
    When I retry the batch
    Then I am shown the matching Jira issue and asked to link it or create a new one
    And no second test is created without my confirmation

  Scenario: Creation failure
    Given Xray rejects createTest with a validation error
    When the sync runs
    Then the item fails with the Xray message and the local draft remains
```

## Verification

1. Static: `pnpm check`
2. Runtime: `pnpm test:int tests/integration/sync-create.test.ts`
3. End-to-end: `pnpm test:e2e e2e/us-19-sync-create.spec.ts`
