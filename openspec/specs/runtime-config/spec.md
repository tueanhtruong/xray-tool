# runtime-config Specification

## Purpose

Defines how the server gets and validates its configuration at startup, including which Jira/Xray target (live sandbox or mock) it talks to, so misconfiguration fails fast with a clear message.

## Requirements

### Requirement: Configuration validated at server start
The server SHALL validate its runtime configuration when it starts, not at build time. If validation fails, the server SHALL print one error message that names every missing or invalid variable by its environment variable name and points to `.env.example`, and the process SHALL exit with a non-zero code.

#### Scenario: Missing database URL
- **WHEN** the built server starts with `NUXT_DATABASE_URL` unset
- **THEN** the process exits with a non-zero code
- **AND** stderr contains `NUXT_DATABASE_URL`
- **AND** stderr contains `.env.example`

#### Scenario: Invalid URL value
- **WHEN** the server starts with `NUXT_MOCK_SERVICES_URL` set to a value that is not a URL
- **THEN** the process exits with a non-zero code and stderr names `NUXT_MOCK_SERVICES_URL`

#### Scenario: Build does not require runtime configuration
- **WHEN** the production build runs without a `.env` file or any runtime variables
- **THEN** the build succeeds

### Requirement: Environment template lists every planned variable
`.env.example` SHALL list every environment variable the application plans to use, each with a short comment. Values SHALL be placeholders or local-only development defaults, never real credentials. `.env` SHALL be ignored by version control.

#### Scenario: Template works for local bootstrap
- **WHEN** a developer copies `.env.example` to `.env` without editing it
- **THEN** bootstrap and the health check work against the local database

#### Scenario: No real secrets committed
- **WHEN** `.env.example` is inspected
- **THEN** every credential variable (Atlassian OAuth client secret, Jira API token, Xray client secret, encryption key) has an empty or obviously placeholder value

### Requirement: Integration target switch
The configuration SHALL accept `NUXT_INTEGRATION_TARGET` with values `live` or `mock`, defaulting to `live`. The Atlassian auth, Atlassian API, and Xray base URLs SHALL be derived from the target: official Atlassian/Xray endpoints for `live`, and paths under `NUXT_MOCK_SERVICES_URL` for `mock`. Any individual base URL SHALL be overridable by its own variable. Target resolution SHALL happen in exactly one place in server configuration.

#### Scenario: Mock target resolves to mock URLs
- **WHEN** `NUXT_INTEGRATION_TARGET=mock` and `NUXT_MOCK_SERVICES_URL=http://localhost:4010`
- **THEN** the resolved Xray base URL starts with `http://localhost:4010`

#### Scenario: Live target resolves to official endpoints
- **WHEN** `NUXT_INTEGRATION_TARGET=live` and no base URL overrides are set
- **THEN** the resolved Atlassian auth URL is `https://auth.atlassian.com`

#### Scenario: Individual override wins
- **WHEN** `NUXT_XRAY_BASE_URL` is set explicitly
- **THEN** the resolved Xray base URL equals that value regardless of target

#### Scenario: Unknown target rejected
- **WHEN** `NUXT_INTEGRATION_TARGET=staging`
- **THEN** startup fails and the error names `NUXT_INTEGRATION_TARGET` and its allowed values

### Requirement: Credentials not required before they are used
Jira and Xray credential variables SHALL be optional in this phase. The server SHALL start with all of them empty.

#### Scenario: Start without Atlassian credentials
- **WHEN** the server starts with a valid database URL and no Atlassian or Xray credentials
- **THEN** startup succeeds
