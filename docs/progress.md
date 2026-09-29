# Progress log

Newest entry first. One entry per session: done, in progress, next, open questions.

## 2026-09-29 — US-02 Jira OAuth sign-in

**Done**

- Added sealed ID-only sessions with `nuxt-auth-utils`, signed OAuth state/pending-flow cookies,
  login/logout, protected page/API routes, and single-/multi-site Atlassian OAuth flows.
- Added `User`, `Workspace`, `JiraConnection`, and expiring `PendingOAuthGrant` Prisma models and
  migrations. OAuth tokens and temporary grants are encrypted with context-bound AES-GCM.
- Added workspace Jira client with the 60-second refresh window, per-workspace single-flight,
  encrypted rotation persistence, and revoked-token session invalidation.
- Added deterministic Atlassian mock scenarios, OAuth setup docs, ADR 0011, unit/integration/e2e
  coverage, and mock route documentation.
- `pnpm check` passes; targeted OAuth/refresh/mock integration tests and US-02 Playwright e2e pass.
- Follow-up after first live consent: changed the token exchange to Atlassian's documented JSON
  request format and added the required `read:me` scope/User Identity API permission guidance.

**In progress**

- US-02 remains `active`. The full story verification is not yet run; `pnpm verify US-02` requires
  committed code and a clean tree.

**Next**

- Complete the remaining full regression run and review security behavior, then commit
  `US-02: Jira OAuth sign-in` and run `pnpm verify US-02`.

**Open questions**

- Refresh single-flight is process-local per workspace. Multi-instance refresh locking is deferred
  until deployment topology requires distributed coordination.

## 2026-09-29 — US-01 security foundation

**Done**

- `shared/security`: pure redaction (key deny-list normalized for case/`_`/`-`, value scrubbing of
  Bearer/Basic, JWT, Atlassian API tokens, URL credentials, registered secrets), `SecretString`,
  request-ID validation, client-error mapping, encryption-key format check.
- `server/utils/crypto.ts`: AES-256-GCM, `v1:<keyId>:<iv>:<tag>:<ciphertext>`, derived `keyId`,
  optional AAD context, single `DecryptionError`, clear error when no key is configured.
- Config: `NUXT_ENCRYPTION_KEY` optional but validated when set (fail-fast message with the
  `openssl` command, never echoing the value); one startup warning when unset; `init.sh` generates
  a local key into `.env` (idempotent).
- Structured JSON logger (stdout, redacted), request IDs via Nitro async context, access log per
  request (response `finish` event), global error handler (`{ statusCode, message, requestId }`,
  chained ahead of Nuxt's page handler from a `nitro:config` hook), `httpError()`.
- Lint bans `console.log/info/debug/dir` in `server/**` (replaces the CI grep).
- Test harness pipes server stdout (`logs()` / `output()`) and injects a test-only key.
- Docs: `docs/security.md`, `docs/quality.md`, ADR 0010. Health route now logs probe failures.
- `pnpm check`, `test:int` (39), `test:e2e` (6) all green locally.

**In progress**

- US-01 stays `active`. `pnpm verify US-01` needs a clean, committed tree; commit first, then run it.

**Next**

- Commit `US-01: security foundation`, `pnpm verify US-01`, commit `US-01: mark passing`.
- Then US-02 (Jira OAuth). It is the first consumer: use `encryptSecret(..., { context })` and
  `httpError()`, and log upstream traffic only through the logger.

**Open questions**

- Nuxt's own handler still prints raw page-render errors to stderr outside the redactor
  (docs/security.md). Revisit when a page handles credentials.
- CI needs no key change: `init.sh` generates one and the test helpers inject their own.

## 2026-09-29 — US-00 project setup & harness

**Done**

- Nuxt 4.5.2 skeleton (Nuxt UI 4, TS strict), pnpm 11 workspace, Node 24 pinned.
- Postgres 16 (docker compose), Prisma 7.10.0 + pg adapter, empty `0_init` migration.
- Zod runtime-config validation at server start (fail-fast, names `NUXT_*` vars, points to `.env.example`).
- Integration target switch (`live|mock`) resolved only in `server/utils/integration-urls.ts`.
- `GET /api/health` → `{ status, db, version }` (2 s DB probe, no error details).
- `packages/mock-services` (`pnpm mock`, `GET /health`), started on demand by test runners.
- `scripts/init.sh` (idempotent; checked by running it twice with a scratch row), `scripts/verify-story.mjs`.
- ESLint architecture guard + unit test; unit, integration, and e2e smoke suites green on the mock target.
- CI workflow, harness docs, ADRs 0001–0009, backlog docs updated for live-first / mock-verify.
- TypeScript 7 spike failed (vue-tsc incompatible) → pinned 5.9.3 (ADR 0009).
- Test DB reset uses drop/recreate `public` schema + `migrate deploy`, because Prisma blocks
  `migrate reset --force` for AI agents (docs/testing.md).

**In progress**

- US-00 is `active` until `pnpm verify US-00` passes on the committed baseline.

**Next**

- `pnpm verify US-00`, then commit `US-00: mark passing`.
- Then US-01 (security foundation).

**Open questions**

- "CI green on initial commit" (US-00 done check) stays **open** until a GitHub remote exists and
  the workflow has run once.
- Xray region endpoint for the sandbox (global vs us/eu). Settle in US-04 via `NUXT_XRAY_BASE_URL`.
