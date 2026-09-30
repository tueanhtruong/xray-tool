## MODIFIED Requirements

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
