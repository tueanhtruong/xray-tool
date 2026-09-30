## Why

US-05's project-switch contract is already specified, but its draft guard and project-cache cleanup are placeholders because their persistence models were deferred to later stories. This leaves project changes able to ignore local work and prevents US-05 from passing; introducing only the persistence foundations needed for these safeguards breaks the dependency loop without pulling later user-facing features into scope.

## What Changes

- Add the minimum persistent draft and project-owned cache model foundations needed for US-05 to detect unsynced work and identify data belonging to the previous project.
- Implement a transaction-safe draft guard and project-cache cleanup as part of project replacement, preserving existing data and selection whenever validation or switching fails.
- Add regression coverage for pending-draft blocking, confirmed project replacement, cache cleanup, and failure preservation; reconcile US-05 verification and progress documentation.
- Leave folder/test pulling, repository browsing, and draft editing workflows to their existing stories; later stories may extend the foundational models.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `jira-project-selection`: Complete the existing project-switch requirement with persisted draft detection and cleanup of project-owned cache data, including preservation guarantees.

## Impact

- Persistence: Prisma schema and migration for the minimal draft and project-owned cache model foundations.
- Server: project-selection service and its transaction boundary.
- Verification/docs: project-selection integration and E2E coverage, US-05 story/progress state, and architecture or integration documentation where model ownership decisions affect later stories.
- No new external APIs or upstream Jira/Xray calls are introduced.
