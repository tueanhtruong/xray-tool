## Context

US-09 added an editable repository grid with Summary, Labels and Status, local drafts with autosave, and a wide Folder column. The repository list is virtualized and server-paginated. Drafts are stored per user and testcase in Prisma with an immutable base and a fingerprint. Labels and status are present in the draft model, the baseline snapshot, `shared/drafts/rules.ts`, `shared/fingerprint.ts`, and the mock Xray/Jira fixtures.

US-09's requirements are in its archived change `2026-10-09-us-09-bulk-editor-grid` and are not yet synced into `openspec/specs/`. The `test-repository` delta in this change is written against the current main spec, and the draft requirements that mention labels and status must be modified after US-09 is synced (see Migration Plan).

See [proposal.md](proposal.md) for motivation and [ADR 0016](../../../docs/decisions/0016-stop-tag-sync-and-labels.md) for the tag decision.

## Goals / Non-Goals

**Goals:**
- Grid shows Select, Key, Summary, Folder, Gherkin preview and Draft only, with a width-limited Folder column.
- A split Edit & Compare screen shows the draft base and the editable draft with a live line diff.
- Labels and status are removed end to end, with a forward-only migration that keeps summary and Gherkin drafts.
- Tag sync stops; `@xray-KEY` stays as the identity link.

**Non-Goals:**
- Gherkin highlighting, completion and parser linting (US-12).
- Conflict resolution when Xray changed after the base was captured (US-17).
- Any write to Xray or Jira (US-18/19).
- Changing the Jira status sync decision (deferred, see Open Questions).

## Decisions

**1. Labels removed, tag sync stopped.** Follows [ADR 0016](../../../docs/decisions/0016-stop-tag-sync-and-labels.md). Alternative considered: keep labels in the model and hide only the grid column. Rejected, because the sync and model would still carry a field the product no longer exposes.

**2. Jira status removed from grid, API and drafts.** The story removes the Status column and draft field. Alternative: keep status in the model and hide it. Rejected for the same reason as labels. [ADR 0005](../../../docs/decisions/0005-editable-fields-v1.md) still lists Jira status as syncable; this change does not alter that and leaves the sync decision to US-18.

**3. Left pane shows the draft's immutable base.** The baseline is the snapshot the draft was created from, not the live Xray state. Alternative: show live Xray. Rejected, because the diff would then mix local edits with remote changes that US-17 is meant to classify. Remote-changed tests show a notice rather than a silent rebase.

**4. Diff library: CodeMirror 6 merge view.** Alternative: Monaco Diff Editor. Monaco is large and is harder to keep out of the grid bundle. CodeMirror 6 merge view is smaller and can be loaded client-only on `/tests/edit`. Record this as an ADR during apply.

**5. Selection store mirrored to `sessionStorage`.** Keys only, scoped by project. Alternative: URL query. Rejected because long selections exceed URL length limits. A new tab has empty `sessionStorage` and redirects, which matches the scenario.

**6. Select-all across a filter uses a key-set query.** The grid is server-paginated and virtualized, so select-all asks the server for the keys matching the active search and folder filter. Selection is kept as a set of keys independent of rendered rows.

**7. Folder trimming is a pure function with a tooltip.** The tooltip is rendered in a teleport so the table overflow never clips it, and is shown only when the value was trimmed.

## Risks / Trade-offs

- **Data loss from migration** → Deletion is limited to drafts whose only differences were labels or status. Take a database backup before running it, and log the counts.
- **Stale drafts after fingerprint change** → Recompute fingerprints from baseline data in the same migration and test that no draft is flagged after migration.
- **US-09 e2e and unit tests reference labels and status** → Update fixtures and tests in the same change; the `grep` done check covers leftovers.
- **Select-all over a large filter** → Key-set query may be large → Return keys only, and cap the response size in the API (value to be set during apply).
- **Diff performance on 2,000-line Gherkin** → Debounce diff updates to 150 ms and collapse unchanged regions.

## Migration Plan

1. Sync the archived US-09 delta into `openspec/specs/test-repository/spec.md` and the new draft capabilities, then modify the draft requirements that mention labels and status.
2. Back up the database.
3. Run the forward-only Prisma migration: delete label- and status-only drafts, strip the two fields, drop the columns, bump the fingerprint version and recompute fingerprints from baseline data. Log the counts.
4. Deploy the UI, API and shared-rule changes together. Old clients sending `labels` or `status` receive `400 unknown_field`.
5. Rollback: restore the backup. The migration is forward-only and is not reverted in place.

## Open Questions

- Should **Edit all** also open all existing drafts from the Draft filter? Not required here; can be added later without changing the specs.
- Should find and replace in US-10 act on Gherkin text or only on summary? Decided when US-10 starts.
- What is the response cap for the select-all key-set query? Set during apply.
