# 0010 — Security foundation

- Status: accepted
- Date: 2026-09-29
- Story: US-01

## Context

US-02 onward stores Jira/Xray secrets and logs upstream traffic. One audited set of primitives is
built first. Formats chosen here become persisted data, so they are the expensive part to change.

## Decisions

1. **Encryption key is optional at startup, validated when set.** An unset `NUXT_ENCRYPTION_KEY`
   keeps `cp .env.example .env` bootable and honors the runtime-config rule that credentials are
   not required before they are used. A set but malformed key exits non-zero. Use fails clearly.
   `init.sh` generates a local key into `.env`. Rejected: always required (breaks bootstrap for a
   value nothing uses until US-02), required only in production (built test servers all run in
   production mode), and a default key in code (a public key protecting real data).
2. **Blob `v1:<keyId>:<iv>:<tag>:<ciphertext>`, `keyId` derived from the key** (`sha256`, 8 hex).
   No extra variable to drift; mismatch gives a clear error and is the hook for a future key ring.
3. **Optional AAD `context`.** Not stored; authenticated. Lets callers bind a value to its row.
   Cheap now, impossible to add compatibly once data exists.
4. **Custom redactor, no logging library.** Requirements are case-insensitive any-depth key
   matching, cause chains, and value scrubbing; `pino` redaction paths are exact and case-sensitive.
   Keys match exactly after removing `_`/`-` (not by substring) to avoid hiding `tokenCount`.
   Value scrubbing covers known shapes (Bearer, JWT, Atlassian API token, URL credentials) plus
   registered literals; the gap for other free-text secrets is documented.
5. **Request ID via Nitro async context** (`nitro.experimental.asyncContext` + `useEvent()`),
   verified against the built server under concurrent requests. Rejected: passing a logger through
   every service call, `AsyncLocalStorage.enterWith` (kept as fallback, not needed).
   Code that runs outside the request's async context (hooks, the error handler) passes the ID
   explicitly.
6. **Error handler written against Node's request/response**, registered first in the chain from
   the `nitro:config` hook, so Nuxt's own HTML error handler stays behind it for pages. It answers
   only `/api/`. Node-level so it needs no h3 import (h3 is not a direct dependency) and can be run
   against real Node requests in tests without shipping a debug route.
7. **Exposure marker.** Only errors from `httpError()` (`data.expose === true`, status < 500) show
   their message; everything else gets the generic text for its status.
8. **Access log uses the response `finish` event**, because h3's `afterResponse` hook does not run
   for error responses.
9. **`console.log` ban is a lint rule** for `server/**` rather than a separate CI grep.

## Consequences

- Rotating the key today invalidates stored values; a keyring is future work.
- Fields literally named `code` are redacted; use `errorCode`/`status`.
- Unexpected errors while rendering a page are still printed by Nuxt's default handler outside the
  redactor (see docs/security.md).
- The health route now logs probe failures (redacted); its response body is unchanged.
