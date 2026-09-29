## Why

Every connection story (US-02 to US-05) stores Jira/Xray secrets and talks to upstream services. Without one audited set of primitives for encryption at rest, log redaction, request correlation, and client-safe errors, each story would invent its own and a database dump or log leak could expose a user's Atlassian account. US-00 is passing, so US-01 is the next story and must land before any credential is stored.

## What Changes

- Add AES-256-GCM secret encryption (`encryptSecret` / `decryptSecret`) with a versioned blob `v1:<keyId>:<iv>:<tag>:<ciphertext>`, a random 12-byte IV per call, auth-tag verification, and a `DecryptionError` that never reveals plaintext. Node `crypto` only.
- Validate `NUXT_ENCRYPTION_KEY` (32 bytes, base64) at server start when it is set, and fail with a message that explains the format and how to generate one. An unset key does not block startup; it fails at first use with a clear error (see design).
- Add a structured JSON logger with deny-list redaction (case-insensitive, nested, arrays, `Error.cause` chains, cycle-safe) plus a `SecretString` wrapper that renders as `"[REDACTED]"`.
- Add request-ID handling: accept a safe inbound `x-request-id` (`^[A-Za-z0-9-]{8,64}$`) or generate one, expose it on every response (including errors) and attach it to every log line, including lines written from services and integrations.
- Add one access-log entry per request so a request ID can be found in the server log.
- Add a global error handler: clients receive `{ statusCode, message, requestId }` only; no stack traces, no upstream bodies, generic message for 5xx.
- Forbid `console.log` in `server/**` via lint (part of `pnpm check`) instead of a separate CI grep.
- Extend the built-server test helper so tests can read server stdout (log lines), and give test runs a valid throwaway encryption key.
- Document key generation, blob format, and the redaction list in `docs/security.md`; add an ADR for the decisions below.
- `init.sh` fills an empty `NUXT_ENCRYPTION_KEY` in `.env` with a generated key (idempotent, never overwrites).

## Capabilities

### New Capabilities

- `secret-encryption`: AES-256-GCM encrypt/decrypt with the versioned blob format, key derivation of `keyId`, tamper detection, optional AAD binding, and key validation rules.
- `safe-logging`: structured JSON logger, deny-list redaction (normalized key matching, value scrubbing of bearer/JWT patterns and registered secrets), and the `SecretString` wrapper.
- `request-tracing`: `x-request-id` acceptance/generation/validation, response header on every response, request ID on every log line, and the per-request access log entry.
- `error-responses`: sanitized client error contract `{ statusCode, message, requestId }`, 4xx versus 5xx message policy, and full detail kept in server logs only.

### Modified Capabilities

- `runtime-config`: `NUXT_ENCRYPTION_KEY` gains format validation when set (32 bytes, base64) and a fail-fast message; "Credentials not required before they are used" is narrowed so an unset key is still allowed but a set, malformed key is not.
- `quality-gate`: adds a requirement that `console.log` (and other non-error console output) in `server/**` fails lint, with startup error output via `console.error` explicitly allowed.

## Impact

- New code: `shared/security/*` (pure redaction, `SecretString`, request-ID validation, client-error mapping), `server/utils/crypto.ts`, `server/utils/logger.ts`, `server/middleware/00.request-id.ts`, an Nitro `errorHandler` module, and a logging plugin for the access log.
- Changed code: `shared/config/schema.ts` (key validation), `server/plugins/00.validate-config.ts`, `nuxt.config.ts` (`nitro.errorHandler`, async context), `eslint.config.mjs`, `tests/support/built-server.ts`, `scripts/init.sh`, `.env.example`, `.github/workflows/ci.yml` (test key).
- Docs: `docs/security.md`, `docs/quality.md`, `docs/progress.md`, new ADR in `docs/decisions/`, story state in `docs/user-stories/feature-list.json` (via `pnpm verify US-01`).
- Tests: `tests/unit/security/**`, `tests/integration/error-handler.test.ts`, `e2e/us-01-request-id.spec.ts`. Existing built-server tests must pass a valid key.
- No new runtime dependencies (Node `crypto`, `AsyncLocalStorage`/Nitro async context only). No database or API schema changes.
- Not in scope: key rotation tooling, storing real credentials (US-02+).
