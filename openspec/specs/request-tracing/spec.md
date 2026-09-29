# request-tracing Specification

## Purpose

Lets a developer or user match a response they received to the server log entries it produced, using one request ID that is safe to echo and safe to log.

## Requirements

### Requirement: Every response carries a request ID
The server SHALL include an `x-request-id` header on every HTTP response, including error responses and responses to unknown routes.

#### Scenario: Health request
- **WHEN** a client requests `GET /api/health`
- **THEN** the response has an `x-request-id` header

#### Scenario: Unknown route
- **WHEN** a client requests a path that does not exist
- **THEN** the 404 response has an `x-request-id` header

### Requirement: Safe inbound request IDs are reused
If the request carries an `x-request-id` header whose entire value matches `^[A-Za-z0-9-]{8,64}$`, the server SHALL use it as the request ID. Otherwise the server SHALL generate a new unique ID and ignore the inbound value.

#### Scenario: Valid inbound ID
- **WHEN** a client sends `x-request-id: abc12345-def`
- **THEN** the response `x-request-id` is `abc12345-def`

#### Scenario: Unsafe inbound ID is replaced
- **WHEN** a client sends an `x-request-id` containing whitespace, a newline, quotes, or more than 64 characters
- **THEN** the response `x-request-id` is a different, generated value that matches the safe pattern
- **AND** the unsafe value appears in no log line

#### Scenario: Too-short inbound ID
- **WHEN** a client sends `x-request-id: abc`
- **THEN** the response `x-request-id` is a generated value

#### Scenario: Generated IDs are unique
- **WHEN** two requests are sent without `x-request-id`
- **THEN** their response IDs differ

### Requirement: Request ID on every log line
Every log entry written while a request is being handled, whether by a route handler, a service, or an integration client, SHALL include that request's ID as `requestId`, without the caller passing it explicitly. Entries written outside any request (for example at startup) SHALL omit it.

#### Scenario: Log from a lower layer
- **WHEN** service or integration code logs during a request
- **THEN** the entry contains that request's `requestId`

#### Scenario: Concurrent requests
- **WHEN** two requests are handled concurrently
- **THEN** each log entry carries the ID of its own request only

### Requirement: Access log entry per request
The server SHALL write one log entry when each request completes, containing the request ID, HTTP method, path without the query string, response status, and duration in milliseconds. Query strings and request or response bodies SHALL NOT be included.

#### Scenario: Health request is logged
- **WHEN** a client requests `GET /api/health`
- **THEN** the server log contains an entry for that request with the same `requestId` as the response header, method `GET`, path `/api/health`, and status `200`

#### Scenario: Query string excluded
- **WHEN** a client requests `GET /api/health?code=abc123&state=xyz`
- **THEN** the access log entry path is `/api/health` and the log contains neither `abc123` nor `xyz`
