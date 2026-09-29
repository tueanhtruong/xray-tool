## Purpose

Guarantees that anything a browser or API client receives when something fails is safe to show, while developers keep full failure detail in the server log, so that errors cannot become a channel for leaking secrets or internals.

## ADDED Requirements

### Requirement: Sanitized client error body
For every failed API request the server SHALL respond with a JSON body containing exactly `statusCode`, `message`, and `requestId`, where `requestId` equals the response's `x-request-id` header. The body SHALL NOT contain stack traces, error causes, upstream response bodies, or extra data fields.

#### Scenario: Unexpected error in production
- **WHEN** a route throws an unexpected error whose message contains a token and the server runs in production mode
- **THEN** the response status is 500
- **AND** the body has `statusCode`, a generic `message`, and `requestId` only
- **AND** the body contains no stack trace and not the token

#### Scenario: Request ID matches header
- **WHEN** any API request fails
- **THEN** the body `requestId` equals the `x-request-id` response header

### Requirement: Message policy by error class
For server errors (status 500 and above) the client message SHALL be a generic message for the status and SHALL NOT include the original error message. For client errors (status below 500) deliberately raised by the application with a message, that message SHALL be returned; errors of unknown origin with a client status SHALL receive the generic message for that status. Errors that wrap an upstream (Jira, Xray, Atlassian) response SHALL NOT expose the upstream body to the client in production.

#### Scenario: Deliberate client error keeps its message
- **WHEN** a route deliberately rejects a request with status 400 and the message `Summary is required`
- **THEN** the response body message is `Summary is required`

#### Scenario: Upstream failure
- **WHEN** a route fails because an upstream service returned an error body containing a credential
- **THEN** the client response contains a generic message and none of the upstream body

#### Scenario: Unknown route
- **WHEN** a client requests an unknown API path
- **THEN** the response is 404 with `statusCode`, a generic `message`, and `requestId`
- **AND** the HTTP status line carries the generic text for the status, not the original error's status text

### Requirement: Full detail is logged, redacted
Each failed request SHALL produce a log entry containing the request ID and status, passed through the same redaction as all other logs. For server errors (status 500 and above) the entry SHALL be at error level and contain the error message, stack, and cause chain. For client errors (status below 500) the entry SHALL be at warn level and contain the error message only, so routine failures such as unknown routes do not flood the log with stacks.

#### Scenario: Server error logged with redaction
- **WHEN** a route throws an error whose message contains `Bearer abc.def.ghi`
- **THEN** an error-level log entry exists with the request's `requestId`
- **AND** it contains the stack but not `abc.def.ghi`

#### Scenario: Client error logged briefly
- **WHEN** a client requests an unknown API path
- **THEN** a warn-level log entry exists with the request's `requestId` and status 404
- **AND** it contains no stack

### Requirement: Page requests keep the framework error page
The sanitized JSON contract SHALL apply to requests under `/api/`. Requests for pages SHALL continue to receive the framework's HTML error page, which SHALL NOT include stack traces or error messages of unexpected errors in production.

#### Scenario: API request gets JSON
- **WHEN** a request to a failing `/api/` route sends `accept: application/json`
- **THEN** the response content type is JSON with the sanitized body
