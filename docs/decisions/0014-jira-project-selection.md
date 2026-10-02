# ADR 0014: Jira/Xray project selection and readiness

## Status

Accepted

## Context

US-05 introduces one selected Jira/Xray project per workspace. Jira supplies the human-facing project key/name and numeric project ID; Xray's Test Repository GraphQL operations require the numeric ID. The app already has workspace-scoped Jira and Xray clients, and later stories will add project-owned caches and local drafts.

## Decision

- Persist tenant-scoped project identity, Jira project key/numeric ID/name, readiness timestamp, Test issue type identity, and status ID/name options on `Project`. Associate each workspace with a project only after access verification.
- Use Jira Cloud REST v3 project search (`/project/search`), project details (`/project/{projectIdOrKey}`), project issue types (`/issuetype/project?projectId=...`), and project statuses (`/project/{projectIdOrKey}/statuses`). Normalize responses to bounded project identity fields, Test issue type ID/name, and status ID/name pairs.
- Use the existing workspace Jira client so OAuth and API-token workspaces use the same project integration contract. Keep URL construction and response validation in the integration layer.
- Validate Jira Test metadata and the Xray root folder before creating/updating a project association. Failed probes do not persist partial readiness.
- Keep access resolution, project-scoped cache operations, and readiness enforcement in reusable service boundaries. Shared remote rows belong to the tenant/project record; drafts are user/testcase-scoped and hold immutable bases.
- Project associations are additive and switching a view does not delete project data or drafts. `WorkspaceProject` is the authorization boundary; shared folder and remote test rows are owned by `Project`.
- Keep workspace setup/home accessible before readiness; enforce readiness on repository page and project-data boundaries rather than global auth middleware.

## Consequences

- Adding a project association may incur multiple Jira reads and one Xray GraphQL request before the local transaction begins; these are read-only and safe to retry.
- Project metadata snapshots may become stale when Jira administrators change issue types or workflows; a later explicit refresh policy may be needed.
- URL/request project context is independent of other tabs and must resolve through a verified workspace association before repository data is read.
- Repository routes added later must call the shared readiness guard before project-scoped remote calls.
