# ADR 0013: Xray credentials and JWT cache

## Status

Accepted

## Context

US-04 adds workspace-scoped Xray Cloud API credentials and a short-lived JWT used by server-side GraphQL requests. The app already has Postgres workspace persistence, AES-256-GCM with context binding, a central `NUXT_XRAY_BASE_URL` override, and deterministic mock integration targets.

## Decision

- Store an `XrayConnection` per workspace. Encrypt the client ID, client secret, and cached JWT using AES-256-GCM with workspace/field-bound context; store the JWT expiry and verification/configuration timestamps as metadata.
- Cache JWTs in Postgres so app processes can share valid tokens and restarts can reuse them. Use process-local per-workspace single-flight and re-read persisted state before requesting a replacement. Distributed refresh locking is deferred.
- Map Global, US, EU, and AU to fixed server-owned endpoints. Reject unsupported regions; do not accept a user-controlled endpoint URL. `NUXT_XRAY_BASE_URL` overrides the selected region, preserving the existing integration-override contract.
- Keep the Xray integration client below the service layer. The service verifies credentials before persistence; authenticated routes scope operations to the active owned workspace; browser settings expose only region and timestamps.
- Bound GraphQL retries to three total attempts for 429/503, honor `Retry-After` up to 30 seconds, and use capped exponential backoff if the header is unavailable or invalid. A one-time 401 re-authentication shares this request-attempt budget.

## Consequences

- Database backups and the encryption key together contain recoverable Xray credentials and JWT cache values; the key must remain a deployment secret and rotation remains a separate concern.
- Multi-process deployments can race to refresh a near-expiry token; current per-process single-flight and persisted-state re-read reduce duplicate authentication, while strict distributed locking is deferred.
- Regional deployments should select the correct workspace region and leave the central base URL override unset unless an operator intentionally needs a deployment-level override.
- The mock Xray API uses only fake test credentials and deterministic control modes; live tests remain restricted to the dedicated sandbox.
