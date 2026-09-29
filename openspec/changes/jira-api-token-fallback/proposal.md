## Why

QA engineers whose organizations block third-party OAuth apps need another way to connect Jira. Supporting Atlassian email and API tokens lets them use the app while keeping credentials server-side and preserving one Jira client contract for downstream workflows.

## What Changes

- Add a Jira API-token sign-in path from `/login`, validating the submitted Jira site URL before any outbound request and verifying credentials through Jira's `/rest/api/3/myself` endpoint.
- Persist API-token connections against the verified Atlassian account and site, encrypt the token, and issue the existing ID-only sealed session only after successful verification.
- Extend the workspace Jira client to authenticate OAuth and API-token connections behind the same `fetch` interface.
- Add connection settings that show the auth method, email, and token-save date, and allow replacing a token or disconnecting without exposing the token.
- Rate-limit API-token sign-in attempts by client IP and provide deterministic mock responses for valid and invalid credentials.

## Capabilities

### New Capabilities
- `jira-api-token-sign-in`: API-token connection, safe site validation, credential verification, connection settings, and attempt throttling.

### Modified Capabilities
- `jira-oauth-sign-in`: generalize the workspace Jira-client contract to serve OAuth and API-token connections through the same interface while preserving OAuth refresh behavior.

## Impact

- Prisma `AuthMethod`, `Workspace`, and `JiraConnection` data model and an additive migration.
- Login and workspace settings UI; API-token sign-in, replacement, disconnect, and settings endpoints.
- Jira client/integration and service layers, outbound URL validation, rate limiting, encrypted persistence, and safe error handling.
- Mock Jira REST behavior plus unit, integration, and Playwright coverage, including a shared Jira-client contract run against both auth methods.
- Setup/security documentation for API-token use and supported Jira site URLs.
