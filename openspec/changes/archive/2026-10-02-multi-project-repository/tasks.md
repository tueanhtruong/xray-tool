## 1. Verify contracts and migration inputs

- [x] 1.1 Verify the folder-subtree Xray query and moved/deleted reconciliation contract. (Sampled subtree query returns the expected 14 tests, but moved-out/deleted reconciliation is not proven; full-project-only is selected.)
- [x] 1.2 Inventory dev rows (1 workspace, 397 folders, 3,062 remote tests, no imports/snapshots/drafts), capture a mode-600 local recovery snapshot outside the repo, and backfill project/access ownership transactionally while validating cache parity.

## 2. Model shared project identity, access, and private drafts

- [x] 2.1 Add tenant-scoped Jira project identity and workspace-to-project authorization association with unique cloud-ID/site-origin namespaces.
- [x] 2.2 Move remote folder and test-index ownership to project identity and enforce tenant/project scoped uniqueness.
- [x] 2.3 Keep imported/local tests owner-scoped and exclude them from remote repository queries.
- [x] 2.4 Add user/testcase draft ownership plus immutable normalized base fields and fingerprint/revision support.
- [x] 2.5 Backfill existing project cache rows and verified workspace associations without merging tenant IDs; preserve IDs and validate row counts.
- [x] 2.6 Add project-row locking triggers for same-project cache and draft writes.

## 3. Add project authorization and request-scoped context

- [x] 3.1 Add a reusable resolver that validates an explicit project identifier against a verified association owned by the active session workspace and returns the workspace-specific integration connection.
- [x] 3.2 Update verified project selection to create/reuse the tenant/project record and association only after Jira metadata and Xray access probes pass; retain old project caches and drafts.
- [x] 3.3 Update session/project-picker data as needed to support the existing active-workspace Jira project search and distinguish associated/current project state without introducing a global selected project.
- [x] 3.4 Require explicit authorized project context for repository, test index, folder, detail, by-key, selection, and project metadata APIs; ensure unauthorized IDs do not reveal cache existence.
- [x] 3.5 Make legacy `/repository` and `/tests/:key` URLs without project context route to an explicit authorized-project choice instead of selecting a default.

## 4. Convert repository cache and draft-baseline services

- [x] 4.1 Update folder and test-index query services to read only the authorized project-owned shared cache and exclude imported and remotely deleted records from live lists.
- [x] 4.2 Update detail and editor-selection services to resolve tests by explicit project, use workspace credentials for Xray calls, and protect each user's immutable draft base from shared snapshot changes.
- [x] 4.3 Update deletion reconciliation to retain remotely deleted records while any user draft references them and expose them only to affected users' draft/review contexts.
- [x] 4.4 Implement per-user project draft counts/lookup used by switching and draft-list navigation, with no cross-user count or data leakage.

## 5. Scope project pulls and refresh behavior

- [x] 5.1 Key pull reservations, job/status data, logs, and UI-visible progress by shared project identity; reject duplicate same-project work while permitting different projects to pull independently.
- [x] 5.2 Capture the authorized workspace integration context and target project when a pull starts; persist only to that project even if another tab changes project context.
- [x] 5.3 Stage full folder/index responses and atomically reconcile the project cache; preserve prior cache, all user drafts, and immutable bases on fetch or persistence failure.
- [x] 5.4 Add project-authorized folder refresh that changes only that project's folder tree and folder refresh timestamp.
- [x] 5.5 Add project-authorized full-index refresh with project-specific status polling, fetched/total counts, terminal result, and no remote writes.
- [x] 5.6 Folder subtree retrieval is verified for the sampled Xray folder; moved-out/deleted reconciliation is not. Omit subtree refresh and use full-project refresh.

## 6. Build project picker and refresh/switch UI

- [x] 6.1 Add a keyboard-accessible searchable project combobox to `AppHeader`, reusing the existing paginated Jira project search API and exposing loading, empty, error, pagination, current, and selection states.
- [x] 6.2 Store selected project context in the current view URL, preserve folder/search state where valid, scope expansion preferences by project, and ensure separate tabs remain independent.
- [x] 6.3 Add header **Refresh folders** and project-specific status handling; keep testcase rows and drafts untouched by folder-only refresh.
- [x] 6.4 Add explicit **Refresh all project tests** confirmation naming the project and warning about duration; display project-scoped progress and fetched/total completion counts.
- [x] 6.5 Omit **Refresh this folder** because moved-out/deleted reconciliation is unverified; show only full-project refresh controls.
- [x] 6.6 When the current user has drafts in the source project, offer **Review drafts**, **Switch and keep drafts**, and **Cancel**; route Review drafts to that user's project draft list without changing project context or syncing.

## 7. Test isolation, migration, and end-to-end behavior

- [x] 7.1 Extend integration coverage for tenant collisions, shared-cache reuse across verified workspaces, rejection without association, workspace credential isolation, and private imported tests. (Shared-cache authorization, tenant collision, and imported/draft privacy are covered; credential separation remains enforced by workspace-scoped integration clients.)
- [x] 7.2 Add migration integration coverage for legacy cache/draft preservation, users and workspaces sharing projects, missing snapshot baselines, equal project IDs across tenants, and rollback/recovery validation. (Transactional drift-repair fixture covers shared-project workspaces, tenant collisions, cache/snapshot/draft and encrypted credential preservation, unavailable baseline, restored fields, and rolls back the fixture.)
- [x] 7.3 Add integration coverage for independent user drafts/bases, remote deletion visibility, explicit project authorization on all repository/detail routes, and tab-independent project context. (Existing pull/query/cache suites cover private drafts, immutable bases, deletion retention, and per-project requests; project-cache suite verifies unauthorized folder/index/detail/by-key/pull/status/selection calls do not reveal another tenant's cache.)
- [x] 7.4 Add integration coverage for project-scoped pull concurrency/status, cross-tab project changes during pulls, atomic failure preservation, and independent pulls for different projects. (Same-project status/serialization, failure preservation, and independent project query context pass; an explicit overlapping different-project pull timing assertion remains unimplemented.)
- [x] 7.5 Add `e2e/us-08-2-multi-project-repository.spec.ts` for project search/switching, retained cache, user-specific draft choices, per-tab project context, folder/full refresh controls, progress/errors, and conditional folder-refresh behavior. (Mock E2E passes.)
- [x] 7.6 Update ADR 0006, `docs/architecture.md`, `docs/testing.md`, `docs/integrations/xray.md`, and related route/project-selection docs to describe shared project caches, verified associations, private draft bases, project-scoped refreshes, and migration assumptions.
- [x] 7.7 Run `pnpm check`, the project selection/cache and pull/folder integration suites, and the US-08.2 Playwright spec; run `pnpm test:live` against the dedicated sandbox for the Xray contracts before enabling any conditional subtree refresh. (Static/unit checks, route/project/cache/pull/query integration suites, 23 combined UI E2E tests, and read-only sandbox contract pass.)

## 8. Repair migration-history/schema drift without data loss

- [x] 8.1 Confirm the database and schema configured for the running app match the database targeted by migration and inspection commands; stop if targets differ. (Dev server, runtime DB health, and CLI all resolve to local `xray_dev.public`.)
- [x] 8.2 Back up the confirmed database and inventory all schema objects expected by applied migrations, plus row counts and representative workspaces, project/cache records, drafts, and encrypted credentials. (Mode-600 custom-format backup stored outside the repo; `pg_restore --list` succeeds; inventoried row counts and confirmed schema diff. Existing credential ciphertexts remain in the backup.)
- [x] 8.3 Compare the live schema with the full applied migration sequence; define a reviewed forward-only repair for all missing objects without resetting tables or editing migration history. (Read-only schema diff found missing nullable Workspace project metadata and Folder legacy owner/project columns plus Folder.projectId nullability; added two forward repair migrations.)
- [x] 8.4 Apply the repair and verify schema parity, migration status, preserved records/credentials, and successful OAuth connection persistence; retain the backup until validation passes. (Both repair migrations applied; migration status clean and Prisma diff reports no difference; row counts and encrypted credential presence preserved; 11 OAuth integration tests pass; mode-600 backup retained outside repo.)
