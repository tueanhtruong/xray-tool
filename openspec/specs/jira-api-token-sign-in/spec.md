# jira-api-token-sign-in Specification

## Purpose

Allows users who cannot use Atlassian OAuth to connect a Jira site with an email and API token, while keeping credentials private and ensuring the application uses a consistent Jira request interface.

## Requirements

### Requirement: Validate API-token Jira site URLs before outbound requests
The system SHALL accept a Jira site URL for API-token sign-in only when it uses HTTPS, has a hostname exactly matching an allowed Atlassian Jira site suffix (initially `.atlassian.net`), and contains no user information or explicit port. The path SHALL be empty, `/`, or the exact Jira REST API base path `/rest/api/3` with an optional trailing slash; the validated URL SHALL be normalized to its HTTPS origin before the application appends its own fixed REST endpoint. Query strings and fragments SHALL be rejected. URL validation SHALL occur before any outbound request. The allow-list SHALL be extendable through server configuration.

#### Scenario: Reject non-HTTPS URL without contacting Jira
- **WHEN** API-token sign-in is submitted with an HTTP site URL
- **THEN** the request is rejected with a site URL validation error
- **AND** no outbound request is made

#### Scenario: Reject an IP address as the site hostname
- **WHEN** API-token sign-in is submitted with `https://169.254.169.254`
- **THEN** the request is rejected with a site URL validation error
- **AND** no outbound request is made

#### Scenario: Reject a deceptive Atlassian hostname
- **WHEN** API-token sign-in is submitted with `https://acme.atlassian.net.evil.io`
- **THEN** the request is rejected with a site URL validation error
- **AND** no outbound request is made

#### Scenario: Reject embedded credentials, port, or path
- **WHEN** API-token sign-in is submitted with user information, an explicit port, or a non-root path other than the exact `/rest/api/3` base path
- **THEN** the request is rejected with a site URL validation error
- **AND** no outbound request is made

### Requirement: Verify API-token credentials before persisting a connection
The system SHALL send `GET {site}/rest/api/3/myself` using HTTP Basic authentication constructed from the submitted email and API token. It SHALL create or update a user, workspace, API-token Jira connection, and sealed session only after Jira confirms the credentials. For rejected credentials, the system SHALL persist no user, workspace, or connection and SHALL show `Jira rejected these credentials. Check the email and create a new API token at id.atlassian.com.`

#### Scenario: Connect with valid API-token credentials
- **WHEN** the user submits an allowed site URL, email, and credentials accepted by Jira `/myself`
- **THEN** the user is signed in to the verified workspace
- **AND** the persisted connection records the API-token auth method
- **AND** the API token is encrypted at rest

#### Scenario: Reject invalid credentials without persistence
- **WHEN** Jira `/myself` rejects the submitted email and API token
- **THEN** the user sees `Jira rejected these credentials. Check the email and create a new API token at id.atlassian.com.`
- **AND** no user, workspace, or Jira connection is created or updated

#### Scenario: Resolve identity and site from Jira response
- **WHEN** Jira `/myself` accepts the submitted credentials
- **THEN** the persisted user is keyed by Jira's stable account ID
- **AND** the workspace is associated with the validated site URL

### Requirement: Protect API tokens from browser-visible data
The system SHALL encrypt API tokens at rest using the application's secret-encryption capability and SHALL NOT include a token in rendered pages, API responses, URLs, logs, or session cookies. The authenticated settings response SHALL expose the connection method, email, and token-save date without exposing the token.

#### Scenario: Inspect browser-visible responses after connection
- **WHEN** an authenticated user inspects pages, API responses, URLs, and the session cookie after connecting
- **THEN** none contains the API token

#### Scenario: Inspect connection settings
- **WHEN** an authenticated user opens Jira connection settings
- **THEN** the settings show the auth method, email, and token-save date
- **AND** do not return the API token

### Requirement: Provide API-token Jira requests through the workspace client
The system SHALL authenticate API-token workspace requests against `{site}/rest/api/3` using HTTP Basic authentication. OAuth and API-token workspaces SHALL be usable through the same workspace-scoped Jira client method. OAuth refresh and reauthentication behavior SHALL remain unchanged.

#### Scenario: Fetch Jira resource for OAuth and API-token workspaces
- **WHEN** the same workspace-scoped Jira client method fetches `/myself` for an OAuth workspace and an API-token workspace
- **THEN** both requests succeed using the correct site base URL and authentication method for each

### Requirement: Replace or disconnect an API-token connection
The system SHALL allow an authenticated workspace owner to replace an API token only after validating the replacement against Jira `/myself`. A successful replacement SHALL discard the old token and persist the new token encrypted. The system SHALL allow an authenticated workspace owner to disconnect the current Jira connection and SHALL clear the application session.

#### Scenario: Replace token with valid credentials
- **WHEN** the workspace owner submits a new API token that Jira accepts for the configured email and site
- **THEN** the new token is encrypted and saved
- **AND** the prior token can no longer be used

#### Scenario: Preserve existing connection after rejected replacement
- **WHEN** the workspace owner submits a replacement token that Jira rejects
- **THEN** the replacement is rejected without overwriting the existing connection

#### Scenario: Disconnect Jira connection
- **WHEN** the workspace owner disconnects the current Jira connection
- **THEN** the connection is removed or invalidated
- **AND** the application session is cleared

### Requirement: Rate-limit API-token sign-in attempts
The system SHALL limit API-token sign-in attempts by client IP to no more than 10 attempts in any rolling 60-second interval. Requests beyond the limit SHALL be rejected before making an outbound Jira request, and the response SHALL not reveal whether an account or token is valid.

#### Scenario: Stay within sign-in attempt limit
- **WHEN** a client IP submits no more than 10 API-token sign-in attempts within 60 seconds
- **THEN** each attempt is evaluated subject to URL and credential validation

#### Scenario: Reject excess sign-in attempts
- **WHEN** a client IP submits more than 10 API-token sign-in attempts within 60 seconds
- **THEN** the excess attempt is rejected with a rate-limit response
- **AND** no outbound Jira request is made for that attempt

### Requirement: Mock valid and invalid Jira API-token credentials
The deterministic mock services SHALL support Jira `/rest/api/3/myself` requests using Basic authentication and configurable valid and invalid credential scenarios, returning stable fake identity data on success and an authentication failure on rejection.

#### Scenario: Mock accepts configured credentials
- **WHEN** a Jira `/rest/api/3/myself` request uses the configured mock-valid Basic credentials
- **THEN** the mock returns a successful response with a stable fake account ID and profile fields

#### Scenario: Mock rejects invalid credentials
- **WHEN** a Jira `/rest/api/3/myself` request uses invalid Basic credentials
- **THEN** the mock returns an authentication failure

### Requirement: Offer sign-in methods as tabs on the login page
The `/login` page SHALL present a centered card with two keyboard-operable tabs: "Atlassian OAuth", selected by default, and "Email + API token". The OAuth tab SHALL offer a "Continue with Atlassian" action that navigates the full page to the OAuth start route, preserving any valid `next` path, and helper text stating that tokens are encrypted and never sent to the browser. The page SHALL show a banner for sign-in failure messages produced by the OAuth flow.

#### Scenario: Default tab
- **WHEN** a user opens `/login`
- **THEN** "Atlassian OAuth" is the selected tab

#### Scenario: Switch to API token
- **WHEN** the user selects "Email + API token"
- **THEN** the fields "Jira site URL", "Email", and "API token" are shown
- **AND** "Verify & connect" is disabled

#### Scenario: Keyboard tab navigation
- **WHEN** focus is on a tab and the user presses an arrow key
- **THEN** focus and selection move to the adjacent tab

### Requirement: Validate the API-token form before submitting
The API-token form SHALL mask the token field, disable browser autocompletion for it, and keep "Verify & connect" disabled until the site URL matches `https://<site>.atlassian.net`, the email is well formed, and a token is entered. An invalid site URL SHALL show the inline message "Use https://<your-site>.atlassian.net". The server SHALL remain the authority on site-URL acceptance. While the request is pending the form SHALL show progress, server errors SHALL appear inline, and the token field SHALL be emptied after every submit.

#### Scenario: Invalid site URL
- **WHEN** the user enters `http://acme.example.com` as the site
- **THEN** the inline message "Use https://<your-site>.atlassian.net" is shown
- **AND** "Verify & connect" stays disabled

#### Scenario: Token never lingers
- **WHEN** the user submits valid API-token credentials
- **THEN** the API token field is empty afterwards
- **AND** the token appears in no browser storage or page text

#### Scenario: Server rejects the credentials
- **WHEN** the server responds that Jira rejected the credentials
- **THEN** the message is shown inline and the token field is empty

### Requirement: Return a navigation target after API-token sign-in
A successful API-token sign-in SHALL respond with a JSON body `{ "redirectTo": "<path>" }` where the path is the validated `next` value supplied in the request if present, otherwise `/repository`, and the client SHALL navigate there. The response SHALL NOT be an HTTP redirect.

#### Scenario: Sign in from a protected-page redirect
- **WHEN** the user signs in with an API token from `/login?next=%2Frepository`
- **THEN** the response contains `redirectTo` `/repository` and the browser navigates there

#### Scenario: Unsafe next is ignored
- **WHEN** the submitted `next` is `https://evil.example/x`
- **THEN** the response contains `redirectTo` `/repository`
