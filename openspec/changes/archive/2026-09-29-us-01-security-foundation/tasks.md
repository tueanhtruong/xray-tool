## 1. Story bookkeeping and spikes

- [x] 1.1 Read `AGENTS.md` session-start files, run `./scripts/init.sh && pnpm check` for a green baseline, then set US-01 to `active` in `docs/user-stories/feature-list.json` (WIP = 1)
- [x] 1.2 Spike (design D6): with `nitro.experimental.asyncContext` enabled, confirm `useEvent()` yields per-request context from a plain function in the built server under two concurrent requests; if not, switch to the `AsyncLocalStorage.enterWith` fallback and note it in the ADR

## 2. Pure security library (`shared/security`)

- [x] 2.1 `request-id.ts`: `REQUEST_ID_PATTERN`, `isSafeRequestId` (full-value match, reject CR/LF, arrays/comma-joined values); unit tests in `tests/unit/security/request-id.test.ts`
- [x] 2.2 `secret-string.ts`: `SecretString` with `[REDACTED]` for `toString`, `toJSON`, template literal and `util.inspect` custom symbol, plus one explicit `reveal()`; unit tests
- [x] 2.3 `redact.ts`: key normalization + deny-list `Set`, value scrubbing (`Bearer`, JWT shape, registered literals ignoring values under 8 chars), traversal rules (arrays, `Error.cause`/`AggregateError`, `Map`/`Set`, binary, cycles, depth 8, 8 KB string cap, throwing getters, `SecretString`), no input mutation
- [x] 2.4 Redaction unit tests in `tests/unit/security/redact.test.ts` covering every scenario in `specs/safe-logging` (nested headers/body, snake_case, arrays, cause chain, token in message, registered secret, circular, non-mutation) plus a table-driven test of every listed key in mixed case, `_` and `-` forms
- [x] 2.5 `client-error.ts`: `toClientError` with the generic-message table, deliberate-vs-unknown 4xx rule (expose marker), 5xx generic, never emitting `data`/`cause`/`stack`; unit tests in `tests/unit/security/client-error.test.ts` for each scenario in `specs/error-responses`
- [x] 2.6 `encryption-key.ts`: strict standard-base64 32-byte check and `ENCRYPTION_KEY_HELP` text (names `NUXT_ENCRYPTION_KEY`, 32 bytes, `openssl rand -base64 32`); unit tests for 16-byte, 33-byte, non-base64, URL-safe, padding, and valid keys

## 3. Configuration validation

- [x] 3.1 Update `encryptionKey` in `shared/config/schema.ts`: optional when empty, validated via `isValidEncryptionKey` when set, error text from `ENCRYPTION_KEY_HELP`, never echoing the value; extend `tests/unit/config` for valid, unset, 16-byte, and non-base64 cases
- [x] 3.2 Update `server/plugins/00.validate-config.ts` to log one `warn` when the key is unset (once the logger exists, task 5.1) and keep `console.error` for validation failures
- [x] 3.3 Extend `tests/integration/config-fail-fast.test.ts`: built server with a 16-byte key exits non-zero, stderr has `NUXT_ENCRYPTION_KEY`, `32`, `openssl rand -base64 32`, and not the key; server with valid key and with no key both start

## 4. Encryption (`server/utils/crypto.ts`)

- [x] 4.1 Implement `encryptSecret(plain, { context }?)` and `decryptSecret(blob, { context }?)` with AES-256-GCM, 12-byte random IV, `v1:<keyId>:<iv>:<tag>:<ciphertext>` base64url, derived `keyId` (first 8 hex of `sha256(key)`), optional AAD, cached decoded key
- [x] 4.2 Add `DecryptionError` (fixed messages per cause, no cause chain) and the missing-key configuration error naming `NUXT_ENCRYPTION_KEY` and the `openssl` command
- [x] 4.3 Unit tests in `tests/unit/security/crypto.test.ts` for every scenario in `specs/secret-encryption`: round-trip, Unicode, differing ciphertexts, format shape, unknown version, different key, tamper each part, malformed input, wrong/matching context, missing key, and that no error message contains plaintext or key material

## 5. Logger and request tracing

- [x] 5.1 `server/utils/logger.ts`: JSON line writer (`time`, `level`, `msg`, `requestId`, redacted fields) via a single `process.stdout.write`, debug suppressed in production, redaction applied to the whole entry after `requestId` is added
- [x] 5.2 `server/utils/request-context.ts` with `getRequestId()` per D6 (and the `nitro.experimental.asyncContext` setting in `nuxt.config.ts`)
- [x] 5.3 `server/middleware/00.request-id.ts`: accept safe inbound ID or generate `randomUUID()`, set `event.context.requestId` and the `x-request-id` response header
- [x] 5.4 `server/plugins/01.request-log.ts`: register runtime-config secrets (encryption key, OAuth client secret) with the redactor, and write one access-log entry per request (`requestId`, `method`, path without query, `status`, `durationMs`) from the response `finish` event (D8)
- [x] 5.5 Extend `tests/support/built-server.ts`: pipe stdout, expose parsed JSON log lines, inject a labeled test-only `NUXT_ENCRYPTION_KEY` by default (overridable); add the same test key to `.github/workflows/ci.yml` and `tests/support/env.ts` as needed
- [x] 5.6 Also log database probe failures from `server/api/health.get.ts` (redacted; body unchanged) so a lower-layer log line can be asserted with its ambient request ID. Integration tests against the built server (`tests/integration/request-id.test.ts`): header on `/api/health` and on a 404; valid inbound ID echoed; unsafe/short/multi-value inbound replaced and absent from logs; two concurrent requests each log their own `requestId`; access-log entry matches the header and excludes the query string

## 6. Global error handler

- [x] 6.1 `server/utils/http-error.ts` with `httpError(status, message)` that sets the expose marker
- [x] 6.2 `server/error-handler.ts` (Node-level, D9): log through the logger (5xx with stack and cause chain, 4xx message only), respond via `toClientError` for `/api/` paths with `x-request-id` and a generic status text, leave other paths to Nuxt's handler; prepend it to the chain from a `nitro:config` hook in `nuxt.config.ts`
- [x] 6.3 `tests/integration/error-handler.test.ts` (D10): in-process `node:http` server running the real handler with throwing routes in production mode: token-in-message, deliberate 400 keeps message, upstream body hidden, body keys exactly `statusCode`/`message`/`requestId`, log entry redacted with stack; plus built-server `/api/does-not-exist` 404 shape and page-error not leaking messages
- [x] 6.4 `e2e/us-01-request-id.spec.ts`: Playwright `request` fetch of `/api/health` shows the `x-request-id` header and an echoed valid inbound ID

## 7. Lint, bootstrap, docs

- [x] 7.1 `eslint.config.mjs`: `server/**` override `no-console: ['error', { allow: ['error', 'warn'] }]`; add a unit test in `tests/unit/architecture-guard.test.ts` style proving `console.log` is rejected and `console.error` allowed in `server/`
- [x] 7.2 `scripts/init.sh`: fill an empty `NUXT_ENCRYPTION_KEY` in `.env` with `openssl rand -base64 32` without overwriting a non-empty value or touching `.env.example`; run it twice and confirm the key is unchanged the second time
- [x] 7.3 Update `.env.example` comment for `NUXT_ENCRYPTION_KEY` (unset allowed, bootstrap generates it, validated when set) keeping the value empty
- [x] 7.4 `docs/security.md`: key generation, storage format, AAD contract, redaction list and normalization rule, `code` over-redaction note, `console.log` lint gate replacing the CI grep, error-response contract; update `docs/quality.md` grades for new modules
- [x] 7.5 ADR `docs/decisions/0010-security-foundation.md` covering D2, D3, D4, D6, D9

## 8. Verification and hand-off

- [x] 8.1 Run `pnpm check`, `pnpm test:unit tests/unit/security`, `pnpm test:int tests/integration/error-handler.test.ts`, `pnpm test:int` (all existing built-server tests still pass), and `pnpm test:e2e e2e/us-01-request-id.spec.ts`; confirm no stray `console.log`, debug code, or temp files
- [x] 8.2 Append a dated entry to `docs/progress.md` (done, in progress, next, open questions)
- [x] 8.3 Run `pnpm verify US-01` (the only way to set `passing`), then commit as `US-01: security foundation`
