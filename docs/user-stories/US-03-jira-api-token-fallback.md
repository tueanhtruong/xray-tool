# US-03 — Sign in with Jira email + API token (fallback)

| Field      | Value                                             |
| ---------- | ------------------------------------------------- |
| Milestone  | M1 Connect                                        |
| Depends on | US-02                                             |
| State      | tracked in [feature-list.json](feature-list.json) |

## User story

As a QA engineer whose organization blocks third-party OAuth apps, I want to connect with my Jira email and API token, so that I can still use the tool.

## Context

Reuses `User`, `Workspace`, `JiraConnection` and the session from US-02. The Jira client abstraction must hide which auth method is used, so no later story branches on it.

## Scope

**In**

- `/login` offers "Use API token instead" → form: Jira site URL, email, API token.
- Site URL validation (SSRF guard): `https` only, hostname must end with `.atlassian.net` (allow-list extendable via config), no credentials/port/path.
- Validation call: `GET {site}/rest/api/3/myself` with Basic auth; on success upsert User (by `accountId`), Workspace (by site), `JiraConnection` with `authMethod = API_TOKEN`, email, encrypted token.
- Jira client for `API_TOKEN` uses `{site}/rest/api/3` with Basic auth; same interface as OAuth client.
- Settings page shows connection method, email, and "token saved on <date>" — never the token. Actions: replace token, disconnect.
- Rate-limit sign-in attempts per IP (e.g. 10/min) to prevent credential-stuffing through the app.
- Mock services: `/rest/api/3/myself` with valid/invalid credentials.

**Out**

- Switching an existing workspace between OAuth and API token (disconnect + reconnect covers it).

## Acceptance criteria

```gherkin
Feature: Jira API token fallback

  Scenario: Valid API token
    Given I am on the API token sign-in form
    When I submit "https://acme.atlassian.net", my email and a valid token
    Then I am signed in and land on the workspace home
    And the token is stored encrypted

  Scenario: Invalid credentials
    When I submit a wrong token
    Then I see "Jira rejected these credentials. Check the email and create a new API token at id.atlassian.com."
    And nothing is stored

  Scenario Outline: Unsafe site URLs are rejected before any request
    When I submit site URL "<url>"
    Then I see a validation error and no outbound request is made

    Examples:
      | url                              |
      | http://acme.atlassian.net        |
      | https://169.254.169.254          |
      | https://acme.atlassian.net.evil.io |
      | https://user:pw@acme.atlassian.net |

  Scenario: Token is never shown again
    Given I connected with an API token
    When I open workspace settings or call any API endpoint
    Then the token value is not present in the page or responses

  Scenario: Replace token
    When I replace the API token with a new valid one
    Then the new token is validated and stored, and the old one is discarded

  Scenario: Same Jira client interface
    Given one workspace uses OAuth and another uses an API token
    When the server fetches "/myself" through the Jira client for each
    Then both calls succeed through the same client method
```

## Verification

1. Static: `pnpm check`
2. Runtime: `pnpm test:unit tests/unit/jira-site-url.test.ts`, `pnpm test:int tests/integration/auth-api-token.test.ts`
3. End-to-end: `pnpm test:e2e e2e/us-03-api-token-sign-in.spec.ts`

## Story-specific done checks

- [ ] Contract test runs the same Jira client test-suite against both auth methods
