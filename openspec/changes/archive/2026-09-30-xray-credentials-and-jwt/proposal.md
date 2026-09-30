## Why

Workspace owners need to configure Xray Cloud once so the app can make authenticated GraphQL requests without exposing API credentials or asking users to paste them repeatedly. This enables the upcoming project and repository workflows while keeping Xray access scoped to the active workspace.

## What Changes

- Add an authenticated Xray connection workflow that validates client credentials before storing them and exposes only non-secret connection metadata.
- Add a server-side Xray GraphQL client with JWT reuse, near-expiry refresh, single-flight authentication, one 401 re-authentication, and bounded 429/503 retries.
- Support the allow-listed Global, US, EU, and AU Xray Cloud regions.
- Extend the deterministic mock service with Xray authentication and GraphQL behavior required to verify the connection and retry contract.
- Document the Xray endpoints, regions, authentication flow, and retry policy.

## Capabilities

### New Capabilities
- `xray-cloud-connection`: Workspace-scoped Xray credential setup, safe connection status, JWT-backed GraphQL access, and upstream error/retry behavior.

### Modified Capabilities
- `mock-services`: Add deterministic Xray authenticate and GraphQL routes and test controls while preserving 404 behavior for other unknown routes.

## Impact

- Data model and migrations for workspace-owned Xray credentials and verification metadata.
- `server/integrations/xray/`, `server/services/`, authenticated server routes, and workspace settings UI.
- `packages/mock-services`, Xray region/base-URL resolution, unit/integration/Playwright coverage, and `docs/integrations/xray.md`.
- No new runtime dependency is anticipated; use the existing encryption, Prisma, Nuxt, and fetch infrastructure.
