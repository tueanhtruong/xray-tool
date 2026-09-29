# US-12 — Gherkin steps editor

| Field      | Value                                             |
| ---------- | ------------------------------------------------- |
| Milestone  | M3 Edit                                           |
| Depends on | US-10                                             |
| State      | tracked in [feature-list.json](feature-list.json) |

## User story

As a QA engineer, I want to edit a test case's Gherkin steps in a proper code editor with live validation, so that I can change steps confidently without breaking the Xray definition.

## Scope

**In**

- Side panel/drawer opened from a grid row (and from the repository detail drawer via "Edit").
- Code editor (e.g. CodeMirror 6) with Gherkin highlighting, 2-space indentation, line numbers.
- Keyword completion: `Given`, `When`, `Then`, `And`, `But`, `Examples:`, table pipes.
- Live validation using the US-06 parser (wrapping steps in a synthetic `Feature/Scenario` for parsing); errors underlined with message and line.
- Lint rules (warnings, not blockers): no `When`/`Then` → warning; empty step text → error; trailing whitespace auto-trimmed on save.
- Side-by-side toggle: original (snapshot) vs current draft.
- Save writes the `gherkin` draft field (US-10 rules; identical to snapshot → field cleared). Unsaved changes prompt on close.
- Scenario Outline tests edit `Examples` in the same editor.

**Out**

- Step-definition lookup against automation code.
- Editing Background/Preconditions.

## Acceptance criteria

```gherkin
Feature: Gherkin steps editor

  Scenario: Edit steps and save as draft
    Given I open the steps editor for ONEDS-14043
    When I change "Then the \"onFocusOut\" callback should not have been called" to a new Then step
    And I click Save
    Then the Gherkin field is saved as a draft and the grid row shows it changed

  Scenario: Syntax error blocks save
    When I type a line "Examples:" without a table in a normal Scenario
    Then the line is underlined with the parser message
    And Save is disabled

  Scenario: Keyword completion
    When I type "Gi" at the start of a line
    Then "Given" is suggested

  Scenario: Compare with original
    When I toggle "Compare with Xray"
    Then I see the snapshot and my draft side by side

  Scenario: Unsaved changes guard
    Given I have unsaved edits
    When I close the editor
    Then I am asked to save or discard

  Scenario: Scenario Outline examples
    Given a Scenario Outline test
    When I add a row to its Examples table and save
    Then the draft Gherkin contains the new row
```

## Verification

1. Static: `pnpm check`
2. Runtime: `pnpm test:unit tests/unit/gherkin-lint.test.ts`
3. End-to-end: `pnpm test:e2e e2e/us-12-steps-editor.spec.ts`

## Story-specific done checks

- [ ] Editor bundle is lazy-loaded (not in the initial page chunk)
