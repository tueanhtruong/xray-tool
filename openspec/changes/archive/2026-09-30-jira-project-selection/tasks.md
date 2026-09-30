## 1. Workspace project model

- [ ] 1.1 Add nullable selected-project key, numeric project ID, name, readiness metadata, Test issue type identity, and serialized status options to `Workspace`.
- [ ] 1.2 Create and apply the Prisma migration; regenerate the client and confirm existing workspaces remain unready without backfilled project data.

## 2. Jira project discovery and metadata

- [ ] 2.1 Confirm the supported Jira Cloud REST endpoints and response fields for paginated project search, project issue types, and Test issue statuses; document sanitized response mapping.
- [ ] 2.2 Add validated Jira integration operations for bounded project search and project metadata, using the existing workspace client for OAuth and API-token connections.
- [ ] 2.3 Add authenticated `GET /api/jira/projects?query=` with pagination, owner/workspace scoping, input validation, and safe response mapping.

## 3. Selection, readiness, and switching service

- [x] 3.1 Add the Xray root-folder GraphQL query and typed operation using the selected project's numeric ID and path `/`.
- [ ] 3.2 Implement the project-selection service to probe Jira Test metadata/statuses and Xray access before persisting a ready selection; map permission and upstream failures to actionable sanitized errors.
- [ ] 3.3 Implement a reusable workspace project-readiness lookup and guard for project-scoped server operations.
- [ ] 3.4 Implement a reusable pending-drafts guard that currently returns no drafts, with a stable service contract for later draft models.
- [ ] 3.5 Implement successful project replacement atomically: re-check ownership and pending drafts, update project metadata, and invoke a project-cache cleanup service boundary while preserving the prior project on failures.
- [ ] 3.6 Add an authenticated project-selection endpoint with request validation, same-origin protection, replacement confirmation handling, and service error mapping.

## 4. Onboarding and readiness UI

- [ ] 4.1 Extend workspace session/settings data with non-secret Jira, Xray, and project readiness states.
- [ ] 4.2 Add the Jira → Xray → project onboarding checklist and searchable paginated project picker to workspace home.
- [ ] 4.3 Show project readiness success and actionable missing-Test, permission, and upstream failure messages; require explicit confirmation before replacing an existing project.
- [ ] 4.4 Add page-boundary handling that redirects authenticated owners from project repository pages to onboarding when the workspace is not ready, while leaving onboarding and connection settings accessible.

## 5. Deterministic mocks and verification

- [ ] 5.1 Extend mock Jira services with deterministic paginated project search, Test issue type/status metadata, and a project without Test issue type.
- [ ] 5.2 Extend mock Xray GraphQL behavior with root-folder project access success, denied-project permission failure, and controllable upstream failure.
- [ ] 5.3 Add `tests/integration/project-selection.test.ts` covering search pagination/auth-method parity, successful selection, missing Test issue type, Xray denial, failed-probe preservation, draft guard, cache-switch behavior, and unready API rejection.
- [ ] 5.4 Add `e2e/us-05-project-selection.spec.ts` covering onboarding checklist, search/select/readiness, actionable failures, project-switch confirmation/blocking, and repository-page redirect.
- [ ] 5.5 Run `pnpm check`, `pnpm test:int tests/integration/project-selection.test.ts`, and `pnpm test:e2e e2e/us-05-project-selection.spec.ts`.
- [ ] 5.6 Update US-05 feature state to `active` before implementation, then update `docs/progress.md` and related integration/architecture documentation as implementation decisions settle.
