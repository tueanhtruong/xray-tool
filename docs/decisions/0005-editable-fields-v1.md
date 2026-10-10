# 0005 — Editable fields in v1

- Status: accepted (labels removed by [0016](0016-stop-tag-sync-and-labels.md))
- Date: 2026-09-29
- Source: [user-stories README, assumption 3](../user-stories/README.md#assumptions-to-confirm)

## Decision

Editable and syncable fields in v1:

1. **Summary**
2. **Jira status**, changed through the project's workflow transitions (never set directly)
3. **Gherkin definition** (Cucumber tests only)

Labels are not an editable field; see [0016](0016-stop-tag-sync-and-labels.md).

Manual and Generic Xray tests are pulled and listed **read-only**.

## Consequences

- The diff engine (US-15) and sync (US-18) only handle these three fields.
- Adding a field later (e.g. components, priority) needs a new ADR and changes to diff, sync, and the grid.
