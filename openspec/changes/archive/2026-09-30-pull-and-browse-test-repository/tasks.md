## 1. Verify external contracts and establish story boundaries

- [x] 1.1 Verify the supported Xray GraphQL operation and response fields for complete folder enumeration, including child discovery, paths, names, and remote test counts; add a sandbox contract check and record the exact query.
- [x] 1.2 Verify Xray `getTests` pagination and fields for issue ID, test type, folder path, Gherkin, last modification, and Jira key/summary/labels/status/update time; cover nullable/type-specific values and record the exact query.
- [x] 1.3 Confirm tests, migrations, and workspace/project cache invariants against US-05; keep the implementation sequence US-06 then US-07 then US-08 to respect WIP=1.

## 2. Implement US-06 folder pull

- [x] 2.1 Add typed Xray folder-enumeration integration using the verified contract and validated responses; extend the mock with empty, flat, deep, large, and midway-failure scenarios.
- [x] 2.2 Implement folder retrieval and transactional project-scoped replacement, preserving unchanged rows, deleting stale folders, updating `foldersPulledAt`, and rechecking the captured project under the workspace lock.
- [x] 2.3 Add authenticated folder-pull and folder-tree APIs, request validation, actionable request-ID errors, and structured start/count/duration log events.
- [x] 2.4 Enforce one active folder/full pull per workspace in the single-instance v1 coordinator and return HTTP 409 with the specified message for a concurrent start.
- [x] 2.5 Add folder-pull integration coverage for first pull, deletion, failure atomicity, idempotency, project-switch race, workspace isolation, and concurrency; add the minimal pull button/result UI and US-06 E2E coverage.

## 3. Implement US-07 full test pull and snapshots

- [x] 3.1 Add typed paginated Xray test-query integration using the verified contract; extend deterministic mocks for 0, 5, and 1,000 tests, including Scenario Outline, Manual, Generic, nullable fields, and page failure.
- [x] 3.2 Implement shared fingerprint normalization and SHA-256 generation with unit coverage for labels, line endings, trimming, and stable results.
- [x] 3.3 Implement full-pull staging, progress reporting, and one atomic folder/test/snapshot cache replacement; preserve the prior generation on remote, validation, persistence, or project-identity failure, and preserve/mark remotely deleted tests that have local drafts while deleting stale tests without drafts.
- [x] 3.4 Add authenticated full-pull start and polling-status APIs with workspace/project isolation, sanitized terminal outcomes, and fetched/total counts.
- [x] 3.5 Add integration tests for exact snapshots, pagination, deletions, Manual/Generic read-only metadata, all-or-nothing failure, workspace/project isolation, draft preservation, and progress; verify the large-project cached query performance target.
- [ ] 3.6 Update architecture documentation with remote/snapshot/draft roles, fingerprint normalization, pull consistency, and the verified GraphQL queries; run any required sandbox `test:live` contract check. (Docs and read-only contract check are implemented; live sandbox execution awaits sandbox credentials/project ID.)

## 4. Implement US-08 repository browser

- [x] 4.1 Add authenticated, project-scoped cached-test query APIs for bounded pagination, key/summary/label search, status/label/type filters, exact folder and descendants, and test detail; test readiness and workspace isolation.
- [x] 4.2 Add the `/repository` page with keyboard-accessible folder tree, server-paginated test list, URL-backed folder/filter state, and per-workspace expanded-state persistence.
- [x] 4.3 Add pull header/status polling, last-pulled metadata, read-only detail drawer with safely rendered Gherkin, safe stored-site Jira links, row selection/editor-entry action, and all specified empty states.
- [x] 4.4 Add query API integration coverage and repository-browser E2E coverage for folder navigation, filters/search, deep links/back navigation, read-only detail, literal markup rendering, never-pulled state, selection, and accessibility; run the Axe check.

## 5. Complete verification and handoff

- [x] 5.1 Run the story verification commands in dependency order (US-06, US-07, US-08), `pnpm check`, and relevant end-to-end specs against the mock target; resolve failures.
- [ ] 5.2 Update `docs/progress.md` and story state/evidence only through the prescribed verification workflow, ensure the session exit checklist is complete, and commit each story with its required message.

## 6. Revise repository pull for lightweight indexing and on-demand details

- [x] 6.1 Verify and document Xray GraphQL contracts for the lightweight test index (identity, key, name/summary, folder) and fetching full current details for a test identity; update the mock contracts and fixtures.
- [x] 6.2 Change full pull staging and atomic persistence to cache only folder and lightweight index data, preserving existing draft/snapshot data as specified and avoiding detail-field retrieval for the index.
- [x] 6.3 Update repository index query and UI to return/show only key, name/summary, and folder; retain key/name search and folder navigation while removing detail-field filters from the index experience.
- [x] 6.4 Make opening a test fetch fresh Xray details on every open without persisting the response or changing its snapshot; show labels, status, type, and Gherkin from that response.
- [x] 6.5 Make editor selection fetch full details for each selected test, create a snapshot if missing, leave unchanged snapshots untouched, refresh changed snapshots only when no draft exists, and preserve changed snapshot baselines when a draft exists.
- [x] 6.6 Add/update integration and browser coverage for lightweight pull payload/cache, fresh uncached detail opens, editor-selection fetches, snapshot comparison/update rules, local-draft preservation, and remote failures; update architecture documentation and run required checks.

## 7. Reverify the revised repository behavior

- [x] 7.1 Run `pnpm check` and the relevant pull, repository-query, editor-selection integration and browser checks against the mock target; resolve failures against the revised requirements.
- [ ] 7.2 Update progress/story verification evidence for the revised behavior and complete the session handoff checklist.
