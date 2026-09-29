# 0007 — Markdown container format

- Status: accepted (assumption, revisable before US-06)
- Date: 2026-09-29
- Source: [user-stories README, assumption 5](../user-stories/README.md#assumptions-to-confirm)

## Decision

- The import/export file is a `.md` file with one or more fenced ` ```gherkin ` blocks. Prose
  between the blocks is allowed and ignored on import.
- Raw Gherkin with no fences is also accepted on import.
- Export always writes the canonical fenced form, grouped by Xray folder, so that export followed
  by import is a no-op (US-14).

## Consequences

- The parser (US-06) handles both forms, and its errors report the line inside the original file.
- The reference example lives in `refer/cucumber-bdd-test-suite/`.
