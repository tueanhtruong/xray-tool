## Purpose

Gives every part of the server one structured logger that cannot leak credentials, and a wrapper type for values that must never be printed, so that log output is safe to collect, share, and attach to bug reports.

## ADDED Requirements

### Requirement: Structured JSON log lines
The server SHALL write each log entry to standard output as one line of JSON containing at least a timestamp, a level, and a message, plus any structured fields supplied by the caller. Log output SHALL NOT use free-form multi-line text.

#### Scenario: One entry, one line
- **WHEN** the server logs an entry with structured fields
- **THEN** the output is exactly one line that parses as JSON with `level`, `msg`, and a timestamp

### Requirement: Deny-list redaction of sensitive keys
The logger SHALL replace the value of any field whose key is on the sensitive-key list with `[REDACTED]`, at any depth, inside arrays, and inside error cause chains. Key matching SHALL be case-insensitive and SHALL ignore `_` and `-`, so that `Authorization`, `client_secret`, and `x-api-key` style variants are all matched. The list SHALL include at least: `authorization`, `cookie`, `set-cookie`, `password`, `token`, `accessToken`, `refreshToken`, `apiToken`, `clientSecret`, `secret`, `jwt`, `apiKey`, `privateKey`, `encryptionKey`, and `code`.

#### Scenario: Nested headers and body
- **WHEN** an entry is logged with `{ headers: { Authorization: "Bearer abc" }, body: { clientSecret: "xyz" } }`
- **THEN** the log line contains `[REDACTED]`
- **AND** the log line contains neither `abc` nor `xyz`

#### Scenario: Snake-case upstream payload
- **WHEN** an entry is logged with `{ access_token: "tok1", refresh_token: "tok2" }`
- **THEN** the log line contains neither `tok1` nor `tok2`

#### Scenario: Arrays
- **WHEN** an entry is logged with `{ items: [{ password: "p1" }, { ok: true }] }`
- **THEN** the log line does not contain `p1` and still contains `ok`

#### Scenario: Error cause chain
- **WHEN** an error whose `cause` has a `token` property is logged
- **THEN** the log line does not contain the token value

### Requirement: Secrets inside values are scrubbed
The logger SHALL also scrub secrets that appear inside string values, including error messages: any `Bearer <credential>` sequence, any JWT-shaped token (three dot-separated base64url segments starting with `eyJ`), any Atlassian API token (starting with `ATATT`), the user and password embedded in any URL (`scheme://user:password@host`), and any literal secret value registered with the logger at startup (such as the encryption key and the OAuth client secret).

#### Scenario: Token inside an error message
- **WHEN** an error with the message `upstream said: Bearer abc.def.ghi rejected` is logged
- **THEN** the log line does not contain `abc.def.ghi`

#### Scenario: Atlassian API token inside an error message
- **WHEN** an error whose message contains a token starting with `ATATT3xFfGF0` followed by 30 or more token characters is logged
- **THEN** the log line does not contain that token

#### Scenario: Credentials embedded in a URL
- **WHEN** an error with the message `connect failed: postgresql://app:hunter2@db.internal:5432/x` is logged
- **THEN** the log line contains `db.internal` and does not contain `hunter2`

#### Scenario: Registered secret value
- **WHEN** the configured client secret value appears inside an arbitrary logged string
- **THEN** the log line does not contain that value

### Requirement: Redaction is safe for any input
The logger SHALL NOT throw or hang when logging circular structures, very deep structures, `Error` objects, buffers, maps, sets, or objects with throwing getters. Structures beyond a fixed depth SHALL be truncated with a marker. Redaction SHALL NOT mutate the caller's objects.

#### Scenario: Circular reference
- **WHEN** an object that references itself is logged
- **THEN** a line is written and the process keeps running

#### Scenario: Caller's object unchanged
- **WHEN** an object with a `password` field is logged
- **THEN** the original object still holds the original password value

### Requirement: SecretString wrapper
The system SHALL provide a wrapper for sensitive strings whose string conversion, JSON serialization, and console/inspect rendering all yield `[REDACTED]`, and which exposes the real value only through one explicit accessor.

#### Scenario: Stringification and serialization
- **WHEN** a wrapped secret is converted with `String()`, `JSON.stringify`, or a template literal
- **THEN** the result is `[REDACTED]`

#### Scenario: Explicit reveal
- **WHEN** the explicit accessor is called
- **THEN** the original value is returned
