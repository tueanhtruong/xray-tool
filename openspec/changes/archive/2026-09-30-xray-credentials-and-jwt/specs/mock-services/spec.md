## MODIFIED Requirements

### Requirement: Mock health endpoint
The mock services SHALL respond to `GET /health` with HTTP 200 and `{ "status": "ok", "service": "mock-services" }`. It SHALL implement deterministic Atlassian OAuth, Jira identity/site, and Xray Cloud authentication and GraphQL endpoints required by the application. Unknown routes SHALL return 404.

#### Scenario: Mock health
- **WHEN** the mock is running and a client requests `GET http://localhost:4010/health`
- **THEN** the response is 200 with `status` equal to `"ok"`

#### Scenario: OAuth authorize endpoint
- **WHEN** a browser requests the configured mock Atlassian authorization endpoint with OAuth parameters
- **THEN** the mock deterministically simulates consent and redirects to the supplied callback with a test authorization code and the supplied state

#### Scenario: OAuth token and identity endpoints
- **WHEN** the application exchanges a valid test authorization code and requests accessible resources and the user profile
- **THEN** the mock returns deterministic token, site, and profile data suitable for sign-in and refresh tests

#### Scenario: Xray authentication and GraphQL endpoints
- **WHEN** the application submits the configured fake Xray credentials to the mock authentication endpoint and then makes a GraphQL request
- **THEN** the mock returns a deterministic fake JWT and a deterministic GraphQL response suitable for connection, token reuse, and retry tests

#### Scenario: Controlled Xray failure behavior
- **WHEN** a test selects a supported Xray failure scenario through the mock control endpoint
- **THEN** Xray authentication or GraphQL requests deterministically produce the configured invalid-credential, unauthorized, rate-limit, or service-unavailable response and expose request counts for assertions

#### Scenario: Unimplemented route
- **WHEN** a client requests an unknown route under the mock service
- **THEN** the response status is 404
