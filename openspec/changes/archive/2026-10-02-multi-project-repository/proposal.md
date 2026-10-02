## Why

The repository currently treats a workspace as having one selected project and owns that project's cache. Switching projects can discard cached data and is blocked by drafts, preventing users from returning to prior project data and preventing authorized workspaces from reusing the same read-only index. US-08.2 establishes retained tenant/project caches and private user drafts before editing is added in US-09.

## What Changes

- Replace the single selected-project assumption with tenant-scoped shared project records and workspace associations created only after Jira metadata and Xray access are verified.
- Retain remote folder and test-index caches across project switches; scope project context to each request/view and authorize every read, detail lookup, and pull through the requesting workspace association.
- Separate user-owned drafts and immutable draft baselines from shared remote test records; preserve each user's drafts through project switches and remote deletions.
- Add a searchable project picker to the application header using the existing paginated Jira project search integration, with project-scoped folder and full-index refresh controls and observable progress.
- Offer folder-only refresh only if sandbox contract verification demonstrates safe subtree queries and moved/deleted-test reconciliation; otherwise provide an accurately described full-project refresh path.
- Detect and repair schema drift where migration history reports success but required schema changes are absent, using a reviewed forward-only repair that preserves existing data.

## Capabilities

### New Capabilities

### Modified Capabilities
- `test-repository`: Change repository ownership and authorization from the active workspace's selected project to a tenant/project cache associated with an authorized workspace; define request-scoped project context, private drafts and baselines, retained project switching, project-scoped pulls/status, and refresh controls.

## Impact

- Prisma data model and migrations for tenant/project identity, workspace authorization associations, shared folder/test index ownership, and user-scoped drafts/baselines; migration and any schema-drift repair must preserve current caches, drafts, credentials, and unrelated workspace data.
- Project selection/readiness services and APIs; folder, test-index, detail, pull, and pull-status APIs; project pull coordination and transaction boundaries.
- App header, repository page, project-switch draft choice flow, settings, and session/project-context handling.
- Xray integration and sandbox-only `test:live` contract checks for folder-subtree querying and reconciliation; mock services and integration/E2E coverage.
- Runtime/CLI database-target verification, schema-versus-migration reconciliation, and recovery validation for drifted development databases.
- ADR 0006 and architecture, testing, integration, and story documentation.
