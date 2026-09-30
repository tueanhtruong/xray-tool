# xray-cloud-connection Specification

## Purpose

Allows a signed-in workspace owner to configure Xray Cloud credentials once and use the workspace's Xray GraphQL API without exposing credentials or bearer tokens to the browser.

## Requirements

### Requirement: Verify Xray credentials before saving a workspace connection
The system SHALL allow a signed-in workspace owner to submit an Xray client ID, client secret, and one supported region (Global, US, EU, or AU). The system SHALL authenticate against the selected region before persisting the credentials, and SHALL preserve any existing connection if verification fails.

#### Scenario: Valid credentials are verified and stored
- **WHEN** a signed-in owner submits valid Xray credentials and selects "Test & save"
- **THEN** the system verifies the credentials with Xray and stores both credentials encrypted for that workspace
- **AND** the UI reports "Connected to Xray Cloud"

#### Scenario: Invalid credentials are not saved
- **WHEN** Xray rejects the submitted client ID or secret
- **THEN** the UI reports "Xray rejected these API keys. Create a key in Jira > Apps > Xray > API Keys."
- **AND** no new Xray connection is persisted
- **AND** an existing Xray connection remains unchanged

#### Scenario: Region selection is allow-listed
- **WHEN** a connection request supplies a region outside Global, US, EU, or AU
- **THEN** the request is rejected without sending credentials to an endpoint derived from that value

### Requirement: Expose only non-secret Xray connection status
The system SHALL scope Xray connection settings to the signed-in user's active workspace. Settings responses and rendered pages SHALL expose only the selected region, configured date, and verification status, and SHALL never include the client secret or JWT.

#### Scenario: View configured connection
- **WHEN** an owner opens settings for a workspace with an Xray connection
- **THEN** the owner sees its region, configured date, and last verification status
- **AND** neither client credentials nor JWT are present in the page or API responses

#### Scenario: Unauthenticated or cross-workspace access
- **WHEN** a request attempts to read or modify Xray settings without a valid session for the owning workspace
- **THEN** the system rejects the request and does not disclose connection metadata or secrets

### Requirement: Reuse and renew server-side Xray JWTs
The system SHALL authenticate to Xray using the workspace's encrypted client credentials and send GraphQL requests with a bearer JWT. It SHALL reuse a cached JWT until it is within 60 seconds of its decoded expiry, coordinate concurrent authentication so only one refresh is in flight per workspace and application process, and re-authenticate no more than once after a GraphQL HTTP 401.

#### Scenario: Reuse an unexpired JWT
- **WHEN** the server makes five GraphQL requests using a JWT that expires in ten minutes
- **THEN** all requests reuse the JWT and Xray authentication is called at most once

#### Scenario: Refresh a JWT near expiry
- **WHEN** concurrent GraphQL requests use a cached JWT within 60 seconds of expiry
- **THEN** the server obtains one replacement JWT for those concurrent requests and uses it for their GraphQL requests

#### Scenario: Recover once from an unauthorized GraphQL request
- **WHEN** Xray rejects a GraphQL request with HTTP 401
- **THEN** the server re-authenticates once, retries the GraphQL request once, and returns the successful result if the retry succeeds
- **AND** it does not loop if the retried request is also unauthorized

### Requirement: Bound transient Xray retries and map GraphQL errors
The system SHALL retry Xray GraphQL HTTP 429 and 503 responses no more than three total attempts, honor a valid `Retry-After` delay, and use exponential backoff when that header is absent or invalid. The system SHALL convert GraphQL `errors[]` into an actionable sanitized error without returning upstream secrets or raw sensitive response content.

#### Scenario: Honor Retry-After for rate limiting
- **WHEN** Xray responds with HTTP 429 and `Retry-After: 2`
- **THEN** the server waits at least two seconds before its next attempt
- **AND** the request stops after no more than three total attempts

#### Scenario: Retry temporary service unavailability
- **WHEN** Xray responds with HTTP 503 and no valid `Retry-After` header
- **THEN** the server retries using exponential backoff and stops after no more than three total attempts

#### Scenario: Report GraphQL permission errors safely
- **WHEN** Xray returns GraphQL `errors[]` indicating a permission failure
- **THEN** the caller receives an actionable Xray error
- **AND** the error does not disclose client credentials, JWTs, or unsafe raw upstream content

### Requirement: Keep Xray credentials and JWTs out of browser-visible data
The system SHALL keep Xray client IDs, client secrets, and JWTs server-side, encrypt credentials and any persisted JWT at rest, and prevent these values from appearing in browser responses, cookies, logs, or user-facing errors.

#### Scenario: Inspect browser-visible surfaces
- **WHEN** a user inspects settings pages, API responses, and session cookies after configuring Xray
- **THEN** neither the client secret nor the JWT appears in those surfaces

#### Scenario: Inspect logs after Xray failures
- **WHEN** authentication or GraphQL requests fail
- **THEN** application logs and user-facing errors contain no Xray client secret or JWT
