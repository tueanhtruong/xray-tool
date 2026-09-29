## Purpose

Provides a separately run local stand-in for the Atlassian auth, Jira REST, and Xray APIs. It is the backup target for development and the deterministic target for `pnpm verify` and CI.

## ADDED Requirements

### Requirement: Separately run mock services
The repository SHALL contain the mock services as their own workspace package, started with `pnpm mock`. It SHALL listen on a fixed port (default 4010, overridable by `MOCK_SERVICES_PORT`).

#### Scenario: Start the mock
- **WHEN** a developer runs `pnpm mock`
- **THEN** a process listens on port 4010
- **AND** the output shows the URL it is serving

### Requirement: Mock health endpoint
The mock services SHALL respond to `GET /health` with HTTP 200 and `{ "status": "ok", "service": "mock-services" }`. In this phase no other route is implemented, and unknown routes SHALL return 404.

#### Scenario: Mock health
- **WHEN** the mock is running and a client requests `GET http://localhost:4010/health`
- **THEN** the response is 200 with `status` equal to `"ok"`

#### Scenario: Unimplemented route
- **WHEN** a client requests `GET http://localhost:4010/xray/anything`
- **THEN** the response status is 404

### Requirement: Test runners start the mock on demand
When `NUXT_INTEGRATION_TARGET=mock`, the integration and end-to-end test runners SHALL start the mock services if nothing is already listening on the mock URL, wait until `/health` responds, and stop only a mock they started themselves.

#### Scenario: Integration run with mock target and no mock running
- **WHEN** `NUXT_INTEGRATION_TARGET=mock`, nothing listens on port 4010, and `pnpm test:int` runs
- **THEN** the mock is started before the tests and stopped after them

#### Scenario: Reuse an already-running mock
- **WHEN** a developer already has `pnpm mock` running and runs `pnpm test:int` with the mock target
- **THEN** the tests use the running mock and do not stop it
