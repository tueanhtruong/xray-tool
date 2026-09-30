## 1. Persistence and region configuration

- [x] 1.1 Add workspace-owned Xray connection and encrypted JWT cache fields/models with context-bound credential/token storage and an additive Prisma migration; regenerate the Prisma client.
- [x] 1.2 Add a fixed Global/US/EU/AU endpoint map, validate region inputs against it, and resolve `NUXT_XRAY_BASE_URL` as the explicit override without branching in the integration client on integration target.
- [x] 1.3 Add unit coverage for region mapping, invalid-region rejection, JWT expiry decoding, and malformed/expired JWT handling.

## 2. Xray integration client

- [x] 2.1 Implement Xray authentication and typed GraphQL request transport using resolved base URLs, encrypted workspace credentials, bearer JWTs, and context-bound cached token persistence.
- [x] 2.2 Implement 60-second JWT expiry buffering, per-workspace single-flight authentication, persisted-token re-read before refresh, and one-time 401 re-authentication/retry.
- [x] 2.3 Implement a maximum of three total GraphQL attempts for HTTP 429/503, parse `Retry-After` delta-seconds and HTTP dates, apply exponential fallback, and enforce/document a maximum wait.
- [x] 2.4 Map GraphQL `errors[]` to actionable sanitized Xray errors without exposing arbitrary upstream payloads or credentials.
- [x] 2.5 Add unit coverage for token reuse, near-expiry refresh, single-flight, 401 retry bound, retry-after timing, fallback backoff, attempt limits, and error mapping.

## 3. Workspace connection workflow and settings

- [x] 3.1 Add service logic to verify submitted credentials before persistence, encrypt credential values with stable workspace/field contexts, record region and verification/configured timestamps, and preserve an existing connection on failure.
- [x] 3.2 Add authenticated workspace-scoped connection read/write routes with request validation, same-origin mutation checks, and safe actionable upstream error mapping.
- [x] 3.3 Add Xray connection setup and status UI showing region, configured date, and verification status while never returning or rendering saved credentials or JWTs.
- [x] 3.4 Verify authorization boundaries and secret redaction across API responses, SSR/browser surfaces, session cookies, logs, failed initial setup, and failed credential replacement.

## 4. Deterministic Xray mock

- [x] 4.1 Add `/xray/api/v2/authenticate` and `/xray/api/v2/graphql` mock routes with obviously fake credentials, JWT, and deterministic GraphQL echo responses.
- [x] 4.2 Add mock controls and counters for invalid credentials, GraphQL 401, 429 with `Retry-After`, and 503 scenarios while retaining unknown-route 404 behavior.
- [x] 4.3 Extend mock-services integration coverage to assert Xray success, control modes, request counters, and unknown route handling.

## 5. Integration, end-to-end, and documentation

- [x] 5.1 Add `tests/integration/xray-connection.test.ts` covering valid/invalid setup persistence, encrypted fields, replacement rollback, JWT reuse/refresh, GraphQL retry/error behavior, workspace authorization, and browser-safe response metadata.
- [x] 5.2 Add `e2e/us-04-xray-connection.spec.ts` covering settings setup, verification failure messaging, safe status display, and absence of secrets from browser-visible surfaces.
- [x] 5.3 Add `docs/integrations/xray.md` documenting authenticate/GraphQL endpoints, supported regions, region override behavior, credential/JWT flow, retry bounds, and safe setup/testing guidance.
- [x] 5.4 Run `pnpm check`, `pnpm test:unit tests/unit/xray-client`, `pnpm test:int tests/integration/xray-connection.test.ts`, and `pnpm test:e2e e2e/us-04-xray-connection.spec.ts`; resolve any failures.
