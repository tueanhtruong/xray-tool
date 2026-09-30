## Context

See [proposal.md](proposal.md) for motivation and [specs/jira-project-selection/spec.md](specs/jira-project-selection/spec.md) for the behavioral contract. Project selection already performs remote readiness probes before a row-locked transaction. The draft-presence function currently returns false, and project-cache cleanup is a no-op because the later folder, test, and draft models are absent.

## Goals / Non-Goals

**Goals:**

- Establish small, workspace-scoped persistence foundations that allow the project-switch policy to operate before the full pull/editor stories are implemented.
- Preserve one atomic switch boundary for draft checking, old-project cache cleanup, and selected-project metadata update.
- Make the model ownership and extension points clear so US-06, US-07, and US-09 can build on them without duplicating workspace/project scope.

**Non-Goals:**

- Implement folder or test-case pulling, snapshots, repository browsing, or user-facing draft editing/autosave.
- Change Jira/Xray probing or the public shape of project search and selection APIs.
- Change the existing confirmation, error-message, or not-ready semantics beyond persisted draft enforcement and cache preservation.

## Decisions

### Model project-owned data with explicit workspace scope

Introduce the persistence model shapes downstream stories already call for, without implementing their workflows: workspace/project-scoped `Folder` rows, `TestCase` rows and 1:1 snapshots, plus `TestCaseDraft` rows carrying nullable editable fields. Tie each project-owned row to its workspace and the selected Jira project identity (numeric project ID); drafts relate to their test case and workspace/project scope so the guard can query persisted unsynced work. US-06, US-07, and US-09 can add pull/editor behavior and additional fields through additive migrations rather than replacing an abstract registry.

**Alternative considered:** use generic cache-ownership and draft-marker records. Rejected because US-06/US-07/US-09 already specify concrete `Folder`, `TestCase`, snapshot, and draft entities; markers would create a second ownership layer and later require migration/adoption before cleanup could delete actual cached data.

### Check drafts and clean cache inside the locked transaction

Continue to perform Jira/Xray readiness probes before opening the database transaction. Inside the existing workspace row lock, re-read the current project, evaluate pending persisted drafts for that workspace, delete cache ownership/data scoped to the previous project, and update project identity/readiness in the same transaction. A transaction rollback must restore both the cache rows and selection. First selection has no previous project and therefore does not trigger previous-project cleanup.

**Alternative considered:** delete cache before remote probes or in a separate transaction. Rejected because a failed probe or write could destroy the old project's useful local data while retaining or losing the wrong selection.

### Keep workspace isolation in queries and constraints

Every draft guard and cache cleanup operation must constrain by workspace and, where applicable, project identity; schema relations and uniqueness/indexes should reinforce those boundaries. A draft in another workspace must neither block the active workspace nor be deleted during its project switch.

**Alternative considered:** rely only on globally unique test IDs or project IDs. Rejected because local workspace ownership is the application's isolation boundary and multiple workspaces may refer to related upstream identities.

### Add behavior-focused regression coverage at both server and browser boundaries

Extend integration coverage to persist representative draft/cache rows and prove blocked changes, successful cleanup, cross-workspace isolation, first-selection behavior, and failed-probe preservation. Extend E2E coverage for user-visible confirmation and the draft-block message; keep upstream mocks deterministic and assert no unintended Jira/Xray writes.

**Alternative considered:** test only service internals. Rejected because transaction/database behavior and the confirmation/error experience are part of the requirements.

## Risks / Trade-offs

- [The downstream-compatible model foundations include fields whose workflows arrive in later stories] → Add only fields already named in those story scopes, avoid pull/editor services and UI, and let later stories add behavior without duplicating model ownership.
- [Concurrent draft creation could race with a project switch] → Perform the persisted-draft check under the same transaction/locking boundary used by draft persistence, and have US-09 share that boundary or enforce an equivalent serialization mechanism.
- [Cache cleanup could miss newly introduced project-owned tables] → Make cleanup an explicit project-switch service boundary and require each later cache model story to register its rows in the same atomic cleanup contract and add switch coverage.
- [Migration or uniqueness choices could conflict with downstream model shapes] → Review US-06, US-07, and US-09 ownership requirements before finalizing the schema; prefer compatible workspace/project foreign keys and additive migrations.

## Migration Plan

1. Add workspace/project-scoped folder, test-case, snapshot, and draft persistence models through an additive Prisma migration; existing workspaces and project selections remain valid, with no synthetic drafts or cache rows backfilled.
2. Deploy the migration and service changes together. Project switches then consult persisted drafts and remove only the old project's owned cache data atomically.
3. Have subsequent folder/test/draft stories extend the ownership model and cleanup contract in additive migrations.
4. If rollback is needed before later stories store data in the new structures, revert application code and migration. After downstream data depends on them, roll forward with a corrective migration rather than dropping populated data.
