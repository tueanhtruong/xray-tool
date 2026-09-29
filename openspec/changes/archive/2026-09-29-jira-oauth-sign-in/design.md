## Context

- See `proposal.md` for motivation and `specs/` for the behavior contracts.
- The app is Nuxt 4/Nitro with thin `server/api/` handlers, domain logic in `server/services/`, outbound HTTP under `server/integrations/`, and Postgres through Prisma. `server/utils/crypto.ts` already provides AES-256-GCM with optional associated-data context; structured logging redacts OAuth `code`, tokens, cookies, and registered client secrets.
- `runtimeConfig` already declares optional Atlassian client ID, client secret, and callback URI, while `resolveIntegrationUrls()` resolves live or mock Atlassian endpoints.
- No auth/session package or domain models exist yet. `packages/mock-services` currently implements health only. Integration and e2e tests run the built app against the mock and test database.

## Goals / Non-Goals

**Goals:**

- Keep the OAuth exchange, persisted credentials, and Jira calls entirely server-side.
- Make multi-site selection robust across the callback-to-picker navigation without placing grant material in browser-readable data.
- Keep the session small and sealed, and make refresh behavior deterministic under concurrent server requests.
- Reuse existing config resolution, encryption, redacted logging, and test infrastructure.

**Non-Goals:**

- API-token authentication, shared/team workspaces, account linking across different Atlassian account IDs, or workspace switching.
- Revoking Atlassian grants remotely on logout; logout only clears the app session.
- Distributed refresh locks across multiple app instances. The initial single-flight guarantee is process-local per workspace.
- Refresh-token key rotation or encryption-key rotation tooling.

## Decisions

### D1. Use a server-side pending OAuth grant for site selection

After callback state validation and token/profile/site retrieval, persist a short-lived pending OAuth grant in Postgres when more than one site is available. Encrypt the access and refresh token fields with `encryptSecret` and row/column-specific context. The browser receives only an opaque, random pending-flow identifier in an httpOnly, signed cookie; site choices are rendered from server-fetched, non-secret site metadata. On selection, validate that the pending grant belongs to the signed-in callback flow, is unexpired, and includes the selected cloud ID; create/update only that selected site's Workspace and JiraConnection, then delete the pending grant.

For one accessible site, skip pending persistence and create/update the connection immediately. This avoids storing duplicate grants for the common case while retaining one safe flow for multiple sites.

Alternative: encode encrypted token material in a sealed cookie. Rejected because cookie size is bounded, tokens are repeatedly transmitted, and browser cookie lifecycle becomes the pending-flow store. Alternative: retain tokens only in process memory. Rejected because restarts and multi-instance routing can strand a user between callback and selection.

### D2. Model one durable connection per selected workspace

Add `User`, `Workspace`, and `JiraConnection` with unique Atlassian account identity and a unique selected-site identity for an owner (account + cloud ID). A `JiraConnection` stores auth method, encrypted access/refresh values, expiry, and granted scopes. Temporary multi-site grants use a separate expiring model rather than overloading durable connections. Upserts make repeated sign-ins update the existing account and selected-site connection.

Alternative: create workspaces for every accessible site. Rejected per the agreed scope: only the user-selected site is persisted for this sign-in.

### D3. Seal sessions with Nuxt auth utilities

Use the `nuxt-auth-utils` Nuxt module and its sealed session helpers; its documented module supports server-rendered Nuxt and sealed cookies. Pin the exact package version compatible with the project's Nuxt version. Store only `userId` and `activeWorkspaceId` in the session. Configure `NUXT_SESSION_PASSWORD` with at least 32 characters and fail safely at session issuance if absent or invalid; local setup and test support must provide appropriate values. Use `httpOnly`, `SameSite=Lax`, production `Secure`, and `maxAge` appropriate for the app. Use a separate signed short-lived OAuth state cookie and pending-flow cookie; neither contains tokens. Record the library choice and cookie contract in an ADR.

Alternative: hand-roll an HMAC/encryption session. Rejected because session crypto is security-sensitive and an established maintained package reduces custom code. Alternative: database-backed opaque session IDs. Deferred because there is no need for server-side revocation beyond logout/session expiry in this story, and it adds a session table and lookup to every request.

### D4. Keep route guards explicit and preserve public routes

Apply auth checks only to protected pages and application API namespaces; leave `/login`, `/auth/jira/**`, `/api/health`, and framework assets public. Page navigation redirects to `/login`; APIs fail with 401. OAuth callbacks and state-changing site-selection/logout operations validate their expected state/session rather than relying solely on SameSite cookie behavior.

Alternative: blanket middleware over every route with an allowlist. Rejected because Nuxt assets and future public endpoints are easy to accidentally block; route-group/namespace checks make the boundary clearer.

### D5. Implement Atlassian OAuth as a focused integration and service flow

Keep URL resolution in `resolveIntegrationUrls()`. An Atlassian auth integration owns token, accessible-resources, and `/me` HTTP calls and parses upstream responses into typed internal values. A service coordinates callback validation, persistence, session setup, and site choice. API handlers remain thin. The Jira client is workspace-scoped, uses the cloud ID path, decrypts credentials only immediately before a request, and never returns credential-bearing objects to API/page code.

OAuth scopes and callback settings remain optional at process start, matching current local/CI setup. Routes validate them at first use and report the missing variable names without echoing values.

### D6. Use per-workspace in-process single-flight refresh with persistence before release

Maintain a map of in-flight refresh promises keyed by JiraConnection/workspace ID. Requests within 60 seconds of expiry await the same promise. The refresh operation reads the latest encrypted refresh token, calls Atlassian once, encrypts both rotated credentials with stable AAD contexts, persists them atomically, then resolves with the access token. Remove the map entry on both success and failure. On `invalid_grant`, invalidate the connection and return an authentication-required error; request middleware clears the current user's session when it observes that condition.

This meets the story's same-process concurrency behavior and test. A multi-instance deployment can still race; distributed coordination is a later scaling concern and is called out as a limitation.

### D7. Deterministic mock behavior is scenario-controlled

Mock endpoints use obviously fake identities, sites, codes, and token values. Support deterministic modes for one site, multiple sites, access denial, valid/invalid authorization code, refresh success with rotated refresh token, and revoked refresh token. Tests configure a mode through mock-only controls or explicit test fixtures; production code never branches on test mode and still uses resolved integration URLs.

## Risks / Trade-offs

- [A pending OAuth grant may be abandoned] → Give it a short expiry, delete it after completion, and add cleanup-on-use/periodic cleanup behavior without requiring an immediate background scheduler.
- [Atlassian refresh rotates the refresh token, and concurrent app instances can race] → Persist both rotated values atomically and single-flight within one process; document the multi-instance limitation.
- [Cookie/session behavior can differ between dev HTTP and secure deployment] → Set `Secure` based on secure deployment context, use `SameSite=Lax`, and verify built-server callback and logout flows over the test harness.
- [Atlassian profile fields such as email can be absent or scope-dependent] → Treat account ID as the stable identity; allow optional name/email/avatar fields and never fail sign-in solely because optional profile fields are absent.
- [Upstream payload shape or failures change] → Validate responses at the integration boundary, return fixed safe errors, and log only redacted metadata/status through the existing logger.
- [Session-cookie sealing requires a stable deployment secret] → Document and validate `NUXT_SESSION_PASSWORD`; never silently use a public default.

## Migration Plan

1. Add Prisma models and an additive migration; the existing database contains no domain rows requiring backfill.
2. Add OAuth/session settings and the selected-site auth flow. Existing installations without OAuth configuration continue to start; sign-in remains unavailable until configured.
3. Regenerate Prisma client and apply migrations through the existing bootstrap/test DB flow.
4. Rollback by reverting the application change and migration only before data is created. After encrypted connections exist, application rollback may leave unused rows; preserve the encryption key and use a forward migration or explicit data removal rather than dropping live tables blindly.

## Open Questions

- None that affect the behavior contract or task breakdown. Expired pending grants will be rejected and deleted opportunistically when accessed; scheduled cleanup can be added if volume warrants it.
