## 1. Data model and site validation

- [x] 1.1 Add `API_TOKEN` to `AuthMethod`; add encrypted API-token, email, saved-at, and canonical site-identity fields; make OAuth-only connection fields nullable while retaining existing OAuth rows.
- [x] 1.2 Create an additive Prisma migration for method-specific credentials and API-token site identity; regenerate Prisma and verify the existing OAuth migration/data path remains valid.
- [x] 1.3 Implement pure Jira site URL parsing/normalization with HTTPS, DNS-label suffix allow-list, no userinfo/port/path/query/fragment, and unit tests proving unsafe URLs are rejected before network calls.
- [x] 1.4 Add and validate runtime configuration for additional Jira site suffixes and trusted proxy addresses; default forwarded-IP handling to the direct peer.

## 2. Jira API-token verification and persistence

- [x] 2.1 Add a typed Jira API-token integration that calls only the validated site's `/rest/api/3/myself`, sends Basic auth, rejects redirects, applies a timeout, and maps upstream failures to fixed safe errors.
- [x] 2.2 Add API-token sign-in service logic that verifies credentials before writes, upserts by returned account ID and canonical site identity, encrypts the token with workspace/field context, and returns the existing ID-only session payload.
- [x] 2.3 Add API-token sign-in endpoint and login form with site URL, email, and token validation; ensure token values are excluded from response, logs, URL, and error data.
- [x] 2.4 Add shared-persistence rolling-window IP rate limiting (10 attempts per 60 seconds) and reject excess attempts before outbound Jira requests.

## 3. Shared Jira client and connection settings

- [x] 3.1 Dispatch the existing workspace Jira client by `authMethod`; retain OAuth endpoint, refresh/single-flight, and invalidation behavior, and add API-token Basic auth against the stored site origin.
- [x] 3.2 Enforce relative Jira paths and protect the client authorization header from caller overrides; reject redirects for API-token requests.
- [x] 3.3 Add authenticated connection-settings read and UI showing method, email, and token-save date without returning the token.
- [x] 3.4 Add same-origin, active-workspace-scoped token replacement and disconnect operations; validate replacements before atomic persistence and clear the session on disconnect.

## 4. Mock services and verification coverage

- [x] 4.1 Extend mock Jira REST `/myself` behavior with deterministic valid/invalid Basic credentials, stable account/site identity, and request counters or controls needed for rate-limit assertions.
- [x] 4.2 Add unit tests for site URL validation, suffix configuration, safe credential/error handling, and API-token connection invariants.
- [x] 4.3 Add integration tests for successful/invalid sign-in and persistence, encrypted storage, SSRF rejection without outbound requests, shared Jira-client behavior for both auth methods, rate limiting, settings redaction, replacement, and disconnect.
- [x] 4.4 Add Playwright coverage for API-token sign-in, invalid credentials, safe URL errors, token invisibility, settings, replacement, and disconnect.
- [x] 4.5 Run the same Jira-client contract suite against OAuth and API-token connections; run `pnpm check` and all US-03 verification commands.

## 5. Documentation and story readiness

- [x] 5.1 Document API-token setup, supported site suffix configuration, trusted-proxy requirements, connection settings, and disconnect/reconnect behavior.
- [x] 5.2 Record the credential-model, URL trust boundary, and rate-limit decisions in an ADR; update relevant architecture/security docs and US-03 story checklist as appropriate.
