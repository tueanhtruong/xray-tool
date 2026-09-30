# ADR 0014: Jira/Xray project selection and readiness

## Status

Accepted

## Context

US-05 introduces one selected Jira/Xray project per workspace. Jira supplies the human-facing project key/name and numeric project ID; Xray's Test Repository GraphQL operations require the numeric ID. The app already has workspace-scoped Jira and Xray clients, and later stories will add project-owned caches and local drafts.

## Decision

- Persist nullable project key, numeric project ID, name, readiness timestamp, Test issue type identity, and status ID/name options on `Workspace`. Existing workspaces remain unready until the owner selects a project.
- Use Jira Cloud REST v3 project search (`/project/search`), project details (`/project/{projectIdOrKey}`), project issue types (`/issuetype/project?projectId=...`), and project statuses (`/project/{projectIdOrKey}/statuses`). Normalize responses to bounded project identity fields, Test issue type ID/name, and status ID/name pairs.
- Use the existing workspace Jira client so OAuth and API-token workspaces use the same project integration contract. Keep URL construction and response validation in the integration layer.
- Validate Jira Test metadata and the Xray root folder before replacing the stored selection. Failed probes do not persist partial readiness or displace the prior ready project.
- Keep draft detection, cache clearing, and readiness enforcement in reusable service boundaries. Workspace/project-scoped `Folder` and `TestCase` models, one-to-one test snapshots/drafts, and the persisted draft guard provide the foundations needed by later pull/editor stories without introducing their workflows here.
- On project replacement, hold the workspace row lock while checking drafts, deleting old-project folders/test cases, and updating selection. Database triggers make folder, test-case, and draft writes acquire the same workspace lock; snapshot and draft children cascade when their test case is deleted.
- Keep workspace setup/home accessible before readiness; enforce readiness on repository page and project-data boundaries rather than global auth middleware.

## Consequences

- A project switch may incur multiple Jira reads and one Xray GraphQL request before the local transaction begins; these are read-only and safe to retry.
- Project metadata snapshots may become stale when Jira administrators change issue types or workflows; a later explicit refresh policy may be needed.
- Each later project-owned cache model must carry workspace and Jira project identity and be added to the project-switch cleanup transaction. Draft persistence must retain test-case ownership and workspace locking so a switch cannot race a new draft.
- Repository routes added later must call the shared readiness guard before project-scoped remote calls.
