# mock-services Specification

## Purpose

Provides a separately run local stand-in for the Atlassian auth, Jira REST, and Xray APIs. It is the backup target for development and the deterministic target for `pnpm verify` and CI.

## Requirements

### Requirement: Separately run mock services
The repository SHALL contain the mock services as their own workspace package, started with `pnpm mock`. It SHALL listen on a fixed port (default 4010, overridable by `MOCK_SERVICES_PORT`).

#### Scenario: Start the mock
- **WHEN** a developer runs `pnpm mock`
- **THEN** a process listens on port 4010
- **AND** the output shows the URL it is serving

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

### Requirement: Test runners start the mock on demand
When `NUXT_INTEGRATION_TARGET=mock`, the integration and end-to-end test runners SHALL start the mock services if nothing is already listening on the mock URL, wait until `/health` responds, and stop only a mock they started themselves.

#### Scenario: Integration run with mock target and no mock running
- **WHEN** `NUXT_INTEGRATION_TARGET=mock`, nothing listens on port 4010, and `pnpm test:int` runs
- **THEN** the mock is started before the tests and stopped after them

#### Scenario: Reuse an already-running mock
- **WHEN** a developer already has `pnpm mock` running and runs `pnpm test:int` with the mock target
- **THEN** the tests use the running mock and do not stop it

### Requirement: Count write requests in the mock
The mock services SHALL count requests that would modify remote data: Jira REST requests other than GET, and Xray GraphQL requests whose operation is a mutation. Token exchange and Xray authentication requests SHALL NOT be counted. The control endpoint SHALL expose the count in its state response and SHALL support resetting it.

#### Scenario: Read-only traffic
- **WHEN** a workflow issues only Jira GET requests, Xray queries, OAuth token exchange, and Xray authentication
- **THEN** the write-request count is 0

#### Scenario: Count a mutation
- **WHEN** a client sends an Xray GraphQL mutation to the mock
- **THEN** the write-request count increases by one

#### Scenario: Reset the count
- **WHEN** a test sends the reset instruction through the control endpoint
- **THEN** the write-request count returns to 0
