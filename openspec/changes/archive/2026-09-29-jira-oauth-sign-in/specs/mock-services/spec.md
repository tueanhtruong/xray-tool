## MODIFIED Requirements

### Requirement: Mock health endpoint
The mock services SHALL respond to `GET /health` with HTTP 200 and `{ "status": "ok", "service": "mock-services" }`. It SHALL implement deterministic Atlassian OAuth and Jira identity/site endpoints required by Jira OAuth sign-in, and unknown routes SHALL return 404.

#### Scenario: Mock health
- **WHEN** the mock is running and a client requests `GET http://localhost:4010/health`
- **THEN** the response is 200 with `status` equal to `"ok"`

#### Scenario: OAuth authorize endpoint
- **WHEN** a browser requests the configured mock Atlassian authorization endpoint with OAuth parameters
- **THEN** the mock deterministically simulates consent and redirects to the supplied callback with a test authorization code and the supplied state

#### Scenario: OAuth token and identity endpoints
- **WHEN** the application exchanges a valid test authorization code and requests accessible resources and the user profile
- **THEN** the mock returns deterministic token, site, and profile data suitable for sign-in and refresh tests

#### Scenario: Unimplemented route
- **WHEN** a client requests an unknown route such as `GET http://localhost:4010/xray/anything`
- **THEN** the response status is 404
