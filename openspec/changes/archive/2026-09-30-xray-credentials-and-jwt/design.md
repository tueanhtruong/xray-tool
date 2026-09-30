## Context

See `proposal.md` for motivation and `specs/` for the behavior contract. The app currently has a Postgres-backed workspace and Jira connection, sealed ID-only sessions, AES-256-GCM encryption with field/context binding, a central Xray base URL override, and a mock-services process. The Xray integration directory is currently a placeholder. The design must preserve the app's layer boundaries: UI uses HTTP, routes authorize and validate, services own workspace persistence, and integration clients perform outbound calls.

## Goals / Non-Goals

**Goals:**
- Keep workspace Xray credentials and JWT reuse isolated by workspace and server-side.
- Reuse the existing encryption, persistence, runtime URL resolution, error handling, and mock patterns.
- Make connection verification and upstream retry behavior testable without live credentials.

**Non-Goals:**
- Implement Xray business queries for folders or tests; those arrive in later stories.
- Add credential rotation infrastructure or distributed locking beyond the app's current database/process capabilities.
- Allow user-provided Xray endpoint URLs.

## Decisions

### Persist Xray connection and JWT metadata in Postgres

Add a workspace-owned `XrayConnection` record with a unique workspace relationship, selected region, encrypted client ID and secret, verification/configuration timestamps, and an encrypted cached JWT with its decoded expiry. Bind ciphertext to stable table/field/workspace contexts using the existing `encryptSecret`/`decryptSecret` helpers. The database cache lets application processes reuse credentials and JWT metadata without adding a cache service; an in-memory map of pending authentication promises still provides per-process single-flight. Persist a newly authenticated JWT before returning it to callers. Treat JWT expiry as untrusted input: decode only the expiry claim needed for reuse and reject malformed or expired tokens.

Alternative considered: an in-memory JWT cache would avoid persisting bearer tokens, but each process would authenticate independently and restarts would discard cache state. The story explicitly allows either cache form; choose encrypted Postgres storage to support shared deployments and stable reuse.

### Resolve region endpoints through a fixed map and retain the central override

Define the Global, US, EU, and AU region-to-base-URL mapping in server-owned code. A submitted region is validated against this fixed set and never used as an arbitrary hostname. `NUXT_XRAY_BASE_URL`, already the explicit integration override in runtime config, overrides the selected regional base URL for deployments and tests; the resolved URL continues to be supplied to the integration client so it does not branch on `integrationTarget`.

Alternative considered: remove the global override or make it region-specific. Keeping the established override behavior avoids config churn; deployments that need regional routing select a region and omit the override.

### Separate verification/persistence orchestration from HTTP integration

Use a service to verify submitted credentials through the Xray authenticate endpoint, persist them only after success, and preserve any existing connection on failure. Use the Xray integration client for authentication and GraphQL transport/retry behavior, without importing services or routes into the integration layer. Add authenticated route handlers following the existing session, ownership, same-origin mutation, and safe HTTP-error patterns. The settings UI receives only selected region, date, and verification state.

### Apply bounded, testable transport retry policy

Use a maximum of three total GraphQL attempts for 429/503 responses. Parse `Retry-After` as delta-seconds or an HTTP date; use exponential backoff for missing or invalid values, with a bounded delay to avoid a hung request. Re-authenticate on 401 once separately from transient retries, then retry the GraphQL request once. Map GraphQL errors to a typed Xray error and retain only safe actionable details, not arbitrary upstream payloads.

### Extend deterministic mock controls without real credentials

Add Xray mock routes under the existing `/xray` prefix. Provide obviously fake valid credentials/JWTs, request counters, and control modes for rejected credentials, GraphQL 401, 429 with `Retry-After`, and 503. Tests use controls to assert call counts and retry handling; mock values are never production secrets.

## Risks / Trade-offs

- [Persisted JWT ciphertext is still a bearer credential if the encryption key is compromised] → Bind it to the workspace/field, keep the encryption key deployment-only, return no token to clients, and avoid logging it.
- [Multiple app processes can refresh the same near-expiry JWT concurrently] → Use process-local single-flight and re-read persisted token state before authentication; accept that strict cross-process single-flight is deferred unless deployment evidence warrants a distributed lock.
- [Xray region endpoints or JWT expiry claims may vary] → Keep endpoints centralized and allow-listed, validate expiry parsing, and cover each region mapping and malformed token case with unit tests.
- [Long `Retry-After` values can tie up a request] → Bound honored delays and document the selected maximum in the integration guide and tests.
- [Schema migration can fail on existing deployments] → Add only nullable/new Xray-owned fields and a new model/relation; deploy the migration before the app version that reads it, and preserve existing Jira rows.

## Migration Plan

1. Add the Xray schema and additive migration; deploy it before application code that queries the new model.
2. Deploy the server/client and settings workflow. Existing workspaces remain without an Xray connection until an owner configures one.
3. Roll back by reverting the app deployment while retaining the additive tables/columns. Do not drop connection data during rollback; a later forward migration can remove it after credentials are intentionally disconnected or migrated.
