## Context

See `proposal.md` for motivation and `specs/test-repository/spec.md` for the behavior contract. The current implementation stores one selected project on `Workspace`; `Folder` and `TestCase` rows carry both workspace and numeric project IDs; `TestCaseSnapshot` and `TestCaseDraft` are one-to-one children of a test row; and pull reservations/status are process-local and keyed by workspace. Project selection clears the prior cache, while API readiness and repository reads implicitly use that selected workspace project. Existing Xray credentials are intentionally workspace-scoped.

The project identity must distinguish tenants. OAuth workspaces have Atlassian `cloudId`; API-token workspaces use normalized `siteOrigin`. Project association is an authorization assertion, not ownership of the common remote cache. Xray folder retrieval currently enumerates a full tree; test-index retrieval is project-paginated, with no established folder-specific test query or moved/deleted reconciliation contract.

## Goals / Non-Goals

**Goals:**

- Establish a shared remote-cache boundary keyed by tenant and Jira project, while retaining workspace-specific connections and verified access associations.
- Make project context, authorization, pulls, and progress explicit per project and independent across tabs.
- Model private per-user drafts and immutable bases independently of shared remote rows, compatible with later US-09 draft APIs.
- Preserve populated caches, snapshots, drafts, and bases through migration and project switching.
- Keep folder-only refresh gated by evidence of a safe Xray query/reconciliation contract.
- Detect and safely repair migration-history/schema drift without discarding existing database data.

**Non-Goals:**

- Team roles, delegated administration, collaborative/shared drafts, draft merging, or billing.
- Draft editing UI, formal diff review, and writing changes to Jira/Xray; later stories own those behaviors.
- Distributed job coordination for multi-instance deployments; retain the documented single-instance assumption.
- Sharing imported/local test records through the remote project index.

## Decisions

### Represent the tenant-scoped project separately from workspace access

Add a project identity record unique by `(tenantIdentity, jiraProjectId)`. `tenantIdentity` is derived from cloud ID for OAuth or normalized site origin for API-token connections, with the identity kind represented unambiguously so equal raw values cannot collide across namespaces. Store project key/name and project-scoped Test issue type/status metadata on that record. Add a workspace-to-project association that records the successfully verified access and supports the workspace's Jira/Xray connection context. A workspace may associate with several projects; project cache existence alone is never an access grant.

Alternatives considered:

- Keep workspace/project cache copies: rejected because it cannot share one cache across verified workspaces and duplicates refreshes/storage.
- Use numeric Jira project ID alone: rejected because distinct tenants can reuse it.
- Reuse workspace's current `cloudId`/`siteOrigin` columns directly as globally unique identity: rejected because workspace lifecycle is user-owned, while project identity and cache retention are independent of a particular workspace.

### Make remote cache rows project-owned and private records owner-scoped

Move remote folder and test-index rows to the project identity. Enforce folder uniqueness by `(projectId, path)` and remote-test uniqueness by `(projectId, issueId)` plus `(projectId, key)`. Keep imported/local records outside this shared table boundary or explicitly owner-scope them so they cannot leak through remote cache queries. Treat current remote snapshots as project-shared state, but move drafts and immutable captured bases to user/testcase ownership. Ensure draft count, switch prompts, selection baseline protection, and remote-deletion retention all filter by the requesting user.

This separates a shared mutable notion of current remote state from the immutable version each user's change started from. Project pulls may update a shared current snapshot only where doing so cannot mutate a draft's captured base.

### Put the selected project in each view/request, not the workspace session

Use an explicit project identifier in repository URLs and project data requests. A server resolver loads the project only after confirming the active session owns a workspace associated with it. Keep session identity limited to user/workspace credentials; do not update a session-wide or database-global current project on selection. Project search continues through the active workspace's existing Jira project search client; selecting a result performs the existing Jira metadata and Xray root probe before establishing an association. The header picker changes only the current route context, preserving other query parameters where applicable. Legacy `/repository` and `/tests/:key` URLs without project context SHALL lead to an explicit project choice; they SHALL NOT infer or silently choose a last-used project.

Alternatives considered:

- Persist last selected project on `Workspace`: rejected because simultaneous tabs would overwrite one another.
- Trust project ID from the browser without association lookup: rejected because IDs are guessable and cache existence must not authorize reads.
- Add cross-workspace/site selection to the header: out of this story; search remains bound to the active workspace integration while multiple verified workspaces may associate with the shared project.

### Scope pull coordination, status, and persistence by project

Key process-local reservation/job state by shared project identity and pull kind/context, not workspace. A folder-only and full refresh of the same project should share the project's exclusion policy unless a safe concurrency contract proves they cannot race; pulls for different project IDs remain independent. Capture the authorized workspace/connection at pull start for Xray calls and persist only to the captured project. Reauthorize status polling against the requested project, so one project cannot reveal another's progress. Database transactions must serialize same-project writes and atomically upsert/reconcile cache state while preserving private drafts.

The project switch no longer clears cache or tests draft presence before retaining the project. The UI queries only the current user's draft count for the current project and offers Review drafts / Switch and keep drafts / Cancel. Review is navigation into that user's draft-list context, not a sync operation.

### Gate folder-only refresh on live contract evidence

The live Xray schema accepts `getTests(folder: FolderSearchInput)` with a path and `includeDescendants`; a sampled sandbox subtree query matched the full project index for that subtree. It does not identify tests moved out or deleted remotely without a separate membership check. Keep folder-only refresh disabled and use the full-project path until a safe stale-record reconciliation contract exists.

### Accept project-level Xray visibility as a working assumption

Proceed with one shared cache per tenant/project as specified. The user accepts this as the implementation assumption and will manually compare independently authorized credentials later. The optional second-credential live check remains available, but its result is not an implementation gate. Keep the source workspace/connection identity on pull jobs for auditability and to make any later visibility-scope revision traceable.

### Migrate conservatively with a recoverable cutover

Build tenant/project identities from each existing workspace's cloud ID or normalized site origin and each cache row's `jiraProjectId`. Preserve row IDs and child relationships where possible while moving ownership and adding authorization associations. Backfill draft owner from the owning workspace's user and seed immutable draft base from the existing snapshot; if no snapshot exists, use only a deterministic, documented source or mark the baseline explicitly unavailable for later safe hydration rather than inventing remote values. Handle imported rows as private data instead of accidentally promoting them to the shared remote cache.

Before applying a migration, capture row counts and representative ownership checks in a test-only fixture. Make migration application transactional where PostgreSQL permits, include a tested restore/rollback procedure for pre-cutover data, and validate that separate tenants with equal project IDs remain separate. Keep the old ownership columns until validation passes if a staged migration is needed; remove obsolete columns/constraints only after data parity has been proven.

## Risks / Trade-offs

- [A workspace can use different Jira/Xray credentials from another workspace that is authorized for the same shared project] → Resolve each Xray pull through the initiating associated workspace's credentials; never put credential data on the shared project or cache.
- [Two credentials may observe different permission-filtered views of one project] → Proceed with the specified tenant/project cache assumption; the user will perform a manual comparison later, and the optional live check remains available if the model needs revisiting.
- [Project identity changes or a workspace disconnect invalidates an association] → Treat associations as independently revocable; reauthorization is required before future reads/pulls, while already shared cache retention follows explicit project retention policy.
- [A large ownership migration could misattribute old rows or baselines] → Test backfill against tenant collision, multiple workspaces, drafts with/without snapshots, imported tests, and rollback fixtures before destructive constraint changes.
- [Shared project updates race across pulls] → Serialize same-project refreshes and apply staged results transactionally; retain the last committed cache when upstream pagination or persistence fails.
- [A folder query returns current subtree membership but cannot by itself identify tests moved out or deleted remotely] → Disable folder-only refresh and communicate the full-project scope; do not approximate using folder counts or current cached membership.
- [Existing routes/bookmarks assume implicit workspace project] → Preserve current-project navigation where possible, redirect legacy routes to a resolved authorized context when unambiguous, and return a safe selection-required response where it is not.

## Migration Plan

1. Add tenant/project identity, project-access association, project-owned cache metadata, and private draft-owner/base structures without dropping the existing representation.
2. Backfill project identity and verified-association candidates from workspace connection metadata; backfill existing project caches and draft ownership/bases while retaining original IDs.
3. Validate counts, uniqueness, tenant separation, associations, snapshots, drafts, and imported-record privacy. Block cutover if a row cannot be assigned unambiguously; do not merge by numeric project ID alone.
4. Switch services and APIs to project-owned cache and explicit request context, then enable new authorization constraints and project-scoped pull coordination.
5. After parity and rollback checks pass, remove obsolete workspace-scoped cache/selection fields and constraints in a follow-up migration step if required by the deployment migration strategy.

Rollback restores the database backup or replays the tested reverse migration while the previous application is deployed. No migration rollback may discard caches, snapshots, drafts, or captured bases. Record pre/post row counts and verify a representative tenant-collision and multi-user draft fixture as release evidence.

### Reconcile schema drift with a forward-only, data-preserving repair

Treat migration status and actual schema as separate evidence: a successful row in `_prisma_migrations` does not prove that every table, column, index, or constraint from that migration is present. Before repair, confirm that the inspected database and schema match the runtime application's configured target. Capture a recoverable database backup and inventory affected schema objects, row counts, and representative workspace, project/cache, draft, and encrypted-credential records.

Compare the actual schema with the checked-in migration sequence and identify all missing objects, not only the first column reported by an application error. If the recorded history is complete but schema objects are absent, apply a reviewed forward repair migration or equivalent controlled forward-only DDL that is safe for the observed schema and preserves existing rows. Do not reset/recreate tables, delete application data, or edit migration-history rows to conceal drift. Abort without mutation if target identity, object provenance, or safe preservation cannot be established. Afterward verify schema parity against the current Prisma model, valid migration status, preserved row counts and representative records, and the application behavior that exposed the mismatch. Preserve the backup until these checks pass.

For the observed local failure, `Workspace` lacks project-selection columns although the migration adding them is recorded as applied. The repair must reconcile every missing column and other affected schema object in the selected migration chain; adding only `jiraProjectKey` is insufficient unless a full comparison proves it is the sole discrepancy.

## Open Questions

- The user will manually verify that independently authorized Xray credentials for the same tenant/project expose equivalent indexes after implementation. A differing result would require revisiting the shared-cache scope.
