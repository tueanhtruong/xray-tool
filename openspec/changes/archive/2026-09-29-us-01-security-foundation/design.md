## Context

- See proposal.md for motivation. Requirements are in `specs/`; this file covers approach only.
- Stack: Nuxt 4.5.2 on Nitro 2.13.4 (h3 1.15), Node 24. Layering per `docs/architecture.md`: `shared/` is pure (no Nuxt/Nitro/h3/Vue imports, enforced by lint), `server/utils` holds cross-cutting server helpers, and services and integrations get no `event`.
- `encryptionKey` already exists in `runtimeConfig` and in `serverConfigSchema` as an optional string. `server/plugins/00.validate-config.ts` validates config at start and prints with `console.error` (allowed: startup output).
- Built-server test helpers (`tests/support/built-server.ts`) spawn `.output/server/index.mjs` with `stdio: ['ignore','ignore','pipe']` and strip every `NUXT_*` variable from the parent environment, so today stdout is discarded and no test supplies a key.
- Archived spec `runtime-config` says credentials are optional and the server starts with them empty. The story adds "invalid key blocks startup". The two are reconciled below.
- Nothing in the repo stores a credential yet; US-02 is the first consumer. Formats chosen here become persisted data, so they are expensive to change later.

## Goals / Non-Goals

**Goals:**

- One small set of primitives that later stories import and cannot easily misuse.
- Pure logic (redaction, request-ID validation, error-to-client mapping, key-format validation) lives in `shared/security` and is unit-tested without Nitro.
- Thin Nitro glue (middleware, plugin, error handler) whose behavior is proven against the built server.
- Redaction that fails safe: an unknown shape is truncated, never printed raw.

**Non-Goals:**

- Key rotation tooling, multi-key keyrings, or re-encryption jobs. The format supports them; the code reads one key.
- Log shipping, log levels per module, sampling, or pretty-printing.
- Authentication, sessions, CSRF, or rate limiting (US-02+).
- Request-body logging of any kind.
- Retrofitting the mock-services package with the logger.

## Decisions

### D1. Module layout

```
shared/security/
  redact.ts          pure: redactValue(value, opts) -> JSON-safe copy; scrubString()
  secret-string.ts   SecretString class
  request-id.ts      isSafeRequestId(), REQUEST_ID_PATTERN
  client-error.ts    toClientError(error, { requestId }) -> { statusCode, body }
  encryption-key.ts  isValidEncryptionKey(b64), ENCRYPTION_KEY_HELP text

server/utils/
  crypto.ts          encryptSecret / decryptSecret / DecryptionError (node:crypto)
  logger.ts          logger.{debug,info,warn,error}(msg, fields); writes JSON to stdout
  request-context.ts getRequestId()

server/utils/request-id.ts           assignRequestId(event): Node-level, no h3 imports
server/utils/http-error.ts           httpError(status, message): the only way to expose a message
server/middleware/00.request-id.ts   calls assignRequestId
server/plugins/01.request-log.ts     access log via the response `finish` event; registers secrets
server/error-handler.ts              first in the Nitro error-handler chain; uses toClientError
```

Why: this satisfies the existing import rules (`shared/` framework-free, everything with `node:` or Nitro under `server/`) and lets the security-critical logic be tested at the unit layer where `pnpm check` runs it with no database or network. Alternative: put everything under `server/utils`. Rejected: not runnable in `pnpm check` without a Nitro harness, and this repo's gate deliberately keeps that layer pure.

### D2. Encryption key handling: unset allowed, set-but-invalid fatal

- `encryptionKey` in `serverConfigSchema` stays optional. When non-empty it must match a strict standard-base64 pattern for exactly 32 bytes (`^[A-Za-z0-9+/]{43}=$`). The pattern check is pure, so it works in `shared/` without `Buffer`. URL-safe base64 is rejected on purpose so there is one accepted form.
- Failure text comes from the existing `formatConfigError`, extended with the generation hint from `ENCRYPTION_KEY_HELP`. It never echoes the value.
- Unset: startup succeeds and logs one `warn` ("encryption key not configured; storing credentials will fail"). `encryptSecret`/`decryptSecret` throw a dedicated configuration error naming `NUXT_ENCRYPTION_KEY` and the `openssl` command.
- `scripts/init.sh` fills an empty `NUXT_ENCRYPTION_KEY=` in `.env` with `openssl rand -base64 32`, only when the value is empty. Bootstrap stays idempotent and the key never enters version control. The runtime-config delta captures this.
- Tests and CI supply a fixed throwaway key through env (a constant in `tests/support/env.ts`, clearly labeled as a test-only value; `.github/workflows/ci.yml` gets the same). Because `serverEnv()` strips `NUXT_*`, the helper adds it by default so existing built-server tests keep working, and individual tests override it.

Alternatives: (a) require the key always. Rejected: breaks `cp .env.example .env` and contradicts the existing spec for a value nothing uses until US-02. (b) require it only when `NODE_ENV=production`. Rejected: the built server in every test runs in production mode, so it gives no useful distinction and adds an environment-dependent code path. (c) A default dev key in code. Rejected: a known key in the repo defeats the purpose and would silently protect production data with a public key.

### D3. Blob format details

- `v1:<keyId>:<iv>:<tag>:<ciphertext>`, base64url without padding for the last three parts, so `:` never appears inside a part.
- `keyId` = first 8 hex characters of `sha256(rawKey)`. It is derived, so it can never disagree with the configured key and needs no extra env variable. 32 bits of a hash of a 256-bit random key reveals nothing usable. On decrypt, a `keyId` mismatch throws `DecryptionError` with a "different key" message before any crypto is attempted; this gives a better error than a bare auth-tag failure and is the hook a future keyring would use to select a key.
- Optional AAD: `encryptSecret(plain, { context })` / `decryptSecret(blob, { context })`. The context is passed as GCM additional authenticated data and is not stored. Callers such as US-02 can bind a value to `table:column:id` so a database writer cannot swap ciphertexts between rows. The context is not in the blob, so callers must recompute it; that is the caller's contract. It is cheap now and impossible to add compatibly after data exists, which is why it is in v1 despite the story text showing a one-argument signature (the extra argument is optional).
- All decrypt failures (bad version, bad parts, wrong length IV, tag failure, wrong context) are normalized to one `DecryptionError` with a fixed message per cause and no cause chain carrying the underlying OpenSSL message, plaintext, or key.
- Key material is decoded once and cached per process, never logged, and never exposed by any exported function.

### D4. Redaction algorithm

`redactValue(value, options)` returns a new JSON-safe structure and never mutates input.

- Key match: normalize by lowercasing and removing `_` and `-`, then compare with a `Set` of normalized denied names. This covers `Authorization`, `set-cookie`, `client_secret`, `access_token`, `x-api-key` without listing each spelling. Exact match after normalization (not substring), to avoid hiding `tokenCount`, `codeOwner`, or `secretary`. The cost: `myToken` is not matched. Accepted; the value scrubbing in the next bullet is the safety net and new names can be added to the list.
- Deny list: the story's list plus `apiKey`, `privateKey`, `encryptionKey`, `code`, `proxyAuthorization`, `xApiKey`, `credentials`. `code` is included for the OAuth callback; it matches any field literally named `code`, which is a known over-redaction cost (HTTP status `code` fields become `[REDACTED]`). Code that logs numeric codes should use `status`/`errorCode`. Called out in `docs/security.md`.
- Value scrubbing on every string, including error messages: `Bearer` and `Basic` credentials, JWT-shaped tokens (`eyJ...`), Atlassian API tokens (`ATATT...`), and `user:password@` inside URLs (a connection string in a driver error is the likeliest leak) are replaced. Additionally a process-wide registry of literal secrets (encryption key, OAuth client secret from runtime config, registered at plugin start, ignoring values shorter than 8 characters to avoid scrubbing common words) is scrubbed by exact substring.
- Traversal: `Error` -> `{ name, message, stack, cause }` recursing into `cause` and `AggregateError.errors`; arrays and plain objects recurse; `Map`/`Set` become arrays; `Buffer`/typed arrays become `"[Binary N bytes]"`; `SecretString` becomes `[REDACTED]`; functions and symbols are dropped; `bigint` becomes a string; getters that throw become `"[Unreadable]"`. Cycles are tracked with a `WeakSet` path and produce `[Circular]`; depth beyond 8 produces `[Truncated]`; strings longer than 8 KB are truncated with a marker.
- The logger applies `redactValue` to the whole entry after adding `requestId`, so a caller cannot bypass it by logging a field named `requestId` or `msg`.

Alternatives: `pino` with its `redact` paths. Rejected: paths are exact and case-sensitive, wildcard depth must be enumerated, and neither value scrubbing nor cause chains are covered; the story also requires case-insensitive, any-depth matching. A custom ~150-line walker with focused tests is simpler to audit than configuring around a library. Since the story bans third-party crypto only, not logging, this is a judgment call, revisit if log needs grow (levels per module, transports).

### D5. Logger

- `server/utils/logger.ts` exposes `logger.debug|info|warn|error(msg, fields?)`. Output is one JSON line to stdout via `process.stdout.write`, with `time` (ISO), `level`, `msg`, `requestId` (when in a request), plus redacted fields. `error` writes to stdout too, not stderr, so one stream carries the whole timeline. Startup validation output remains on stderr through `console.error`.
- Level threshold from `NUXT_LOG_LEVEL` is not added now (non-goal). Debug entries are emitted only when `NODE_ENV !== 'production'`.
- Writes are synchronous single `write` calls so lines do not interleave.

### D6. Request ID propagation to layers without `event`

Enable `nitro.experimental.asyncContext = true` and read `useEvent().context.requestId` inside `getRequestId()`, wrapped in a try/catch that returns `undefined` outside a request. `useEvent` is Nitro's supported way to get ambient request context; the request-ID middleware (`00.` prefix so it runs first) writes `event.context.requestId` and sets `x-request-id`.

Alternatives: (a) own `AsyncLocalStorage` with `enterWith` from a hook. Works but relies on `enterWith` semantics and diverges from the framework; keep as the fallback if the Nitro option behaves differently in the built output. (b) Pass a logger down through every service call. Explicit, but every signature in US-02 to US-20 carries it and forgetting it silently drops the ID. (c) Only log from handlers. Rejected by the spec ("service or integration code logs during a request").
Validation of this decision is task 1 of implementation: a concurrency test with two interleaved requests must show each log line carrying its own ID, against the built server.

### D7. Request IDs

- `isSafeRequestId` uses `^[A-Za-z0-9-]{8,64}$` tested against the whole header value. Because `$` matches before a trailing newline in some engines, the implementation also rejects any value containing `\n` or `\r`, and a unit test locks it in. With JS regexes `$` without the `m` flag only matches at the true end, so this is belt-and-braces.
- Generation: `crypto.randomUUID()` (36 chars, matches the pattern). Multiple inbound headers (array or comma-joined) are treated as unsafe and replaced.
- Set on the response as early as possible, and again in the error handler, because Nitro builds error responses outside the normal middleware response.

### D8. Access log

The `request` hook attaches a `finish` listener to the response. `finish` fires for every response, including error responses; h3's `afterResponse` hook does not run when the error handler answers, which the first build showed (404s produced no entry). The entry passes the request ID explicitly because a socket event listener is not guaranteed to run inside the request's async context. Fields: `requestId`, `method`, `path` (query removed), `status`, `durationMs`. No headers, no bodies, no query.

### D9. Global error handler

- `server/error-handler.ts` is written against Node's `req`/`res` (structural `RequestEventLike`), so it imports no h3 helpers. h3 is not a direct dependency of the app and this keeps the handler runnable in tests against real Node requests.
- Registration: a `nitro:config` hook in `nuxt.config.ts` prepends it to `nitroConfig.errorHandler`. Nuxt only installs its own handler when `errorHandler` is unset, so setting the option directly would remove the Nuxt HTML error page; prepending keeps the chain `[ours, Nuxt's, Nitro default]`. Nitro stops at the first handler that leaves the event handled.
- Behavior: log every failure, then for `/api/` requests answer `toClientError(...)` as JSON with `x-request-id`, a generic HTTP status text (an error-supplied status text can carry secrets), and `cache-control: no-store`. For other paths it does not answer, so Nuxt renders its page.
- Message policy: status >= 500 or unknown origin gets the generic message; a status < 500 shows its own message only when the error came from `httpError()` (`data.expose === true`). `data`, `cause`, and `stack` are never in the body.
- Logging: 5xx at `error` with stack and cause chain; 4xx at `warn` with the message only (scanners hitting unknown routes should not produce stack traces in the log).
- Same shape in development; extra detail comes from the log, not the response.

Alternative: h3 `onError` or a plugin `error` hook. Rejected as the primary mechanism: hooks observe errors but cannot replace the response.

### D10. How to test "a route that throws" in a production build

Do not ship a debug route. Layers of proof:

1. Unit: `toClientError` exhaustively (5xx, deliberate 4xx, unknown 4xx, upstream-body error, token in message, `data`/`cause` present).
2. Integration (`tests/integration/error-handler.test.ts`): a tiny `node:http` server in the test process runs the real `error-handler` on real requests and responses, with throwing routes that exist only in the test. Possible because the handler uses Node's API only (D9).
3. Integration against the built server: an unknown `/api/` route proves the handler is wired into `nitro:config` (JSON contract, request ID, generic status text, warn log), and a page request proves Nuxt's HTML error page still renders.

Alternative considered: a build-time env-gated fixture route. Rejected because `.output` is reused by e2e and could ship in a real artifact.

### D11. Test harness and lint

- `startBuiltServer` pipes stdout too and exposes `logs()` returning parsed JSON lines, so tests assert on real server output. `runBuiltServerUntilExit` is unchanged.
- ESLint: a `server/**` override `'no-console': ['error', { allow: ['error', 'warn'] }]`. Replaces the story's CI grep with the gate that `pnpm check` already runs; `console.log`, `info`, `debug` fail. Both `.github/workflows/ci.yml` and the story's "grep check" done item are satisfied by lint; the story file is left untouched but `docs/security.md` records the substitution.

### D12. Documentation and decision record

ADR `0010-security-foundation.md` records D2 (unset key policy), D3 (derived keyId, AAD), D4 (custom redaction), D6 (async context) and D9 (error exposure marker). `docs/security.md` gains key generation, blob format, redaction list and the `code` over-redaction note.

## Risks / Trade-offs

- [Async context via `useEvent` may not be enabled or may lose context across some awaits in the built server] -> First implementation task is a spike test with two concurrent requests against the built server; fall back to `AsyncLocalStorage.enterWith` from a `request` hook (D6 alternative a).
- [Key-name deny list misses a differently named secret (`myToken`, `bearer`)] -> Value scrubbing for bearer and JWT patterns and registered literals; list is one Set, extended when a story introduces a new secret-carrying field; each later story that logs upstream data adds a redaction test.
- [Over-redaction of `code` hides useful debugging info] -> Documented; use `errorCode`/`status` for non-secret codes.
- [Changing `keyId` derivation or blob format later would strand stored values] -> `v1` prefix and a rejected unknown version; a `v2` can be added with a dual-read decrypt. No data exists before US-02.
- [Unset key allowed at startup means a misconfigured deployment only fails when a user first saves a credential] -> One startup `warn` log; bootstrap generates the dev key; a later story that requires credentials can make the key mandatory by removing `.optional()` in one place.
- [Existing built-server tests rely on stripped `NUXT_*` env and now need a key] -> Helper injects the test key by default; verified by running the existing `test:int` and `test:e2e` suites.
- [Error handler replacing Nitro's default may break the Nuxt HTML error page] -> Prepend to the chain instead of replacing it, answer only `/api/`; covered by a page-request test on the built server.
- [For an unexpected error while rendering a page, Nuxt's handler still prints the raw error to stderr through Nitro's default logging, outside the redactor] -> Documented in `docs/security.md` and quality notes; no page handles credentials yet. Revisit when one does.
- [Logging on every request adds stdout volume, including health probes] -> Acceptable at this scale; revisit when a real deployment probe exists.
- [Custom logger is security-critical code owned by us] -> Small, pure, heavily tested (property-style tests over nested/cyclic/array inputs), and the only path to stdout enforced by lint.

## Migration Plan

- No persisted data or schema exists yet, so there is nothing to migrate.
- Developers re-run `./scripts/init.sh` to get a generated `NUXT_ENCRYPTION_KEY` in `.env`; an existing `.env` with an empty key keeps working (unset is allowed) until a credential story needs it.
- CI gets a throwaway test key in workflow env.
- Rollback: revert the change. Because nothing is encrypted yet, no data becomes unreadable.

## Open Questions

- Should a later story add `NUXT_LOG_LEVEL`? Not needed until log volume is a problem; adding it does not change these specs.
- Do we want a `keyring` env (`NUXT_ENCRYPTION_KEY_PREVIOUS`) when rotation tooling is scheduled? Deferred; the blob's `keyId` already permits it.
