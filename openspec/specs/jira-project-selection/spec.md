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
The system SHALL block changing a workspace's selected project while that workspace has unsynced local drafts, and SHALL tell the owner to sync or discard those drafts first. When no drafts exist, the system SHALL require explicit confirmation before switching projects and SHALL clear project-scoped local cache as part of the successful switch. A rejected or failed switch SHALL preserve the prior selection and cache.

#### Scenario: Block project change while drafts exist
- **WHEN** an owner tries to change the selected project while the workspace has unsynced local drafts
- **THEN** the system rejects the change and tells the owner to sync or discard drafts first
- **AND** the selected project and local cache remain unchanged

#### Scenario: Confirm and complete a project change without drafts
- **WHEN** no unsynced drafts exist and the owner confirms a change to a project that passes readiness checks
- **THEN** the system replaces the selected project and clears cache belonging to the previous project
- **AND** the onboarding checklist reports the new project as ready

#### Scenario: Cancel or fail a project change
- **WHEN** the owner cancels the confirmation or the new project's readiness checks fail
- **THEN** the prior selected project and its local cache remain unchanged

### Requirement: Guide owners through workspace readiness
The system SHALL present the connection checklist in the order Jira connected, Xray connected, and project selected. The checklist SHALL expose actionable incomplete or failed states without exposing credentials, tokens, or JWTs.

#### Scenario: Show project selection as the next onboarding step
- **WHEN** Jira and Xray are connected but no project is selected
- **THEN** the workspace home shows Jira connected and Xray connected as complete
- **AND** it prompts the owner to select a project

#### Scenario: Show ready workspace checklist
- **WHEN** the workspace has a project whose Jira metadata and Xray access probes succeeded
- **THEN** the checklist marks Jira, Xray, and project selection complete and shows Ready

### Requirement: Require a ready workspace for repository pages
The system SHALL prevent access to project repository pages unless the active owned workspace has a ready project selection. An authenticated owner whose workspace is not ready SHALL be directed to the workspace onboarding checklist; APIs serving project repository data SHALL reject requests when the workspace is not ready.

#### Scenario: Redirect from repository page when no project is selected
- **WHEN** an authenticated owner opens a project repository page without a ready project
- **THEN** the owner is redirected to the workspace onboarding checklist

#### Scenario: Reject repository API request for an unready workspace
- **WHEN** a project repository API request is made for a workspace without a ready project
- **THEN** the API rejects the request with an actionable not-ready response
- **AND** it does not call Jira or Xray for a project-scoped operation
