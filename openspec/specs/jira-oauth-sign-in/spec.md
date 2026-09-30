# jira-oauth-sign-in Specification

## Purpose

Allows a QA engineer to connect their Atlassian identity and selected Jira site so the application can make Jira requests with the user's permissions while protecting credentials and session data.

## Requirements

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
- **WHEN** Atlassian returns `error=access_denied` with a valid matching state
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
Unauthenticated requests to the protected pages `/settings`, `/repository`, and `/tests/*` SHALL be redirected to `/login?next=<encoded path and query>`. Unauthenticated requests to protected API routes SHALL receive HTTP 401. The landing page `/`, `/login`, the OAuth and site-selection routes, health, and other explicitly public routes SHALL remain accessible without a session.

#### Scenario: Visit protected page while signed out
- **WHEN** an unauthenticated user requests `/repository?folder=/Autocomplete`
- **THEN** the user is redirected to `/login?next=%2Frepository%3Ffolder%3D%2FAutocomplete`

#### Scenario: Visit the landing page while signed out
- **WHEN** an unauthenticated user requests `/`
- **THEN** the landing page is served and the user is not redirected

#### Scenario: Call protected API while signed out
- **WHEN** an unauthenticated client requests a protected API route
- **THEN** the response status is 401 and contains no session or token data

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
- **THEN** the connection is no longer used for Jira requests
- **AND** the user's session is cleared and the user is asked to sign in again

#### Scenario: API-token requests use the site's REST endpoint
- **WHEN** a Jira request is made for an API-token workspace
- **THEN** the request is sent to the workspace Jira site's `/rest/api/3` endpoint with HTTP Basic authentication
- **AND** OAuth refresh is not attempted

### Requirement: Accept only safe return paths
The system SHALL accept a `next` return path only when it is a same-origin relative path: it starts with a single `/`, contains no scheme, no `//` prefix, no backslash, and no control characters, and is at most 2048 characters. Any other value SHALL be ignored, and the default destination SHALL be used instead. The path SHALL be validated again at the moment it is used for a redirect.

#### Scenario: Relative path accepted
- **WHEN** `next` is `/repository?folder=/Autocomplete`
- **THEN** it is accepted

#### Scenario: External URL refused
- **WHEN** `next` is `https://evil.example/x`, `//evil.example/x`, or `/\evil.example`
- **THEN** it is ignored and the user lands on the default destination after signing in

### Requirement: Return to the requested page after sign-in
After a successful sign-in by any method, including after site selection, the system SHALL send the user to the validated `next` path when one was supplied, and otherwise to `/repository`. A `next` value supplied to the OAuth start route SHALL survive the Atlassian round trip in a server-signed, short-lived, HttpOnly cookie and SHALL be discarded after use. A user whose workspace has no ready project who is sent to a repository page SHALL continue to be redirected to `/settings`.

#### Scenario: Land on the originally requested page
- **WHEN** a signed-out user opened a protected page, signs in with Atlassian, and the callback succeeds for one site
- **THEN** the user lands on the originally requested path

#### Scenario: Next survives site selection
- **WHEN** the user signs in with a `next` path, Atlassian returns multiple sites, and the user selects a site
- **THEN** the user lands on the originally requested path

#### Scenario: Default destination
- **WHEN** the user signs in without a `next` path
- **THEN** the user lands on `/repository`
- **AND** when the workspace has no ready project, the user then arrives at `/settings`

#### Scenario: Tampered next cookie
- **WHEN** the return-path cookie is missing or its signature is invalid
- **THEN** the default destination is used

### Requirement: Keep signed-in users off the login page
A signed-in user who opens `/login` SHALL be redirected to the validated `next` path if supplied, otherwise to `/repository`.

#### Scenario: Signed-in user opens login
- **WHEN** a signed-in user with a ready project opens `/login`
- **THEN** the user is redirected to `/repository`
