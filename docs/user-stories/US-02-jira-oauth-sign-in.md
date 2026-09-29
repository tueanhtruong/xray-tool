# US-02 — Sign in with Jira OAuth 2.0 (3LO)

| Field      | Value                                             |
| ---------- | ------------------------------------------------- |
| Milestone  | M1 Connect                                        |
| Depends on | US-01                                             |
| State      | tracked in [feature-list.json](feature-list.json) |

## User story

As a QA engineer, I want to sign in with my Atlassian account, so that the app reads and writes Jira issues with my own permissions without me handling tokens.

## Context

OAuth 2.0 (3LO) is the primary auth method. This story introduces the first domain models (`User`, `Workspace`, `JiraConnection`) and the session mechanism reused by all later stories.

## Scope

**In**

- Prisma models: `User` (Atlassian `accountId`, name, email, avatar), `Workspace` (owner, Jira `cloudId`, site URL, name), `JiraConnection` (workspace, `authMethod = OAUTH`, encrypted access + refresh tokens, `expiresAt`, scopes).
- `GET /auth/jira/login` → redirect to `https://auth.atlassian.com/authorize` with `audience=api.atlassian.com`, `client_id`, `scope` (`read:jira-work write:jira-work read:jira-user read:me offline_access`), `redirect_uri`, `response_type=code`, `prompt=consent`, and a random `state` stored in a signed, httpOnly, short-lived cookie.
- `GET /auth/jira/callback` → validate `state`, exchange code at `https://auth.atlassian.com/oauth/token`, call `accessible-resources` to get sites, call `/me` for the profile, upsert User/Workspace/JiraConnection with tokens encrypted via US-01.
- Multiple accessible sites → site picker page; single site → auto-select.
- Session: sealed httpOnly cookie (`Secure`, `SameSite=Lax`), containing user ID and active workspace ID only — never tokens.
- `server/integrations/jira/client.ts`: returns an authenticated client for a workspace; for OAuth uses `https://api.atlassian.com/ex/jira/{cloudId}` and **refreshes automatically** when `expiresAt` is within 60 s, persisting the rotated refresh token.
- Route middleware: unauthenticated users are redirected to `/login`; API routes return 401.
- `POST /auth/logout` clears the session.
- Mock services: Atlassian authorize/token/accessible-resources/me endpoints.

**Out**

- API-token login (US-03), Xray credentials (US-04), team/shared workspaces.

## Acceptance criteria

```gherkin
Feature: Jira OAuth sign-in

  Scenario: Successful first sign-in
    Given I am not signed in
    When I click "Sign in with Atlassian" and approve consent
    Then I land on the workspace home
    And a User, Workspace and JiraConnection exist for my account
    And the stored tokens are encrypted

  Scenario: State mismatch is rejected
    When the callback is called with a state that does not match my cookie
    Then I see "Sign-in could not be verified. Please try again."
    And no tokens are stored

  Scenario: User denies consent
    When Atlassian redirects back with error=access_denied
    Then I return to /login with a message explaining access was not granted

  Scenario: Multiple Jira sites
    Given my account can access two Jira sites
    When I complete sign-in
    Then I am asked to choose a site before continuing

  Scenario: Expired access token is refreshed transparently
    Given my access token expired and my refresh token is valid
    When the server calls Jira on my behalf
    Then the token is refreshed, the new refresh token is stored encrypted, and the call succeeds

  Scenario: Revoked refresh token
    Given my refresh token has been revoked
    When the server calls Jira on my behalf
    Then I am signed out and asked to sign in again

  Scenario: Tokens never reach the browser
    When I inspect every API response and the session cookie
    Then no access or refresh token is present

  Scenario: Sign out
    When I click "Sign out"
    Then my session cookie is cleared and protected pages redirect to /login
```

## Technical notes

- Consider `nuxt-auth-utils` for sealed sessions; record the choice in an ADR.
- OAuth client ID/secret and redirect URI come from runtime config; the Atlassian base URL is configurable so tests use the mock.
- Refresh must be single-flight per workspace (concurrent requests share one refresh).

## Verification

1. Static: `pnpm check`
2. Runtime: `pnpm test:unit tests/unit/auth`, `pnpm test:int tests/integration/auth-oauth.test.ts`
3. End-to-end: `pnpm test:e2e e2e/us-02-oauth-sign-in.spec.ts`

## Story-specific done checks

- [x] `docs/setup-atlassian-oauth.md` explains creating the Atlassian developer app and required scopes
- [x] Integration test proves concurrent calls trigger exactly one refresh
