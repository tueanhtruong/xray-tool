# US-04 — Xray Cloud credentials & JWT exchange

| Field      | Value                                             |
| ---------- | ------------------------------------------------- |
| Milestone  | M1 Connect                                        |
| Depends on | US-02                                             |
| State      | tracked in [feature-list.json](feature-list.json) |

## User story

As a workspace owner, I want to save my Xray Cloud API client ID and secret once, so that the app can call Xray on my behalf without me pasting credentials again.

## Context

Xray Cloud authenticates with `POST {xrayBase}/api/v2/authenticate` (`client_id`, `client_secret`) and returns a short-lived JWT used as `Bearer` for `POST {xrayBase}/api/v2/graphql`. The reference implementation in [refer/cucumber-bdd-test-suite/scripts/xray-client.js](../../refer/cucumber-bdd-test-suite/scripts/xray-client.js) caches the token to disk; here it must be server-side only and encrypted.

## Scope

**In**

- Prisma model `XrayConnection` (workspace, region, encrypted client ID, encrypted client secret, `verifiedAt`) and `XrayToken` cache (encrypted JWT, `expiresAt`) — or an in-memory cache keyed by workspace; record the decision.
- Region select: Global (`xray.cloud.getxray.app`), US, EU, AU base URLs — allow-listed, not free text.
- Settings form: client ID, client secret, region → "Test & save" authenticates first and stores only on success.
- `server/integrations/xray/client.ts`:
  - `graphql<T>(workspaceId, query, variables)` with typed result.
  - JWT reused until `exp - 60s` (decoded from token), refreshed single-flight.
  - On `401` from GraphQL: re-authenticate once, retry once.
  - On `429`/`503`: honour `Retry-After`, exponential backoff, max 3 attempts.
  - GraphQL `errors[]` mapped to an `XrayError` with an actionable message (e.g. "Xray API key lacks permission for project X").
- GraphQL documents stored as `.graphql` files under `server/integrations/xray/queries/`.
- Settings UI shows region, "configured on <date>", last verification status — never the secret.
- Mock services: `/api/v2/authenticate`, `/api/v2/graphql` echo query for tests.

**Out**

- Any business query (folders/tests come in US-06/US-07).

## Acceptance criteria

```gherkin
Feature: Xray Cloud connection

  Scenario: Valid credentials are verified and stored
    Given I am signed in
    When I enter a valid client ID and secret and click "Test & save"
    Then I see "Connected to Xray Cloud"
    And the client ID and secret are stored encrypted

  Scenario: Invalid credentials are not stored
    When I enter an invalid client secret
    Then I see "Xray rejected these API keys. Create a key in Jira > Apps > Xray > API Keys."
    And no XrayConnection is saved

  Scenario: JWT is reused until close to expiry
    Given a valid JWT that expires in 10 minutes
    When the server makes 5 GraphQL calls
    Then /authenticate is called at most once

  Scenario: Expired JWT is renewed on 401
    Given the cached JWT is rejected with 401
    When the server makes a GraphQL call
    Then it re-authenticates once and the call succeeds

  Scenario: Rate limiting is respected
    Given Xray responds 429 with Retry-After: 2
    When the server makes a GraphQL call
    Then it waits at least 2 seconds before retrying

  Scenario: Secrets and JWT never reach the browser
    When I inspect settings pages and all API responses
    Then neither the client secret nor the JWT appears
```

## Verification

1. Static: `pnpm check`
2. Runtime: `pnpm test:unit tests/unit/xray-client`, `pnpm test:int tests/integration/xray-connection.test.ts`
3. End-to-end: `pnpm test:e2e e2e/us-04-xray-connection.spec.ts`

## Story-specific done checks

- [x] `docs/integrations/xray.md` lists endpoints, regions, auth flow, retry policy
