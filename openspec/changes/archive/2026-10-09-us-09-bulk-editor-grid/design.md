## Context

See proposal.md for motivation and `specs/test-repository/spec.md` for observable behavior. The repository is project-scoped and backed by a shared lightweight index; labels, status, and test type are obtained from Xray detail reads. `TestCaseDraft` already has per-user/per-test uniqueness and base fields, while `TestCaseSnapshot` represents shared current remote state. Existing project authorization, status metadata, detail loading, and draft listing provide the integration points.

## Goals / Non-Goals

**Goals:**
- Reuse the shared remote index and details while keeping draft values and immutable baselines user-scoped.
- Bound detail hydration to visible repository page data and avoid making unhydrated or failed rows appear editable.
- Keep grid and detail-page editing on one draft rule/validation contract.
- Avoid any remote write integration and preserve the existing route/project context model.

**Non-Goals:**
- Gherkin editing, bulk actions, diff review implementation, conflict resolution, or syncing (later stories).
- Replacing the repository's server-side pagination or redesigning shared project cache ownership.
- Introducing an external grid, state-management, or persistence dependency.

## Decisions

### Hydrate only the bounded visible page

Use the current repository query page (currently bounded to 50 rows) as the detail-hydration unit. Load details in bounded batches compatible with the existing Xray selection limit, and associate results with project and testcase identity. Do not hydrate every result matching the filter. A row is locked while pending or after a failed hydration; provide row-level retry. Keep the index response lightweight. This limits remote reads and memory while still making displayed cells usable. An alternative was to hydrate only viewport rows, but virtual scrolling plus asynchronous editability and focus movement would make page navigation and keyboard interaction less predictable.

### Keep a shared current snapshot and an immutable user base distinct

On first draft creation, derive the base from the selected test's prepared normalized details/snapshot and persist it into that user's draft base fields/fingerprint as part of the draft operation. Subsequent edits compare against that immutable user base, not against a potentially newer shared snapshot. Draft values are nullable field overrides; compose displayed values from the user's base and overrides. A no-op edit clears its field override, and remove the row when no overrides remain. Existing draft creation and update must be atomic to avoid races that capture different bases or resurrect a no-op draft.

The editor entry/detail flow already prepares snapshots through the selection endpoint; grid hydration should reuse the same domain rule without causing an unrelated write during ordinary detail viewing. If a draft exists, its own base and overrides take precedence even when the shared snapshot has changed.

### Use one server-side draft contract for every editor surface

Introduce a project-authorized draft read/write contract that accepts a testcase identity and validated nullable field overrides. Derive the user from the session; never accept a user ID from the client. Validate project association and testcase membership before reading or writing. Keep transactions serialized with the project's existing lock/coordination strategy, and re-check authorization and testcase identity within the write boundary. Return canonical effective fields, base fingerprint, draft status, and save timestamp so the grid and detail page share semantics.

The UI debounce is capped at 500 ms. Track a monotonically increasing local edit version per testcase; only acknowledge a response if it corresponds to the latest submitted version. Keep unsaved local values on error and retry the newest version. Validation runs before submission; invalid values remain local and block persistence. Label normalization is deterministic and deduplicates values; status must match the authorized project's Test issue type status metadata.

### Virtualize within the existing paginated repository

Retain the current server-side search, folder filters, page size, and URL state; virtualize rows within the loaded page rather than fetching all 1,000 rows for one grid. Keep selection and focus keyed by stable testcase ID, not rendered row position. The keyboard model moves between editable cells, skips locked cells, and ensures a virtualized target is rendered before focusing it. An alternative was replacing pagination with an unbounded virtual query; that expands API/query and selection scope unnecessarily for this story.

### Derive counts from user/project drafts

Use the existing project draft listing/count semantics as the authority. The header count and repository changed-test count are counts of testcases with non-no-op drafts for the current user/project, not changed fields. Invalidate or refresh the count after successful draft mutations and on project context changes. Keep the review button's destination project-scoped; the later review story owns the review behavior.

### No schema migration expected

The existing `TestCaseDraft` schema includes nullable overrides, normalized base values, base fingerprint/revision, and a unique `(userId, testCaseId)` key. Prefer reusing it. Verify whether any missing base or concurrency invariant requires an additive migration before implementation; do not reinterpret shared cache fields as user-owned data.

## Risks / Trade-offs

- [Hydrating 50 details on every page navigation may increase Xray latency/rate use] → Batch requests, avoid duplicate in-flight hydration by project/page identity, expose loading and retry, and measure against mock/contract tests.
- [A shared snapshot may be absent or stale when a user starts editing] → Ensure the detail-preparation path establishes a normalized base before the first draft; preserve any existing user base on every later operation.
- [Concurrent autosaves can arrive out of order] → Version local edit submissions and serialize/guard persistence so older responses cannot replace newer field state.
- [Virtualization can make keyboard focus and selection fragile] → Key state by testcase ID and test focus movement across rendered-window boundaries.
- [Current draft records may contain historical nullable/incomplete bases] → Inspect and test existing data behavior; only use a safe explicit fallback or migration if the implementation confirms it is required.

## Migration Plan

No data migration is planned because the draft and base fields already exist. If implementation inspection demonstrates a schema change is necessary, make it additive and preserve all existing user drafts and bases. Rollback should disable the editing UI/API path while leaving persisted draft records intact; do not delete user data as a rollback mechanism.

## Open Questions

- None that block the specified behavior. The exact virtualization overscan and detail batch size can be selected during implementation while respecting the bounded page and upstream request limits.
