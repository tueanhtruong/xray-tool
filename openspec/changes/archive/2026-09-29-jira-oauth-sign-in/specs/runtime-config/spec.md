## ADDED Requirements

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
