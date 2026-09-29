## Purpose

Lets developers, tests, and future deployment probes check that the app is running, see whether the database is reachable, and see which version is deployed.

## ADDED Requirements

### Requirement: Health endpoint
The server SHALL expose `GET /api/health`, returning HTTP 200 with a JSON body `{ "status": "ok", "db": "ok" | "down", "version": string }`, where `version` is the application version from the root package manifest.

#### Scenario: Healthy app and database
- **WHEN** the environment is bootstrapped, the app is running, and a client requests `GET /api/health`
- **THEN** the response status is 200
- **AND** the body has `status` equal to `"ok"`, `db` equal to `"ok"`, and a non-empty `version`

#### Scenario: Database unreachable
- **WHEN** the database cannot be reached and a client requests `GET /api/health`
- **THEN** the response status is 200 with `db` equal to `"down"`
- **AND** the response arrives within 3 seconds

### Requirement: Health response leaks nothing
The health response SHALL NOT include connection strings, hostnames, credentials, stack traces, or driver error messages.

#### Scenario: Database error details hidden
- **WHEN** the database probe fails with a driver error
- **THEN** the response body contains only the `status`, `db`, and `version` fields
