# US-13 — Import test cases from Markdown

| Field      | Value                                             |
| ---------- | ------------------------------------------------- |
| Milestone  | M3 Edit                                           |
| Depends on | US-10 (and US-06)                                 |
| State      | tracked in [feature-list.json](feature-list.json) |

## User story

As a QA engineer, I want to import many test cases from one Markdown file, so that test cases authored in my editor or repository become editable drafts ready to sync.

## Context

Import never writes to Xray. It produces drafts for existing tests (matched by `@xray-KEY`) and **new local test cases** (no key) that US-19 will create in Xray.

## Scope

**In**

- Upload `.md` / `.markdown` (max 2 MB, UTF-8). File content parsed server-side with US-06; never executed or rendered as HTML.
- Preview table, one row per scenario, with a computed action:
  - **Update** — `@xray-KEY` found in this workspace and fields differ from snapshot (shows changed fields).
  - **Unchanged** — key found and fields equal the snapshot/draft.
  - **Create** — no `@xray-KEY`.
  - **Error** — parse error, duplicate key, key from another project, key not found in cache, or read-only test type.
- For Create rows: choose target folder (tree picker, default = folder selected in repository) and optional extra labels.
- User can deselect rows. Confirm applies all selected rows in one transaction:
  - Update → merge into `TestCaseDraft` (US-10 rules).
  - Create → `TestCase` with `origin = IMPORT`, no `issueId`, status `NEW`, draft with all fields.
- Import record (`ImportBatch`: filename, counts, user, timestamp) for traceability.
- If an existing draft would be overwritten, the row warns "Overwrites your unsynced edits" and requires explicit opt-in.

**Out**

- Syncing (US-18/US-19). Importing `.feature` zip archives or multiple files at once.

## Acceptance criteria

```gherkin
Feature: Markdown import

  Scenario: Preview classifies scenarios
    Given the cache contains ONEDS-14043 and ONEDS-14044
    And I upload a file with scenarios tagged @xray-ONEDS-14043 (changed), @xray-ONEDS-14044 (identical) and one untagged
    Then the preview shows Update, Unchanged and Create respectively

  Scenario: Confirm import creates drafts only
    When I confirm the import
    Then ONEDS-14043 has a draft with the changed fields
    And a new local test case exists for the untagged scenario in the chosen folder
    And no request was sent to Xray or Jira

  Scenario: Unknown key
    Given a scenario tagged @xray-OTHER-1 from another project
    Then the row shows Error "ONEDS workspace cannot import OTHER-1" and cannot be selected

  Scenario: Parse error
    Given a file with invalid Gherkin at line 12
    Then the preview shows the error with line 12 and nothing can be confirmed for that feature

  Scenario: Overwriting local edits needs opt-in
    Given ONEDS-14043 already has an unsynced draft
    Then its row warns about overwriting edits and is deselected by default

  Scenario: Oversized or wrong file type
    When I upload a 5 MB file or a .pdf
    Then I see a clear rejection message and nothing is parsed

  Scenario: Malicious content is inert
    Given a scenario name contains "<script>alert(1)</script>"
    Then the preview shows it as text and no script executes
```

## Verification

1. Static: `pnpm check`
2. Runtime: `pnpm test:unit tests/unit/import-classify.test.ts`, `pnpm test:int tests/integration/import-api.test.ts`
3. End-to-end: `pnpm test:e2e e2e/us-13-markdown-import.spec.ts`

## Story-specific done checks

- [ ] The reference feature file is used as an e2e fixture
