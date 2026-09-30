## Context

See [proposal.md](proposal.md) for motivation and [specs/jira-project-selection/spec.md](specs/jira-project-selection/spec.md) for the behavioral contract.

The app has a workspace-scoped Jira client that dispatches OAuth and API-token authentication, a workspace-scoped Xray GraphQL client, and a Postgres-backed `Workspace` model. Project identity and readiness are not currently persisted. Repository/cache models and drafts do not exist yet, so the draft guard and cache cleanup need to be defined so later stories can extend them without moving project-switch policy into route handlers.

## Goals / Non-Goals

**Goals:**

- Keep project discovery and selection scoped to the session's owned active workspace.
- Treat readiness as a verified server-side state, not a browser assertion.
- Keep the current ready project intact until all probes for a replacement succeed.
- Provide one reusable project-switch guard for drafts and project-owned cache.
- Give future project-scoped routes a common readiness check.

**Non-Goals:**

- Managing multiple selected projects in one workspace.
- Pulling folder trees or test cases; those belong to subsequent stories.
- Supporting project switching with pending drafts through automatic sync or discard.
- Adding manual project-ID entry or arbitrary Jira/Xray endpoints.

## Decisions

### Persist selection and readiness on the workspace

Add workspace project identity fields for the Jira key, numeric Jira project ID, and display name, along with the selected Test issue type identity and serialized available status values required downstream. Persist readiness only after successful Jira and Xray probes. Keep the last successful selection untouched while validating a replacement; write the replacement only after every probe succeeds.

**Alternative considered:** persist an attempted project as `PENDING` and surface an incomplete state. This adds recovery/state-transition behavior without a current workflow that benefits from retaining failed attempts, so failed attempts will remain transient and the existing ready selection will remain authoritative.

### Keep external API details behind existing integrations

Use the workspace Jira client's relative-path interface for project search and project metadata (including issue types/statuses), and extend the Xray integration's GraphQL query surface for `getFolder(projectId, path: "/")`. The service layer orchestrates probes and maps upstream failures into sanitized, actionable domain errors. It must not branch on OAuth versus API-token credentials or on live/mock targets.

Search parameters will be validated and encoded by the Jira integration; callers cannot pass an arbitrary URL or path. The API will return a bounded page of projects with stable project identity fields.

**Alternative considered:** put Jira and Xray request logic directly in route handlers. This would duplicate auth, error mapping, and workspace policy and violate the established thin-handler boundary.

### Commit readiness and project changes atomically

The project-selection service will perform all remote probes before opening the persistence transaction. The transaction will re-check ownership/current project state and the draft guard, then update selected project metadata and delete project-scoped cache rows belonging to the old project. Because cache tables arrive later, cleanup will be encapsulated as a service-level operation that is initially a no-op for absent cache models and is extended by the folder/test cache stories. The draft-presence query follows the same stable service contract and initially returns no drafts.

The browser confirmation is an explicit user step; the server remains authoritative and repeats the draft guard on mutation. A client-provided confirmation flag is not authorization and does not bypass ownership/readiness checks.

**Alternative considered:** clear the old cache before probing the replacement. Rejected because an inaccessible replacement would destroy useful local data while leaving the workspace without a ready project.

### Make readiness checks reusable at page and API boundaries

Expose one server-side workspace readiness lookup/service. The onboarding home remains available to authenticated users; future repository pages use it to redirect unready workspaces, while project-data APIs reject unready workspaces before making outbound requests. Avoid changing the generic auth middleware into project-domain logic; apply the readiness guard at project-scoped route/page boundaries as those routes are introduced.

**Alternative considered:** add a global middleware rule for every authenticated page and API. Rejected because connection settings and onboarding must remain accessible before a project is ready, and future non-project routes may not require readiness.

### Cache only metadata needed by later stories

Store the Test issue type identifier/name and the status options in a structured, workspace-scoped representation. The Jira metadata request is the source of truth at selection time; later status choices consume the saved list without an extra Jira request. The exact status fields exposed downstream should be the stable ID/name pair supported by the Jira response.

**Alternative considered:** fetch statuses whenever the editor opens. Rejected because US-05 explicitly calls for metadata caching and it would make editor behavior dependent on Jira availability.

## Risks / Trade-offs

- [Jira project metadata endpoints or status shapes vary by project configuration] → Validate upstream responses, persist only the stable fields required by consumers, and include representative project fixtures in the mock.
- [Xray permission failures may arrive as GraphQL errors with inconsistent wording] → Classify known permission/authorization failures into the story's actionable project-specific message while keeping unknown errors sanitized.
- [Remote probes can succeed before local persistence fails] → Treat probes as read-only and perform one atomic local write; a retry can safely re-run the probes.
- [A workspace could gain drafts concurrently after a switch request begins] → Re-check draft existence inside the final transaction/locking boundary used by the draft service before changing the project.
- [Cache models arrive after this change] → Keep cleanup behind the project-switch service contract and add cache-specific deletion behavior in the stories that introduce those models; never silently skip cleanup once project cache exists.

## Migration Plan

1. Add nullable project identity, issue-type metadata, and status-cache columns to `Workspace`; existing workspaces naturally remain unready.
2. Deploy the migration and application together. Owners with existing Jira/Xray connections select and validate a project from workspace home.
3. Rollback by reverting application code and the migration when no later project/cache data depends on the new fields; otherwise roll forward with a corrective migration rather than dropping selected-project data.

## Open Questions

- Confirm Jira's project-search, project-issue-type, and status REST paths/response fields against the supported Jira Cloud API during implementation; the behavior contract requires key/name/numeric ID, the Test issue type, and statuses, independent of endpoint choice.
- Define the project-scoped cache cleanup implementation as US-06 and US-07 introduce their tables; the project-switch service contract is established here so those stories can attach cleanup atomically.
