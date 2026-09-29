## Context

See `proposal.md` for motivation and `specs/` for the behavior contract. US-02 provides an ID-only sealed session, `User`/`Workspace`/`JiraConnection` models, context-bound AES-GCM encryption, an OAuth-only workspace Jira client, and an Atlassian mock. The current connection schema requires OAuth access and refresh credentials, and OAuth workspaces are addressed through `api.atlassian.com/ex/jira/{cloudId}`. This change must support a direct site URL without weakening the existing OAuth path or allowing user-controlled URLs to become an SSRF primitive.

## Goals / Non-Goals

**Goals:**

- Keep the token handling boundary in server services and integrations; the browser submits a token once and receives only safe connection metadata.
- Represent both credential kinds on one workspace connection model and retain the existing workspace-scoped Jira client interface.
- Validate site identity and URL structure before any network operation, then use a fixed Jira REST path on the validated origin.
- Keep API-token verification, replacement, and persistence atomic with respect to user-visible state: rejected credentials never create a connection and rejected replacements never displace a working token.
- Make rate limiting effective across application processes and avoid trusting arbitrary forwarded-IP headers.

**Non-Goals:**

- Switching an existing connected workspace from OAuth to API-token auth or the reverse; users disconnect and reconnect instead.
- Supporting arbitrary Jira Server/Data Center hosts in this story. The initial supported host suffix is `.atlassian.net`; additional explicitly configured suffixes are a deployment extension.
- Revoking credentials at Atlassian on disconnect; disconnect removes the app's stored connection and local session only.
- Changing OAuth login, site selection, token refresh, or scopes beyond allowing the existing client entry point to dispatch by stored auth method.

## Decisions

### D1. Treat the verified Jira account ID and normalized site origin as connection identity

Validate the submitted URL with the platform URL parser, normalize its origin, and enforce HTTPS, an allowed hostname suffix on a DNS-label boundary, no username/password, no explicit port, and only an empty or `/` path. Reject query strings and fragments as well. Perform this validation before any fetch. The allow-list is a list of DNS suffixes: the hostname must equal a configured suffix or end with `.<suffix>`. The built-in suffix is `atlassian.net`; deployments may add further suffixes through validated server configuration.

The credential-check request is formed only from the normalized origin plus the constant `/rest/api/3/myself` path. No redirect should be followed to an unvalidated host; treat redirects as failures rather than forwarding Basic credentials. This closes both obvious metadata-IP cases and redirect-based credential forwarding. User, workspace, and connection identity are derived from Jira's validated `accountId` response and the canonical site, not the submitted email alone.

Alternative: accept any HTTPS URL and block private IP ranges after DNS lookup. Rejected for this story because DNS rebinding and redirect handling add a wider SSRF surface, while Jira Cloud site domains are sufficiently constrained by the product brief. Alternative: suffix matching by simple `endsWith`. Rejected because lookalike suffixes such as `atlassian.net.evil.io` must not pass.

### D2. Extend JiraConnection with nullable, method-specific credential fields

Add `API_TOKEN` to `AuthMethod`; store an encrypted API token and the associated email on `JiraConnection`, along with a token-save timestamp. Make `Workspace.cloudId` nullable for API-token workspaces and add a canonical site-origin identity with owner/site uniqueness. OAuth rows retain their cloud IDs and current uniqueness semantics. API-token workspaces use the normalized origin as their site identity. Connecting with another auth method to a site that already has a connection requires disconnecting first; sign-in must not silently replace an OAuth connection. Make OAuth-only credential fields (access token, refresh token, expiry) nullable for API-token rows; scopes remain a non-null list, empty for API-token rows because PostgreSQL scalar lists are non-nullable in Prisma. Preserve migration compatibility by making the new enum value additive and changing existing non-null OAuth columns to nullable; existing OAuth rows retain their fields and method. Enforce credential shape in service validation and tests: OAuth rows have required OAuth material and a cloud ID; API-token rows have an API token/email and site origin, no cloud ID, and no OAuth refresh material.

Use associated-data contexts including workspace ID and field purpose for API-token encryption. Encrypt the token only after Jira verifies it, immediately before persistence. Replacement verifies the candidate first and then atomically swaps encrypted value and saved-at date. The existing one-connection-per-workspace upsert is retained. API-token workspaces do not invent or expose a synthetic Atlassian cloud ID.

Alternative: put API-token fields in a separate table. Rejected because auth-method dispatch and lifecycle operations belong to one Jira connection and a second relation would complicate the shared workspace-client lookup. Alternative: keep OAuth columns non-null with empty placeholders. Rejected because it obscures invalid state and risks accidental OAuth refresh of API-token connections.

### D3. Keep Jira client dispatch behind its existing fetch interface

The workspace client loads the workspace and connection together. For OAuth, it follows the current cloud-ID route, Bearer header, refresh window, refresh single-flight, and invalid-grant handling unchanged. For API-token auth, it decrypts the API token immediately before request, composes Basic auth from the stored email and token, and targets `{siteUrl}/rest/api/3` plus a relative Jira REST path. Do not permit callers to supply absolute URLs or override the authorization header. Use the existing request timeout and caller-provided non-auth headers.

Keep the API-token validation `/myself` exchange in an integration module with typed response validation and fixed safe errors. Rate-limit and auth failures must not include upstream response bodies, submitted credentials, or full Authorization values in errors/log fields.

Alternative: expose `authMethod` to all Jira call sites and let each build URLs/headers. Rejected because later stories would branch on credential type and risk inconsistent secret handling. Alternative: implement API-token auth as a second client class. Rejected because it violates the story's common client contract and duplicates request behavior.

### D4. Resolve API-token users using Atlassian account identity without silently linking OAuth users by email

Jira `/myself` supplies `accountId` and profile identity. Upsert the `User` by that stable account ID and refresh name/email from the validated profile. Never merge a different existing account merely because email strings match. For site identity, use the normalized site origin as the workspace's canonical site identity, unique per owner. An existing account/site connection is updated only after successful verification and only when it is already an API-token connection; an existing OAuth connection must be disconnected before connecting to the same site with an API token. OAuth identity continues to use its actual cloud ID.

Alternative: link to any user with a matching email. Rejected because email can change, be unverified, or be shared, and the operation could grant access to another account's workspaces. Alternative: make account ID nullable for token users. Rejected because downstream user identity and workspace ownership currently depend on it.

### D5. Rate-limit attempts in shared persistence and trust only configured proxy metadata

Count attempts by a normalized client IP in shared Postgres-backed storage using a rolling 60-second window and a limit of 10, including failed credentials. Apply the limit to API-token sign-in before outbound Jira calls; URL validation can run first because it is local and avoids spending an attempt on malformed input. Derive client IP from the direct socket by default. Honor forwarded IP data only when the request came through explicitly configured trusted proxies, and use the first untrusted boundary according to that proxy configuration. Do not use an in-memory counter, which would reset on restart and vary across application instances.

Alternative: process-local map. Rejected because it is bypassable across replicas and restarts. Alternative: trust `X-Forwarded-For` unconditionally. Rejected because clients can spoof it unless a trusted proxy boundary is configured. Keep the 10/minute policy fixed initially; configurability of the threshold is not required by the behavior contract.

### D6. Keep settings operations scoped to the authenticated active workspace

Add an authenticated settings read that returns only auth method, stored email, and token-save timestamp. Replacement and disconnect are state-changing operations scoped to the session's `activeWorkspaceId` and `userId`, validate same-origin requests consistently with existing mutation routes, and never accept a workspace ID supplied by the browser as authority. Disconnect deletes or invalidates the connection, clears the local session, and does not make an outbound token-revocation call.

### D7. Make mock credential behavior deterministic and shared-contract testing explicit

Extend the existing mock `/myself` route or add a site-hosted route matching the direct Jira REST URL. Provide a test-controlled valid/invalid credential mode and return stable fake account/site values. Unit-test URL acceptance/rejection without network. Integration tests prove invalid credentials do not persist, accepted credentials are encrypted, rate limiting prevents the excess outbound call, replacement preserves the old token on failure, and browser-visible data is redacted. Run one workspace-client contract suite against an OAuth fixture and an API-token fixture so the common public behavior remains aligned.

## Risks / Trade-offs

- [A schema that permits nullable OAuth fields can represent malformed mixed-auth rows] → Validate method-specific credential invariants at persistence and client boundaries, and assert migration/data invariants in tests.
- [Site suffix configuration can broaden the outbound trust boundary] → Validate configuration as DNS suffixes, disallow schemes/ports/paths, require label-boundary matching, and document that each suffix authorizes outbound Basic-auth requests.
- [A Jira API-token user may not match the existing OAuth account ID model exactly] → Use the ID returned by `/myself`; do not auto-link on email. Verify whether Jira's `accountId` matches OAuth `/me` for the same Atlassian account in contract/integration coverage.
- [Reverse-proxy IP identification can be misconfigured] → Default to the direct peer address and require explicit trusted-proxy configuration before accepting forwarded headers.
- [Credential replacement races with concurrent Jira requests] → Persist replacement in a transaction after successful validation; use per-workspace row locking or compare-and-swap semantics so a request cannot restore stale credential data.
- [A site may be represented by different URLs or auth methods] → Normalize the allowed site URL to its HTTPS origin and enforce owner/origin uniqueness; retain OAuth cloud-ID uniqueness and require disconnect before changing auth method.
- [Jira redirects may carry Basic credentials to another origin] → Disable redirect following for verification and API-token client requests, or validate every redirect origin and never forward credentials cross-origin; prefer rejecting redirects.

## Migration Plan

1. Add the `API_TOKEN` enum member, nullable OAuth credential columns, encrypted API-token/email/saved-at fields, nullable `Workspace.cloudId`, required canonical `Workspace.siteOrigin`, and owner/site-origin uniqueness. Backfill existing `siteOrigin` from each workspace's `siteUrl`; existing OAuth cloud IDs and auth methods remain unchanged.
2. Deploy code that reads both methods and rejects malformed credential combinations before enabling the token-sign-in UI/routes.
3. Apply the additive Prisma migration through the existing `prisma migrate deploy` bootstrap and integration-test reset path; regenerate the Prisma client.
4. Enable API-token sign-in and settings after the schema is available. Keep OAuth rows and their refresh semantics unchanged.
5. Rollback by disabling the API-token entry points first. Do not revert the migration after API-token rows exist; use a forward migration or explicitly disconnect/remove those rows while preserving OAuth data and the encryption key.
