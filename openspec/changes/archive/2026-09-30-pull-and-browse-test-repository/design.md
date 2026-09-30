## Context

See `proposal.md` for motivation and `specs/test-repository/spec.md` for the observable contract. The application already has project-scoped `Folder`, `TestCase`, `TestCaseSnapshot`, and `TestCaseDraft` models, a `Workspace.foldersPulledAt` marker, a workspace-scoped Xray GraphQL client, repository readiness checks, and database row triggers that serialize folder/test-case writes with project switching. The existing implementation performs a full test detail pull and persists snapshots, while the revised behavior needs a lightweight index pull plus on-demand detail reads. The folder-enumeration, minimal index, and single-test detail query contracts must be verified before relying on them.

## Goals / Non-Goals

**Goals:**
- Keep the remote API contract at the integration boundary, domain orchestration in services, thin authenticated APIs, and all persistence in the project-scoped cache.
- Make a completed pull appear as one cache generation: folders and lightweight test index represent the new remote read, or the prior committed folder/index cache remains visible.
- Keep full remote details out of the pull path; fetch details when a user opens a test or selects it for editor work.
- Preserve snapshot baselines when a changed remote test has a local draft, while creating or refreshing snapshots for selected tests when safe.
- Keep pull lifecycle/status and browse queries scoped to the active owned workspace and the project captured when the job starts.
- Preserve the one-story-at-a-time delivery order: US-06 folder pull, US-07 full test pull/snapshot, then US-08 browser.

**Non-Goals:**
- Incremental/delta pulls, remote mutations, editing, sync, or conflict resolution UI.
- Persisting durable pull jobs across server restarts unless implementation discovery shows that the required runtime topology needs it.
- Displaying Manual test steps or building the editor itself.

## Decisions

### Verify and isolate the Xray GraphQL contract

Define explicit, committed GraphQL query documents and validated response shapes for complete folder enumeration, paginated lightweight test indexing, and fetching full details for selected test identities. The index query retrieves only stable issue identity, key, name/summary, and folder path; it excludes labels, status, type, Gherkin, and other full-detail fields. Verify the contracts against Xray's supported API documentation and a sandbox contract check before finalizing mock fixtures. The current `getFolder(projectId, path)` reference is a single-folder lookup with only name/path fields; do not infer child enumeration from it. If the supported API only exposes one folder at a time, recursively enumerate using a verified child-discovery mechanism, not a guessed response field. Keep GraphQL-specific parsing and upstream error normalization in `server/integrations/xray/`; services should receive typed domain records.

**Alternative considered:** implement against an assumed root response and let the mock define its shape. Rejected because that risks a fake-only integration that cannot enumerate real folders.

### Fetch and validate before cache replacement

Read the active project identity, then retrieve and validate all folder and lightweight index pages into bounded staged records before opening the cache-replacement transaction. Apply the completed generation in one transaction under the workspace row lock: recheck that the workspace still selects the captured project, then upsert changed folder/index rows, remove stale project-owned remote index rows subject to draft/snapshot preservation rules, update `foldersPulledAt`, and commit. The index pull does not create, refresh, or delete snapshot data for tests that remain indexed. Any retrieval, validation, project-identity, or persistence failure leaves the previous committed folder/index cache intact. Preserve idempotency by comparing persisted values before updates. The folder-only US-06 operation uses the same fetch-then-replace semantics for folders alone.

**Alternative considered:** hold a database transaction open while making remote requests. Rejected because network latency and pagination would hold workspace/cache locks unnecessarily. **Alternative considered:** commit folders before retrieving tests. Rejected because users could observe a mixed folder/index generation after a test-page failure.

The row lock also serializes a pull's final write with project switching. Capture the selected numeric Jira project ID/key at job start and reject final application if that selection changed. For the single-instance v1 deployment target, the per-workspace in-process registry rejects a second overlapping pull with 409. This coordination is intentionally not a multi-instance guarantee; horizontal scaling requires moving active-job coordination and status to shared storage first.

### Polling status with a minimal job lifecycle

Use a start endpoint and a status endpoint polled by the browser. Status reports queued/running/succeeded/failed state, fetched/known-total counts, and sanitized terminal result. Version one targets a single application instance and uses a per-workspace in-process job registry with one active job per workspace, while database cache commit remains authoritative. Active progress is not durable across process restart; after restart, the committed cache remains valid and the owner can start another pull. Status must never report a successful result before the cache transaction commits.

**Alternative considered:** SSE. Rejected because polling is already allowed by US-07 and has simpler reconnect, test, and browser-navigation behavior for this workflow.

### Keep browsing as a cache-only query path

Expose separate folder and test query APIs with bounded pagination and validated query parameters. Scope every query to the active owned workspace and its currently selected numeric project ID. Exact-folder and descendant-folder selection, search, and filters are applied server-side. The browser derives deep-link state from the URL and stores only expanded-tree state in workspace-keyed localStorage. Render all Jira/Xray strings through ordinary text interpolation; do not use HTML injection. Build issue links from the stored Jira site URL and cached issue key.

**Alternative considered:** fetch all cached tests into the browser and filter locally. Rejected because the story requires server-side pagination and explicitly targets a 1,000-test project.

### Fetch details on demand and protect snapshot baselines

Repository list and search queries read the lightweight local index only and return key, name/summary, folder location, and stable identity. Opening a detail view calls an authenticated server endpoint that fetches current Xray details on every open; this read does not persist details or alter snapshots. Selecting tests for editor work fetches current detail for each selected test, validates the remote response, and compares its normalized fingerprint with any stored snapshot. Create a snapshot when none exists; leave an identical snapshot untouched; refresh a changed snapshot if no local draft exists; and preserve both snapshot and draft when a draft exists and the remote data changed, leaving the existing baseline available for later conflict handling. Full-detail fields such as labels, status, type, Gherkin, and update time are therefore shown only after detail fetch and are not part of the lightweight list or pull cache.

**Alternative considered:** cache every detail response when opened. Rejected because the requested behavior is to fetch fresh details each time and reduce persisted data. **Alternative considered:** replace a changed snapshot unconditionally during editor selection. Rejected because that would erase the baseline required to detect remote-vs-draft conflicts.

## Risks / Trade-offs

- **[Folder enumeration is not established by the current reference query]** → Verify the supported Xray operation and response contract against documentation/sandbox first; make an explicit blocker if no supported child traversal is available.
- **[A large staged project index consumes memory]** → Bound page size and response validation, use the documented maximum pagination size, and measure the 1,000-test fixture. If staging is too large, design a durable staging generation before relaxing all-or-nothing semantics.
- **[In-process pull status is not shared across instances or restarts]** → Confirm the deployment/test topology during implementation; adopt shared persisted job state if requests may land on different instances or process restarts must preserve progress.
- **[In-process coordination does not cover multiple app instances]** → Keep the v1 deployment single-instance and test overlapping starts; before horizontal scaling, move job ownership/status to shared storage and add cross-instance concurrency tests.
- **[Project selection can change while remote reads are in flight]** → Recheck captured project identity while holding the workspace lock before applying staged results; discard stale results.
- **[Xray index/detail fields can be nullable or differ by test type]** → Validate index and detail responses separately and define explicit normalization for missing Gherkin/status/update fields without fabricating remote state; cover Cucumber, Manual, and Generic fixtures.
- **[Full replacement can encounter a remotely deleted test with a local draft]** → Preserve the test, last snapshot, and draft and mark the test as remotely deleted; remove only stale tests without drafts. Add or reuse an explicit persisted remote-deletion marker so later conflict resolution can act on it.

Snapshot fingerprints continue to use SHA-256 over normalized summary, sorted labels, status, and LF-normalized trimmed Gherkin when snapshots are created or refreshed during editor selection.

## Migration Plan

The existing project-scoped test identity and snapshot models can represent the index and optional on-demand baselines, but the index response and detail-fetch paths must no longer require snapshots for every test. If existing schema constraints prevent index records without snapshots or storing a separate name/summary, add a forward-only Prisma migration that preserves existing workspace data and supports lightweight index fields. Rollback is application rollback; do not run a destructive cache migration. Index contents are reconstructible by a subsequent pull, but a failed pull must preserve the last committed folder/index generation.

## Open Questions

- Confirm exact Xray semantics for name/summary, stable issue identity, nullable detail fields, and folder test counts during the sandbox contract check. This can be resolved while validating the remote contract and does not change the chosen cache or API approach.
