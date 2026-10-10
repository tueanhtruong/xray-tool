## Why

US-09 shipped a grid with inline edits of summary, labels and status, a wide Folder column, and no place to edit Gherkin against the Xray version. Labels and status add noise, storage and code, and the tags they carried are no longer synced ([ADR 0016](../../../docs/decisions/0016-stop-tag-sync-and-labels.md)). Users need a dedicated screen to edit Gherkin and see live changes against Xray, with no remote write.

## What Changes

- Remove the Labels and Status columns, their inline editors, header sort/filter and search terms from the grid, API, database, types, validation, fixtures and tests. **BREAKING** for draft API clients: requests containing `labels` or `status` are rejected with `400` (`unknown_field`).
- Forward-only migration: delete drafts whose only differences were labels or status, strip both fields from remaining drafts, drop the columns from draft and baseline tables, bump the fingerprint version and recompute stored fingerprints so no draft becomes stale. Log the counts of drafts deleted and changed.
- Stop syncing Gherkin tags as Jira labels. Tags stay in Gherkin text only; `@xray-KEY` remains the identity link ([ADR 0003](../../../docs/decisions/0003-one-scenario-one-xray-test.md)).
- Folder column becomes fixed-width with start-trimmed values that keep the leaf segment, and shows the full path in an accessible tooltip only when trimmed.
- Gherkin column takes the remaining width and keeps the read-only preview.
- Header select-all selects all tests matching the active filter (N selected), not only rendered rows. Selection is a set of keys kept across scrolling and paging.
- Add an **Edit all (N)** action that opens a split Edit & Compare screen for exactly the selected tests. The selection is handed over through a client store mirrored to `sessionStorage`. A new tab without a selection redirects to the repository with a notice.
- The Edit & Compare screen shows the read-only Xray baseline on the left and the editable draft on the right, with a live line diff, per-hunk revert, next/previous change, and debounced autosave with `idle | saving | saved | error` states.
- The diff editor is loaded client-only and lazily on that route. Editing never writes to Xray or Jira.

## Capabilities

### New Capabilities
- `test-draft-fields`: the draft contract for summary and Gherkin only, including rejection of removed fields, the no-op removal rule, the fingerprint version, and the forward-only migration.
- `test-draft-compare`: the Edit & Compare screen, selection hand-off, live diff, per-hunk revert, autosave states, empty and read-only states, and reload and new-tab behaviour.

### Modified Capabilities
- `test-repository`: grid columns (Select, Key, Summary, Folder, Gherkin, Draft), folder trimming and tooltip, header select-all across the filter result, and the Edit all action.

## Impact

- **UI**: `app/pages/repository.vue`, `app/components/TestList.vue`, new Edit & Compare route under `/tests/edit`, a selection store with `sessionStorage` mirroring, and a diff editor dependency (Monaco Diff Editor or CodeMirror 6 merge view; choice to be recorded as an ADR).
- **API**: draft endpoints (`server/routes/api/drafts/`, `server/routes/api/projects/[projectId]/drafts.get.ts`) accept only `summary` and `gherkin`. `GET /api/tests/by-key/:key` drops labels and status and adds `base` and `draft`. Possible new `POST /api/drafts/lookup` for rail indicators.
- **Services and shared code**: `server/services/drafts.ts`, `server/services/test-details.ts`, `shared/drafts/rules.ts`, `shared/fingerprint.ts`.
- **Database**: Prisma migration on the draft and snapshot tables (`prisma/schema.prisma`).
- **Mock services and fixtures**: labels and status removed from mock Xray/Jira responses where they only served drafts.
- **Docs**: [ADR 0004](../../../docs/decisions/0004-labels-are-scenario-tags.md) and [0005](../../../docs/decisions/0005-editable-fields-v1.md) already updated for [ADR 0016](../../../docs/decisions/0016-stop-tag-sync-and-labels.md).
- **Later stories**: US-10, US-12, US-13/14, US-15 to US-19 change as listed in [US-09.1](../../../docs/user-stories/US-09.1-bulk-editor-rework.md). Those changes are applied when each story starts.

## Open questions

- **Jira status**: the story removes the Status column and draft field, but [ADR 0005](../../../docs/decisions/0005-editable-fields-v1.md) still lists Jira status as an editable, syncable field. This change assumes status leaves the grid, API and drafts, and that its sync decision is deferred to US-18 with a new ADR.
- Should Edit all also open existing drafts from the Draft filter? (Not in this change.)
- Should find and replace in US-10 act on Gherkin text or only on summary?
