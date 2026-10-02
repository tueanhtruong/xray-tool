# Security

## Secrets

- Real secrets live **only** in `.env` (gitignored) locally and in GitHub Actions secrets for CI.
  `.env.example` holds placeholders and local-only dev defaults, never real values.
- Never put a secret (token, API key, client secret, JWT, cookie, encryption key) in:
  - source code, tests, fixtures, or mock responses
  - logs, error messages, or API responses (the health endpoint returns no error details)
  - client bundles: only `runtimeConfig.public` reaches the browser, and it holds no secrets
  - commit messages, docs, issue text, or chat with an agent. If a secret is pasted by mistake,
    rotate it.
- User-entered Atlassian/Xray credentials are stored encrypted at rest (AES-256-GCM, see
  [Secret encryption](#secret-encryption)) and never returned after they are saved.
- Jira API-token sites are restricted to HTTPS hosts under `atlassian.net` by default. Additional
  DNS suffixes (`NUXT_JIRA_SITE_URL_SUFFIXES`) authorize outbound Basic-auth requests and must only
  name domains controlled by the deployment. Site validation happens before requests and redirects
  are rejected for Basic-auth calls. See [Jira API-token setup](setup-jira-api-token.md).
- API-token sign-in attempts are counted in Postgres by a hash of the client IP. Forwarded IP headers
  are used only when the direct peer is explicitly listed in `NUXT_TRUSTED_PROXY_IPS`.
- CI uses the mock target and needs **no** Atlassian or Xray secrets.

## Session cookies

- US-02 uses `nuxt-auth-utils` sealed sessions. Configure `NUXT_SESSION_PASSWORD` with at least
  32 random characters (`openssl rand -base64 32`) and keep it private in `.env` or deployment
  secrets. Every application instance must use the same value while sessions need to remain valid.
- The application does not use a built-in or public fallback password. The server can start without
  it, but sign-in/session issuance fails with an actionable message until configured.
- The sealed, httpOnly, `SameSite=Lax` cookie contains only the user ID and active workspace ID;
  tokens are kept in encrypted database fields. Cookies are `Secure` in production.

## Live testing: sandbox only

- `live` target development and `pnpm test:live` may only touch a **dedicated sandbox** Jira/Xray
  site and project (`SANDBOX_*` variables in `.env`), never a production site.
- Automated writes are namespaced, stay inside `SANDBOX_PROJECT_KEY`, and are cleaned up. The
  Xray GraphQL contract probe uses `SANDBOX_XRAY_PROJECT_ID` and is read-only.
- Live responses copied into fixtures must be sanitized first (see [testing.md](testing.md#fixture-sanitization)).

## Local infrastructure

- The Postgres credentials in `docker-compose.yml` / `.env.example` (`xray`/`xray`) are local-only
  development defaults. They are not secrets and must not be reused anywhere else.
- Integration tests refuse to reset any database whose name doesn't end in `_test`.

## Secret encryption

Code: `server/utils/crypto.ts` (`encryptSecret` / `decryptSecret`). Node `crypto` only.

- **Key**: `NUXT_ENCRYPTION_KEY`, 32 random bytes as standard base64 (44 characters ending in `=`).
  Generate with `openssl rand -base64 32`. `./scripts/init.sh` writes one into your `.env` when the
  value is empty and never overwrites an existing one. Never commit a real key.
- **Startup**: an unset key is allowed (the server warns once); a set but invalid key stops the
  server with a message that names the variable, says 32-byte base64, and shows the command above.
  Encrypting or decrypting with no key fails with the same guidance.
- **Format**: `v1:<keyId>:<iv>:<tag>:<ciphertext>`; the last three parts are base64url. AES-256-GCM,
  a fresh random 12-byte IV for every call, and the auth tag is verified on decrypt. `keyId` is the
  first 8 hex characters of `sha256(key)`, so a value made with another key is rejected with a clear
  message, and a future key ring can pick the right key. Unknown versions are rejected.
- **Context binding**: `encryptSecret(plain, { context })` / `decryptSecret(blob, { context })`
  authenticate the context string without storing it. Bind a value to where it lives, for example
  `` `${table}:${column}:${id}` ``, so a ciphertext copied to another row fails to decrypt. The caller
  must recompute the same context when reading.
- **Errors**: every decryption failure is a `DecryptionError` with a fixed message. The underlying
  OpenSSL error is dropped so it cannot carry plaintext or key material into logs.
- **Rotation**: not implemented. The version and `keyId` fields make it possible later; changing the
  key today makes existing values undecryptable.

## Logging and redaction

Server code logs only through `server/utils/logger.ts` (`logger.info(msg, fields)`), one JSON line per
entry on stdout. Lint rejects `console.log`, `info`, `debug` and `dir` under `server/**`
(`console.error`/`console.warn` remain allowed for startup failures printed before the logger
exists). This replaces the story's "grep in CI" check with the gate `pnpm check` already runs.

Redaction (`shared/security/redact.ts`) runs on every entry:

- **Keys** are redacted at any depth, in arrays, Maps, and error cause chains. Names are compared
  after lowercasing and removing `_` and `-`, exactly (not by substring), so `Authorization`,
  `client_secret`, `access_token` and `x-api-key` all match but `tokenCount` does not.
  List: `authorization`, `proxyAuthorization`, `cookie`, `setCookie`, `password`, `token`,
  `accessToken`, `refreshToken`, `idToken`, `apiToken`, `apiKey`, `xApiKey`, `clientSecret`,
  `secret`, `jwt`, `privateKey`, `encryptionKey`, `credentials`, `code`.
- **Values** are scrubbed inside every string, including error messages: `Bearer <credential>`,
  `Basic <credential>`, JWT-shaped tokens (`eyJ...`), Atlassian API tokens (`ATATT...`),
  `user:password@` in URLs, and literal secrets registered with `registerSecret()` (the encryption
  key and OAuth client secret are registered at startup). Anything else in free text is **not**
  detected: wrap such values in `SecretString` or register them.
- `code` is on the list because OAuth callbacks carry a one-time `code`. A field literally named
  `code` is therefore redacted; log numeric or symbolic codes as `status` or `errorCode`. Error
  objects keep their own `code` under `errorCode`.
- `SecretString` (`shared/security/secret-string.ts`) renders as `[REDACTED]` for `String()`,
  template literals, `JSON.stringify` and `util.inspect`; `reveal()` returns the value.
- Cycles become `[Circular]`, depth over 8 becomes `[Truncated]`, strings over 8 KB and arrays over
  200 items are truncated, binary data is summarized. Input objects are never mutated.
- Request bodies are never logged. Query parameters are logged as structured fields for diagnosis;
  sensitive parameter names (including OAuth `code` and `state`) are redacted automatically. Avoid
  putting other confidential data in query parameters, since values under ordinary names are logged.

## Request IDs and error responses

- Every response has `x-request-id`. A safe inbound value (`^[A-Za-z0-9-]{8,64}$`, whole value) is
  reused; anything else is replaced with a UUID, so inbound values cannot inject into logs.
- Every log line written during a request carries `requestId` automatically (Nitro async context,
  `nitro.experimental.asyncContext`), including lines from services and integration clients.
- One access-log entry per request: `requestId`, `method`, `path`, structured `query`, `status`,
  `durationMs`.
- Failed `/api/` requests return exactly `{ statusCode, message, requestId }`. 5xx and errors of
  unknown origin get a generic message for the status. Only an error built with `httpError(status,
message)` (status below 500) may show its own message; never put upstream response text in it.
  Stack traces, causes, `data`, and status text are never sent. Full detail (stack, cause chain) is
  logged, redacted, for 5xx; 4xx log the message only.
- Page requests keep the Nuxt error page. Known gap: for an unexpected error while rendering a page,
  Nuxt's own handler still prints the raw error to stderr through Nitro's default logging, outside
  the redactor. Revisit when pages handle credentials.
