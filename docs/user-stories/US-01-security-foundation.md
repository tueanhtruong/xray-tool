# US-01 — Security foundation: encryption, redacted logging, request IDs

| Field      | Value                                             |
| ---------- | ------------------------------------------------- |
| Milestone  | M0 Foundation                                     |
| Depends on | US-00                                             |
| State      | tracked in [feature-list.json](feature-list.json) |

## User story

As a workspace owner, I want my Jira and Xray secrets encrypted at rest and never exposed in logs or responses, so that a database dump or log leak does not compromise my Atlassian account.

## Context

Every connection story (US-02 … US-05) stores secrets. Building the primitives first keeps one audited implementation (Lecture 12: "prefer shared utilities over ad-hoc helpers"). Observability primitives (structured logs, request IDs) are also created here so every later story emits diagnosable signals (Lecture 11).

## Scope

**In**

- `server/utils/crypto.ts`: `encryptSecret(plain)` / `decryptSecret(blob)` using AES-256-GCM, random 12-byte IV per call, auth tag verified on decrypt.
- Stored format is versioned: `v1:<keyId>:<iv>:<tag>:<ciphertext>` (base64url) so key rotation is possible later.
- Key from `NUXT_ENCRYPTION_KEY` (32 random bytes, base64). Validated at startup (length, decodable). Generation command documented in `docs/security.md`.
- Structured JSON logger with **deny-list redaction** of keys (case-insensitive, nested): `authorization`, `cookie`, `set-cookie`, `password`, `token`, `accessToken`, `refreshToken`, `apiToken`, `clientSecret`, `secret`, `jwt`.
- Request-ID middleware: accepts a safe inbound `x-request-id` or generates one; adds it to logs and response headers.
- Global error handler: clients receive `{ statusCode, message, requestId }` only — no stack traces, no upstream response bodies in production.
- `SecretString` helper type/wrapper whose `toString`/`toJSON` returns `"[REDACTED]"`.

**Out**

- Key rotation tooling (format supports it; command is future work).
- Using the primitives for real credentials (done in US-02+).

## Acceptance criteria

```gherkin
Feature: Secrets are protected at rest and in telemetry

  Scenario: Encrypt/decrypt round-trip
    Given a valid encryption key
    When I encrypt "s3cr3t" and decrypt the result
    Then I get "s3cr3t"

  Scenario: Same plaintext produces different ciphertext
    When I encrypt "s3cr3t" twice
    Then the two ciphertexts differ

  Scenario: Tampered ciphertext is rejected
    Given an encrypted blob with one byte changed
    When I decrypt it
    Then a DecryptionError is thrown without revealing the plaintext

  Scenario: Invalid key blocks startup
    Given NUXT_ENCRYPTION_KEY is 16 bytes
    When the server starts
    Then it fails with a message explaining a 32-byte base64 key is required and how to generate one

  Scenario: Logger redacts secrets at any depth
    When I log { headers: { Authorization: "Bearer abc" }, body: { clientSecret: "xyz" } }
    Then the log line contains "[REDACTED]" and does not contain "abc" or "xyz"

  Scenario: Errors are sanitized for clients
    Given a route that throws an error whose message contains a token
    When I call it in production mode
    Then the response has statusCode, a generic message and a requestId
    And the response body contains no stack trace and no token

  Scenario: Every response carries a request ID
    When I request GET /api/health
    Then the response has an "x-request-id" header
    And the server log entry for that request has the same requestId
```

## Technical notes

- Use Node `crypto` only — no third-party crypto libs.
- Redaction tests should also cover arrays and `Error.cause` chains.
- Inbound `x-request-id` must match `^[A-Za-z0-9-]{8,64}$`, otherwise it is replaced (prevents log injection).

## Verification

1. Static: `pnpm check`
2. Runtime: `pnpm test:unit tests/unit/security`, `pnpm test:int tests/integration/error-handler.test.ts`
3. End-to-end: `pnpm test:e2e e2e/us-01-request-id.spec.ts`

## Story-specific done checks

- [ ] `docs/security.md` documents key generation, storage format, redaction list
- [ ] Grep check in CI: no `console.log` in `server/**`
