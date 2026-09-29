## 1. Session and persistence foundation

- [x] 1.1 Add `nuxt-auth-utils` as an exact pinned dependency, configure the module and sealed session cookie options, and add an ADR documenting the session payload, cookie flags, and `NUXT_SESSION_PASSWORD` requirement.
- [x] 1.2 Add Prisma `User`, `Workspace`, `JiraConnection`, and expiring `PendingOAuthGrant` models with account/site uniqueness, relationships, encrypted-token fields, and a migration; regenerate the Prisma client.
- [x] 1.3 Add runtime configuration validation/use for session password and Atlassian OAuth settings, preserving optional-at-start behavior and returning safe actionable missing-setting errors at sign-in time.
- [x] 1.4 Extend test env/bootstrap support with a test-only session password; add `NUXT_SESSION_PASSWORD` and OAuth setup details to `.env.example` and `docs/setup-atlassian-oauth.md`.

## 2. Atlassian OAuth integration and sign-in flow

- [x] 2.1 Add typed Atlassian OAuth integration calls for authorization URL construction, authorization-code exchange, accessible resources, profile lookup, and refresh; use `resolveIntegrationUrls()` and safe upstream error handling.
- [x] 2.2 Add OAuth start and callback routes with unpredictable state, short-lived signed httpOnly state cookie, exact state validation before code exchange, denial handling, and single-use cookie cleanup.
- [x] 2.3 Add service logic to upsert Atlassian users, auto-select and persist a single site, and persist encrypted pending grant data for multiple-site selection with bounded expiry.
- [x] 2.4 Add the site-picker page and selection endpoint; validate the selected cloud ID against the pending grant, persist only the selected site's workspace/connection with encrypted tokens, establish the ID-only sealed session, and delete the pending grant.
- [x] 2.5 Add `/login`, signed-in workspace home, and logout UI/route; ensure the session contains only user and active workspace IDs and is cleared on logout.
- [x] 2.6 Add page/API authentication guards with explicit public routes, redirect protected pages to `/login`, and return 401 for protected APIs; preserve `/api/health` and Nuxt Auth Utils session route behavior.
- [x] 2.7 Add unit/integration tests for OAuth parameter contract, missing config, state mismatch/expiry, denied consent, first/repeated sign-in, one-site and multi-site selection, unselected-site non-persistence, and token/session non-disclosure.

## 3. Workspace Jira client and token refresh

- [x] 3.1 Add a workspace-scoped Jira client that targets `/ex/jira/{cloudId}`, decrypts tokens with stable row/column AAD context, and keeps credential-bearing values inside server integrations/services.
- [x] 3.2 Implement the 60-second refresh window, process-local single-flight per workspace, encrypted atomic persistence of rotated tokens, and cleanup of in-flight entries on success and failure.
- [x] 3.3 Handle revoked refresh tokens by invalidating the connection for use, clearing the current request's session, and returning an actionable sign-in-required response without upstream details.
- [x] 3.4 Add focused unit tests for expiry boundaries, encryption context use, concurrent single-flight behavior, token rotation persistence, and revoked-token behavior; add an integration test proving concurrent requests issue exactly one mock refresh.

## 4. Mock services, end-to-end verification, and docs

- [x] 4.1 Implement deterministic mock Atlassian authorize, token, accessible-resources, `/me`, and refresh endpoints with single-site, multi-site, denial, invalid-code, rotation, and revoked-refresh scenarios using sanitized fake data.
- [x] 4.2 Update mock-services documentation and OpenSpec behavior coverage for the new endpoints and scenario controls.
- [x] 4.3 Add `e2e/us-02-oauth-sign-in.spec.ts` covering successful sign-in, multi-site selection, denied consent/state mismatch, protected page/API behavior, logout, token non-disclosure, and refresh recovery.
- [x] 4.4 Run `pnpm check`, `pnpm test:unit tests/unit/auth`, `pnpm test:int tests/integration/auth-oauth.test.ts`, and `pnpm test:e2e e2e/us-02-oauth-sign-in.spec.ts`; fix failures and capture any environment setup gaps.
- [x] 4.5 Complete the story's setup documentation and concurrent-refresh done checks, update `docs/progress.md`, and set US-02 to `active` only after confirming WIP/dependency state; leave `passing` to `pnpm verify US-02`.
