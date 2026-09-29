## Purpose

Allows a QA engineer to connect their Atlassian identity and selected Jira site so the application can make Jira requests with the user's permissions while protecting credentials and session data.

## ADDED Requirements

### Requirement: Start Atlassian OAuth sign-in
The system SHALL begin Jira sign-in by redirecting the browser to Atlassian OAuth 2.0 (3LO) authorization with the configured client ID and callback URI, audience `api.atlassian.com`, response type `code`, prompt `consent`, and scopes `read:jira-work write:jira-work read:jira-user read:me offline_access`. The system SHALL generate an unpredictable, short-lived state value and bind it to the browser using a signed, httpOnly cookie. The authorization-code exchange SHALL POST a JSON body containing `grant_type`, `client_id`, `client_secret`, `code`, and the exact configured `redirect_uri`.

#### Scenario: Begin sign-in
- **WHEN** an unauthenticated user requests Jira sign-in and OAuth configuration is valid
- **THEN** the browser is redirected to Atlassian authorization with the required audience, scopes, callback URI, and response type
- **AND** a short-lived httpOnly state cookie is set

#### Scenario: Exchange authorization code
- **WHEN** the callback contains a valid code and matching state
- **THEN** the server posts the code, client credentials, grant type, and exact callback URI as JSON to Atlassian's token endpoint
- **AND** the authorization code is not exposed to browser-facing application APIs

#### Scenario: OAuth configuration is missing
- **WHEN** an unauthenticated user requests Jira sign-in without the required Atlassian client configuration
- **THEN** sign-in does not redirect to Atlassian
- **AND** the user receives an actionable setup message without configuration values being disclosed

### Requirement: Verify OAuth callback before using authorization code
The system SHALL accept an OAuth callback only when its state matches the valid state cookie. A state mismatch or missing state SHALL not exchange the authorization code or persist credentials and SHALL show `Sign-in could not be verified. Please try again.` A user denial SHALL return to `/login` with an explanation that access was not granted.

#### Scenario: Reject state mismatch
- **WHEN** the callback state does not match the browser's valid state cookie
- **THEN** the authorization code is not exchanged and no tokens are stored
- **AND** the user sees `Sign-in could not be verified. Please try again.`

#### Scenario: Reject missing or expired state
- **WHEN** the callback has no valid state cookie
- **THEN** the authorization code is not exchanged and the user is asked to retry sign-in

#### Scenario: User denies consent
- **WHEN** Atlassian returns `error=access_denied`
- **THEN** the user is returned to `/login` with a message explaining that access was not granted

### Requirement: Connect the Atlassian account to one selected Jira site
After validating state, the system SHALL exchange the authorization code server-side, retrieve the Atlassian profile and accessible Jira sites, and persist the user identity. If exactly one site is accessible, the system SHALL select it automatically. If multiple sites are accessible, the user SHALL select one before a workspace and Jira connection are created. Only the selected site SHALL be persisted as a workspace and connection for this sign-in. Any temporary grant needed to complete site selection SHALL remain server-side, be encrypted, and expire after a short bounded period.

#### Scenario: First sign-in with one accessible site
- **WHEN** the user completes consent and Atlassian returns one accessible Jira site
- **THEN** the system creates or updates the User, the selected Workspace, and its JiraConnection
- **AND** tokens are encrypted before persistence
- **AND** the user is signed in to the workspace

#### Scenario: Multiple accessible sites
- **WHEN** the user completes consent and Atlassian returns multiple accessible Jira sites
- **THEN** the user is shown a site picker before continuing
- **AND** no Jira workspace or JiraConnection is created until a site is selected
- **AND** selecting a site creates a connection only for that site

#### Scenario: Existing account signs in again
- **WHEN** an existing Atlassian account completes sign-in and selects an accessible site
- **THEN** the existing User and matching selected-site workspace/connection are updated rather than duplicated

### Requirement: Keep OAuth tokens and grants on the server
Access tokens and refresh tokens SHALL be encrypted at rest using the application's secret-encryption capability. Tokens SHALL NOT be included in browser-facing API responses, rendered page data, URLs, or session cookies. Temporary OAuth grants used for site selection SHALL also be encrypted and SHALL be removed or expire after the site-selection flow completes or times out.

#### Scenario: Inspect browser-visible data
- **WHEN** an authenticated user inspects API responses, page data, and the session cookie
- **THEN** no access token, refresh token, or OAuth client secret is present

#### Scenario: Expire abandoned site selection
- **WHEN** a user does not complete site selection before the pending grant expires
- **THEN** the pending grant cannot be used to create a connection and is eligible for cleanup

### Requirement: Maintain an ID-only sealed session
After sign-in, the system SHALL issue a sealed httpOnly session cookie with `SameSite=Lax` and `Secure` in secure deployments. The session payload SHALL contain only the user ID and active workspace ID, never OAuth tokens. Logout SHALL clear the session.

#### Scenario: Sign out
- **WHEN** a signed-in user submits the logout action
- **THEN** the session cookie is cleared
- **AND** subsequent requests are treated as unauthenticated

### Requirement: Protect authenticated pages and APIs
Unauthenticated requests to protected pages SHALL be redirected to `/login`. Unauthenticated requests to protected API routes SHALL receive HTTP 401. Login, OAuth callback, health, and other explicitly public routes SHALL remain accessible without a session.

#### Scenario: Visit protected page while signed out
- **WHEN** an unauthenticated user requests a protected page
- **THEN** the user is redirected to `/login`

#### Scenario: Call protected API while signed out
- **WHEN** an unauthenticated client requests a protected API route
- **THEN** the response status is 401 and contains no session or token data

### Requirement: Provide authenticated Jira requests with transparent token refresh
The system SHALL provide Jira requests for a workspace through `https://api.atlassian.com/ex/jira/{cloudId}`. Before a request, an access token expiring within 60 seconds SHALL be refreshed server-side. Concurrent refresh attempts for the same workspace SHALL share one refresh operation, and the rotated access and refresh tokens SHALL be encrypted and persisted before the Jira request proceeds. If refresh is rejected, the connection SHALL be invalidated for use and the user SHALL be signed out and asked to sign in again.

#### Scenario: Refresh an expiring access token
- **WHEN** a Jira request is made for a workspace whose access token expires within 60 seconds and the refresh token is valid
- **THEN** the system refreshes the token, stores the rotated tokens encrypted, and completes the Jira request

#### Scenario: Concurrent requests share refresh
- **WHEN** multiple Jira requests for the same workspace need a refresh concurrently
- **THEN** exactly one upstream refresh is performed and all waiting requests use the resulting access token

#### Scenario: Revoked refresh token
- **WHEN** Atlassian rejects the workspace refresh token
- **THEN** the connection is no longer used for Jira requests
- **AND** the user's session is cleared and the user is asked to sign in again
