## Why

QA engineers currently browse tests and can prepare their details, but cannot edit coordinated changes locally. A project-scoped grid and editable test page make those changes efficient while preserving the private-draft and no-remote-write boundary established by the repository workflow.

## What Changes

- Add inline summary, labels, and status editing to the authorized project's repository grid, with a read-only Gherkin preview and a virtualized large result set.
- Add draft-aware editing to `/tests/:key`, including undo-all, per-row revert, changed-state indicators, and keyboard-accessible cell editing.
- Persist user-private drafts through validated, debounced autosave; remove no-op drafts when values return to the user's immutable base.
- Make draft counts and review navigation reflect the current user's drafts for the current project.
- Preserve read-only behavior for non-Cucumber tests and keep all editing operations local; no Jira/Xray writes are introduced.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `test-repository`: add editable project repository and test detail views backed by private drafts, including detail hydration, read-only test handling, validation, autosave, counts, and keyboard interaction.

## Impact

- Affected areas: `/repository`, `/tests/:key`, shared UI components/composables, draft and test-detail APIs/services, `TestCaseDraft` persistence, validation and draft-rule helpers, mock services, and unit/integration/e2e coverage.
- Uses the existing authorized project context, per-user draft model/base fields, Xray test detail lookup, and project status metadata. No new external service or dependency is assumed.
- No remote Jira/Xray mutation API is added; remote writes remain outside this change.
