## Purpose

Allows each workspace to select and validate one Jira/Xray project before project-scoped repository data can be accessed, while protecting local work when the selection changes.

## Requirements

### Requirement: Search Jira projects for the active workspace
The system SHALL allow an authenticated workspace owner to search Jira projects through the Jira connection associated with the active workspace. Results SHALL be paginated and contain the project key, name, and numeric project ID required for selection. Search input SHALL be bounded and treated as data, not as an arbitrary Jira request path.

#### Scenario: Search projects through a connected Jira workspace
- **WHEN** an authenticated owner searches for a project by text
- **THEN** the system returns matching project key, name, and numeric ID values from that workspace's Jira site
- **AND** the result can be paginated without returning credentials or tokens

#### Scenario: Search through either supported Jira authentication method
- **WHEN** the active workspace uses OAuth or an API token
- **THEN** project search uses the workspace's Jira connection and returns the same response shape

#### Scenario: Reject an unauthenticated project search
- **WHEN** a request searches projects without a valid session for an owned active workspace
- **THEN** the system rejects the request without disclosing project data

### Requirement: Validate and save one ready project per workspace
The system SHALL allow an owner to select one Jira project for a workspace. Before marking it ready, the system SHALL verify Jira project metadata, confirm that the Jira Test issue type exists, cache the available statuses for that issue type, and verify Xray access by requesting the root folder using the project's numeric ID. The selected project key, numeric ID, name, metadata, and ready state SHALL be scoped to the owned workspace. A failed probe SHALL NOT replace a previously ready project or mark the attempted project ready.

#### Scenario: Select a project with Jira Test and Xray access
- **WHEN** an owner selects a project that has a Test issue type and is accessible to the workspace's Xray credentials
- **THEN** the workspace stores the project's key, numeric ID, name, Test issue type metadata, and available statuses
- **AND** the onboarding checklist reports the workspace as ready

#### Scenario: Xray cannot access the selected project
- **WHEN** the Xray root-folder request fails because the API key lacks access to the selected project
- **THEN** the owner receives an actionable project-permission error
- **AND** the attempted project is not saved as ready
- **AND** any previously ready project remains selected

#### Scenario: Project has no Test issue type
- **WHEN** the selected Jira project has no issue type named Test
- **THEN** the owner is told that Xray is not enabled for that project
- **AND** the attempted project is not saved as ready

#### Scenario: Jira or Xray returns an unavailable or invalid response
- **WHEN** a required project metadata or Xray readiness request fails for a reason other than missing permissions
- **THEN** the owner receives a sanitized actionable error
- **AND** no partial project selection is marked ready

### Requirement: Protect local work when changing the selected project
The system SHALL block changing a workspace's selected project while that workspace has persisted unsynced local drafts, and SHALL tell the owner to sync or discard those drafts first. The draft guard SHALL use workspace ownership and project association so drafts for another workspace cannot block or authorize a switch. When no drafts exist, the system SHALL require explicit confirmation before switching projects and SHALL atomically clear project-scoped local cache belonging to the previous project with the successful selection update. A rejected or failed switch SHALL preserve the prior selection and all prior project cache data.

#### Scenario: Block project change while persisted drafts exist
- **WHEN** an owner tries to change the selected project while the active workspace has one or more persisted unsynced local drafts
- **THEN** the system rejects the change and tells the owner to sync or discard drafts first
- **AND** the selected project and local cache remain unchanged

#### Scenario: Drafts in another workspace do not block a project change
- **WHEN** an owner changes a project in a workspace that has no drafts but another workspace owned by the same user has drafts
- **THEN** the project change proceeds if the owner confirms it and readiness checks succeed
- **AND** cache data for the selected workspace's previous project is cleared without affecting the other workspace

#### Scenario: Confirm and complete a project change without drafts
- **WHEN** no persisted unsynced drafts exist and the owner confirms a change to a project that passes readiness checks
- **THEN** the system replaces the selected project and atomically clears all project-owned cache data for the previous project
- **AND** the onboarding checklist reports the new project as ready

#### Scenario: Cancel or fail a project change
- **WHEN** the owner cancels confirmation, readiness validation fails, or persistence fails during a project change
- **THEN** the prior selected project and its project-scoped cache remain unchanged

#### Scenario: First project selection does not clear unrelated workspace data
- **WHEN** an owner selects the first ready project for a workspace
- **THEN** the system saves the selection without deleting workspace data that is not owned by a previous project

### Requirement: Guide owners through workspace readiness
The system SHALL present the connection checklist on the `/settings` page in the order Jira connected, Xray connected, and project selected, grouped into cards. The checklist SHALL expose actionable incomplete or failed states without exposing credentials, tokens, or JWTs.

#### Scenario: Show project selection as the next onboarding step
- **WHEN** Jira and Xray are connected but no project is selected
- **THEN** the settings page shows Jira connected and Xray connected as complete
- **AND** it prompts the owner to select a project

#### Scenario: Show ready workspace checklist
- **WHEN** the workspace has a project whose Jira metadata and Xray access probes succeeded
- **THEN** the checklist marks Jira, Xray, and project selection complete and shows Ready

#### Scenario: Settings keeps onboarding behavior
- **WHEN** a signed-in owner opens `/settings`
- **THEN** the owner can connect Xray, select a project, and pull folders with the same behavior as before the redesign

### Requirement: Require a ready workspace for repository pages
The system SHALL prevent access to project repository pages, which are `/repository` and `/tests/*`, unless the active owned workspace has a ready project selection. An authenticated owner whose workspace is not ready SHALL be redirected to `/settings`; APIs serving project repository data SHALL reject requests when the workspace is not ready.

#### Scenario: Redirect from repository page when no project is selected
- **WHEN** an authenticated owner opens `/repository` or `/tests/ONEDS-1` without a ready project
- **THEN** the owner is redirected to `/settings`

#### Scenario: Reject repository API request for an unready workspace
- **WHEN** an authenticated owner whose workspace is not ready calls a repository data API
- **THEN** the request is rejected
