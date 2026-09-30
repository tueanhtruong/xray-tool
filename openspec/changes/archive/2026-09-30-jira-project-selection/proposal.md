## Why

Connected Jira and Xray credentials are not enough to safely scope repository operations: each workspace must select one Jira project, resolve its numeric project ID for Xray, and confirm that both integrations can use it. Establishing this workspace boundary now enables later folder/test pulls and keeps them scoped to a validated project.

## What Changes

- Add searchable, paginated Jira project discovery for the active workspace.
- Allow the workspace owner to select one project and persist its Jira key, numeric project ID, and name only after Jira metadata and Xray access checks succeed.
- Cache the project’s Jira Test issue type and available statuses for later editing workflows.
- Add an onboarding checklist and readiness state for Jira, Xray, and project selection.
- Prevent changing projects while unsynced local drafts exist; otherwise confirm the change and clear project-scoped local cache as part of the switch.
- Require a ready workspace before allowing access to project repository pages.

## Capabilities

### New Capabilities
- `jira-project-selection`: Search and select one Jira/Xray project per workspace, validate readiness, and protect project-scoped local data when switching.

### Modified Capabilities
- None.

## Impact

- Prisma `Workspace` persistence and a migration for project identity/readiness metadata.
- Authenticated Jira and Xray server integrations, project-selection service/API, and readiness checks.
- Workspace home/onboarding UI and protected-page routing.
- Deterministic Jira/Xray mock responses, integration tests, and Playwright coverage.
- Later consumers include US-06/US-07 project pulls and US-09 status choices.
