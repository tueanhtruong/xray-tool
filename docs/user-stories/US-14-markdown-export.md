# US-14 — Export test cases to Markdown

| Field      | Value                                             |
| ---------- | ------------------------------------------------- |
| Milestone  | M3 Edit                                           |
| Depends on | US-09, US-11                                      |
| State      | tracked in [feature-list.json](feature-list.json) |

## User story

As a QA engineer, I want to export selected or edited test cases to a Markdown file in the same Gherkin format, so that I can review them in Git, share them, or re-import them later.

## Scope

**In**

- Export sources: current selection, a folder (optionally recursive), or "all tests with drafts".
- Version choice: **Local** (snapshot + draft applied; default) or **Xray** (snapshot only).
- Grouping: one `Feature` per folder (feature name = folder name, description = folder path). Tests imported from a file keep their original feature name/tags/background when available.
- Each scenario gets tags: labels + `@xray-KEY` (new, unsynced tests have no key tag).
- Output uses `serializeMarkdown` (US-11): one fenced ` ```gherkin ` block per feature, preceded by a Markdown heading with project key and export timestamp.
- Download filename: `xray-<PROJECT>-<yyyyMMdd-HHmm>.md`; `Content-Disposition` built from sanitized values only.
- Export is read-only: no drafts or snapshots change.

**Out**

- Export to CSV/JSON or Xray import formats.

## Acceptance criteria

```gherkin
Feature: Markdown export

  Scenario: Export selection with local edits
    Given ONEDS-14043 has a draft summary "New summary"
    When I export the selection with version "Local"
    Then the file contains "Scenario: New summary" tagged @xray-ONEDS-14043

  Scenario: Export Xray version
    When I export the same selection with version "Xray"
    Then the file contains the original summary

  Scenario: Round-trip import is a no-op
    Given I exported 20 tests with version "Local"
    When I import that file (US-13)
    Then all 20 rows are classified "Unchanged"

  Scenario: Grouped by folder
    Given the selection spans folders "/A" and "/B"
    When I export
    Then the file contains two features named "A" and "B"

  Scenario: New local tests have no Xray tag
    Given an imported but unsynced test
    When I export it
    Then its scenario has labels as tags but no @xray- tag

  Scenario: Export has no side effects
    When I export any selection
    Then no draft, snapshot or remote data changes
```

## Verification

1. Static: `pnpm check`
2. Runtime: `pnpm test:unit tests/unit/export-builder.test.ts`, `pnpm test:int tests/integration/export-api.test.ts`
3. End-to-end: `pnpm test:e2e e2e/us-14-markdown-export.spec.ts` (includes export → import round-trip)
