# US-06 — Gherkin Markdown parser & serializer (library)

| Field      | Value                                             |
| ---------- | ------------------------------------------------- |
| Milestone  | M2 Read                                           |
| Depends on | US-00                                             |
| State      | tracked in [feature-list.json](feature-list.json) |

## User story

As a QA engineer, I want Markdown files with Gherkin features to be parsed and written back faithfully, so that importing and exporting never silently loses or alters my test cases.

## Context

Pure library in `shared/gherkin-md/` with no Nuxt/DB dependency, used by pull (US-08), steps editor (US-12), import (US-13), export (US-14) and diff (US-15). Building it before the UI keeps it fully unit-testable (Lecture 10: stable foundations first). Reference behaviour: [refer/cucumber-bdd-test-suite/scripts/gherkin-parser.js](../../refer/cucumber-bdd-test-suite/scripts/gherkin-parser.js) and the sample [autocomplete-onfocusout-ONEDS-10390.feature](../../refer/cucumber-bdd-test-suite/src/feature/autocomplete-onfocusout-ONEDS-10390.feature).

## Scope

**In**

- `parseMarkdown(text): ParseResult` — accepts:
  - `.md` with one or more fenced ` ```gherkin ` blocks (text outside blocks is ignored and reported as `ignoredSections`), or
  - raw Gherkin with no fences.
- Parsing uses `@cucumber/gherkin` (official parser) — no hand-written regex grammar.
- Domain model:
  - `Feature { tags, name, description, background?, scenarios[] }`
  - `Scenario { tags, xrayKey?, kind: "Scenario" | "Scenario Outline", name, steps[], examples[], sourceLine }`
  - `Step { keyword, text, docString?, dataTable? }`
- `toTestCaseFields(scenario)` → `{ summary, labels, gherkin, xrayKey? }` per [README assumptions](README.md#assumptions-to-confirm) 1–2:
  - `summary` = scenario name; `labels` = scenario tags without `@` and without `@xray-KEY`;
  - `gherkin` = the Xray Cucumber definition: step lines (and `Examples` for outlines), no `Scenario:` header.
- `fromTestCaseFields(fields)` → `Scenario` (inverse).
- `serializeMarkdown(features[])` — canonical formatting: 2-space indent, one blank line between scenarios, tables column-aligned, each feature in its own ` ```gherkin ` block.
- Structured errors: `{ line, column, message }` with a human-readable message.
- Duplicate `@xray-KEY` within one document reported as an error.

**Out**

- Syncing Background / feature-level tags to Xray (preserved only for round-trip).
- Non-English Gherkin dialects (parser supports them; not tested in v1).

## Acceptance criteria

```gherkin
Feature: Gherkin Markdown round-trip

  Scenario: Parse the reference feature
    Given the reference file autocomplete-onfocusout-ONEDS-10390.feature
    When I parse it
    Then I get 1 feature with 5 scenarios
    And the first scenario has xrayKey "ONEDS-14043" and summary "onFocusOut is not triggered when clicking an available option in the dropdown"
    And its labels do not include "xray-ONEDS-14043"

  Scenario: Multiple fenced blocks
    Given a Markdown file with prose and two gherkin code blocks
    When I parse it
    Then I get 2 features and the prose is reported as ignored

  Scenario: Round-trip is lossless for canonical input
    Given any document produced by serializeMarkdown
    When I parse and serialize it again
    Then the output is byte-identical

  Scenario: Scenario Outline keeps its Examples
    Given a Scenario Outline with an Examples table
    When I convert it to test case fields and back
    Then the Examples table is unchanged

  Scenario: Syntax error is located
    Given a gherkin block with a step before any Scenario
    When I parse it
    Then I get an error with the correct line number and a readable message

  Scenario: Duplicate Xray key
    Given two scenarios tagged "@xray-ONEDS-1"
    When I parse the file
    Then an error names both line numbers
```

## Technical notes

- Normalize CRLF → LF and strip trailing whitespace before comparison.
- Add property-based tests (e.g. `fast-check`) generating random features to prove `parse(serialize(x)) == x`.
- Keep a `tests/fixtures/gherkin-md/` corpus; every bug found later adds a fixture.

## Verification

1. Static: `pnpm check`
2. Runtime: `pnpm test:unit tests/unit/gherkin-md`
3. End-to-end: n/a (pure library; exercised end-to-end by US-13/US-14/US-21)

## Story-specific done checks

- [ ] `shared/gherkin-md` has no imports from `app/`, `server/` or Nuxt (enforced by the architecture lint rule)
- [ ] Line coverage ≥ 90% for `shared/gherkin-md`
