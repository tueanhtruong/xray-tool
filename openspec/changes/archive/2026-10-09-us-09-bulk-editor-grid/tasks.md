## 1. Draft domain rules and API

- [x] 1.1 Inspect existing draft rows and base-field invariants; document whether a forward-compatible migration is required without changing existing user bases.
- [x] 1.2 Add pure normalization, validation, effective-value composition, no-op detection, and changed-field rules for summary, labels, and status, with unit coverage.
- [x] 1.3 Add an authenticated, project-authorized draft read/write/revert contract deriving user identity from the session and validating testcase membership and allowed project statuses.
- [x] 1.4 Make draft creation capture an immutable normalized per-user base and fingerprint/revision atomically; preserve existing bases and delete the row when no field overrides remain.
- [x] 1.5 Add integration coverage for user/project isolation, concurrent or repeated saves, no-op deletion, invalid payloads, authorization failures, and preservation of another user's base.

## 2. Hydrate repository page details

- [x] 2.1 Add bounded batch hydration for the displayed repository page using the authorized project and existing Xray detail contract.
- [x] 2.2 Merge each row's remote details with only the current user's draft/base; keep pending, failed, unknown-type, Manual, and Generic rows non-editable.
- [x] 2.3 Add retryable per-row hydration error/loading behavior and avoid duplicate in-flight page hydration.
- [x] 2.4 Add integration coverage that hydration remains project-scoped and does not mutate the lightweight index or issue remote writes.

## 3. Repository editing grid

- [x] 3.1 Add virtualized editable Summary, Labels, and Status columns while retaining existing server-side pagination, selection, key links, folder context, and URL filters.
- [x] 3.2 Add keyboard cell navigation/edit/cancel behavior, stable testcase-keyed focus/selection, changed-cell/row indicators, and per-row Revert.
- [x] 3.3 Add validation messaging, debounced autosave capped at 500 ms, saving/saved/error/retry states, and protection against stale in-flight save responses.
- [x] 3.4 Add read-only Gherkin preview and the local-draft/no-Xray-write footer note.
- [x] 3.5 Add unit/component and focused integration coverage for validation, keyboard behavior, revert, paging/filter context, 1,000-row virtualization, and persisted values; update existing repository e2e assertions only where the UI contract changed, without adding a dedicated US-09 e2e spec.

## 4. Editable test detail and project counts

- [x] 4.1 Add the same draft-backed Summary, Labels, and Status controls to `/tests/:key`, preserving explicit project and back-navigation context.
- [x] 4.2 Add Undo all for the current testcase and keep Gherkin read-only.
- [x] 4.3 Expose current-user/current-project draft counts and refresh them after successful draft mutations and project changes.
- [x] 4.4 Add the header `N drafts` chip and repository `N tests changed` / `Review N changes` control, disabled at zero and project-scoped when navigating.
- [x] 4.5 Add integration coverage for detail-page draft read/write/undo behavior, private counts, project authorization, and zero mock Jira/Xray writes.

## 5. Regression and story verification

- [x] 5.1 Update mock fixtures/services and documentation for detail hydration and draft-save behavior without adding remote write behavior.
- [x] 5.2 Run `pnpm check`, focused draft unit/integration suites, and the existing repository e2e regression spec; do not add a dedicated US-09 e2e spec.
- [x] 5.3 Run `pnpm verify US-09` after the implementation is committed to a clean tree; the repository verification gate requires HEAD and a clean working tree, and verification alone updates the story state.
