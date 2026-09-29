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
Jira and Xray credential variables, and the encryption key, SHALL be optional in this phase. The server SHALL start with all of them empty. An empty encryption key defers failure to the first attempt to encrypt or decrypt; a non-empty encryption key is validated at startup by the encryption key requirement.

#### Scenario: Start without Atlassian credentials
- **WHEN** the server starts with a valid database URL and no Atlassian or Xray credentials
- **THEN** startup succeeds

#### Scenario: Start without an encryption key
- **WHEN** the server starts with a valid database URL and `NUXT_ENCRYPTION_KEY` unset
- **THEN** startup succeeds

### Requirement: Encryption key validated when set
When `NUXT_ENCRYPTION_KEY` is non-empty, the server SHALL validate at start that it is valid base64 and decodes to exactly 32 bytes. On failure the process SHALL exit non-zero and print a message that names `NUXT_ENCRYPTION_KEY`, states that a 32-byte base64 key is required, and shows `openssl rand -base64 32` as the way to generate one. The message SHALL NOT contain the key value.

#### Scenario: Key too short
- **WHEN** the server starts with `NUXT_ENCRYPTION_KEY` set to a base64 value that decodes to 16 bytes
- **THEN** the process exits with a non-zero code
- **AND** stderr names `NUXT_ENCRYPTION_KEY`, mentions 32 bytes, and contains `openssl rand -base64 32`
- **AND** stderr does not contain the supplied key value

#### Scenario: Key not base64
- **WHEN** the server starts with `NUXT_ENCRYPTION_KEY` set to `not base64 !!!`
- **THEN** the process exits with a non-zero code and stderr names `NUXT_ENCRYPTION_KEY`

#### Scenario: Valid key
- **WHEN** the server starts with `NUXT_ENCRYPTION_KEY` set to 32 random bytes encoded as base64
- **THEN** startup succeeds

### Requirement: Local bootstrap provides an encryption key
Bootstrap SHALL fill an empty `NUXT_ENCRYPTION_KEY` in the developer's `.env` with a newly generated valid key, SHALL NOT overwrite a non-empty value, and SHALL NOT place any key in `.env.example` or version control.

#### Scenario: Fresh bootstrap
- **WHEN** a developer copies `.env.example` to `.env` and runs bootstrap
- **THEN** `.env` contains a valid `NUXT_ENCRYPTION_KEY`

#### Scenario: Re-run keeps the key
- **WHEN** bootstrap runs again
- **THEN** the `NUXT_ENCRYPTION_KEY` value in `.env` is unchanged

### Requirement: OAuth configuration is optional until sign-in is used
Atlassian OAuth client ID, client secret, and redirect URI SHALL remain optional at server startup so development and tests can run without Atlassian credentials. The Jira OAuth sign-in flow SHALL require all three values before redirecting to Atlassian or exchanging an authorization code. Missing settings SHALL produce an actionable error naming the missing environment variable without disclosing any configured value.

#### Scenario: Start without Atlassian OAuth credentials
- **WHEN** the server starts with valid database configuration and Atlassian OAuth settings unset
- **THEN** startup succeeds

#### Scenario: Attempt sign-in without a client secret
- **WHEN** a user requests Jira sign-in while `NUXT_ATLASSIAN_CLIENT_SECRET` is unset
- **THEN** the server does not redirect to Atlassian
- **AND** the response explains that `NUXT_ATLASSIAN_CLIENT_SECRET` must be configured
- **AND** the response contains no credential values

### Requirement: Sealed sessions require a private session password
The application SHALL use `NUXT_SESSION_PASSWORD` with at least 32 characters to seal session cookies. It SHALL NOT use a public or built-in fallback value. Local setup documentation SHALL explain how to configure the value, and tests SHALL use a non-production test-only value.

#### Scenario: Session password is absent
- **WHEN** the application needs to issue a session and `NUXT_SESSION_PASSWORD` is unset or too short
- **THEN** it does not issue a session cookie
- **AND** it reports an actionable configuration error without revealing any secret

#### Scenario: Session password is configured
- **WHEN** the application issues a session with a valid configured password
- **THEN** the session cookie is sealed and can be read by the same application configuration
