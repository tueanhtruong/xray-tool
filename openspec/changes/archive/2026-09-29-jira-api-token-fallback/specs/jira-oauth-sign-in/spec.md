## MODIFIED Requirements

### Requirement: Provide authenticated Jira requests with transparent token refresh
The system SHALL provide workspace-scoped Jira requests through the same client interface for OAuth and API-token connections. OAuth requests SHALL use `https://api.atlassian.com/ex/jira/{cloudId}`. API-token requests SHALL use the validated Jira site URL's `/rest/api/3` endpoint and HTTP Basic authentication. Before an OAuth request, an access token expiring within 60 seconds SHALL be refreshed server-side. Concurrent OAuth refresh attempts for the same workspace SHALL share one refresh operation, and the rotated access and refresh tokens SHALL be encrypted and persisted before the Jira request proceeds. If OAuth refresh is rejected, the connection SHALL be invalidated for use and the user SHALL be signed out and asked to sign in again.

#### Scenario: Refresh an expiring OAuth access token
- **WHEN** a Jira request is made for an OAuth workspace whose access token expires within 60 seconds and the refresh token is valid
- **THEN** the system refreshes the token, stores the rotated tokens encrypted, and completes the Jira request

#### Scenario: Concurrent OAuth requests share refresh
- **WHEN** multiple Jira requests for the same OAuth workspace need a refresh concurrently
- **THEN** exactly one upstream refresh is performed and all waiting requests use the resulting access token

#### Scenario: Revoked OAuth refresh token
- **WHEN** Atlassian rejects the workspace refresh token
- **THEN** the OAuth connection is no longer used for Jira requests
- **AND** the user's session is cleared and the user is asked to sign in again

#### Scenario: API-token requests use the site's REST endpoint
- **WHEN** a Jira request is made for an API-token workspace
- **THEN** the request is sent to the workspace Jira site's `/rest/api/3` endpoint with HTTP Basic authentication
- **AND** OAuth refresh is not attempted
