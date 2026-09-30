# 0005 — Editable fields in v1

- Status: accepted (assumption, revisable before US-09)
- Date: 2026-09-29
- Source: [user-stories README, assumption 3](../user-stories/README.md#assumptions-to-confirm)

## Decision

Editable and syncable fields in v1:

1. **Summary**
2. **Labels** (see [0004](0004-labels-are-scenario-tags.md))
3. **Jira status**, changed through the project's workflow transitions (never set directly)
4. **Gherkin definition** (Cucumber tests only)

Manual and Generic Xray tests are pulled and listed **read-only**.

## Consequences

- The diff engine (US-15) and sync (US-18) only handle these four fields.
- Adding a field later (e.g. components, priority) needs a new ADR and changes to diff, sync, and the grid.
