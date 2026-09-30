# Progress log

Newest entry first. One entry per session: done, in progress, next, open questions.

## 2026-09-30 — US-05 Jira/Xray project selection

**Follow-up in progress — finish-us-05**

- Added workspace/project-scoped Folder, TestCase, TestCaseSnapshot, and TestCaseDraft foundations; draft and test-case writes serialize on the workspace lock.
- Project replacement now checks persisted drafts and deletes the previous project's folders and test cases atomically with selection updates.
- Integration coverage exercises draft blocking, cross-workspace isolation, cache cleanup, first selection, probe failure, and transaction rollback. US-05 E2E includes project switching and persisted-draft blocking.
- `pnpm check`, focused project-selection integration tests, and US-05 E2E pass on the mock target.
- `pnpm verify US-05` passed against commit `6362b450f4c8e36c9d11958a9d699a849aa859b9`; US-05 is `passing`.

**Done**

- Activated US-05 after US-03 and US-04 passed; baseline `./scripts/init.sh` and `pnpm check` passed.
- Confirmed Jira Cloud APIs: `GET /rest/api/3/project/search`, `GET /rest/api/3/project/{projectIdOrKey}`, `GET /rest/api/3/issuetype/project?projectId=...`, and `GET /rest/api/3/project/{projectIdOrKey}/statuses`.
- Added nullable workspace project metadata and migration; existing workspaces remain unready until selection.
- Added Jira project search/metadata integration, Xray root-folder probe, selection API/service, onboarding UI, repository readiness boundaries, mock behaviors, integration tests, and E2E coverage.
- `pnpm check`, project-selection integration tests (4), and US-05 E2E tests (2) pass on the mock target.
- OpenSpec change `jira-project-selection` archived after syncing `jira-project-selection/spec.md` to the main capability spec.

**In progress**

- US-05 is `active`; implementation follow-up is being completed in OpenSpec change `finish-us-05`.

**Next**

- Finish the full verification sequence, commit `US-05: finish project-switch safeguards`, then run `pnpm verify US-05` on the clean committed tree.

**Open questions**

- US-06/US-07/US-09 should extend the workspace/project ownership and atomic cache-cleanup contract when adding their workflows and fields.

## 2026-09-30 — US-04 Xray credentials & JWT exchange

**Done**

- Added workspace-owned Xray connection persistence with encrypted client ID, client secret, and JWT cache, plus fixed Global/US/EU/AU routing and the `NUXT_XRAY_BASE_URL` override.
- Added verified-before-save settings APIs/UI, server-side GraphQL JWT reuse/refresh, one-time 401 recovery, bounded 429/503 retry, and sanitized GraphQL errors.
- Added deterministic Xray mock controls/routes, unit/integration/Playwright coverage, `docs/integrations/xray.md`, ADR 0013, and the Xray connection OpenSpec capability.
- `pnpm check`, targeted Xray/mock integration tests (9), and US-04 Playwright tests (2) pass.
- OpenSpec change `xray-credentials-and-jwt` archived after syncing both delta specs to main specs.
- `pnpm verify US-04` passed and recorded evidence for implementation commit `0539afc`; state update committed as `5be9e60`.

**In progress**

- None. US-04 is `passing`.

**Next**

- Begin US-05, Jira/Xray project selection; its dependencies US-03 and US-04 are passing.

**Open questions**

- Cross-process JWT refresh locking is deferred; current database cache and process-local single-flight are sufficient for the current deployment assumptions.

## 2026-09-29 — US-03 Jira API-token fallback

**Done**

- Added API-token sign-in with strict site URL validation, encrypted connection credentials, and the
  existing ID-only session. The workspace Jira client dispatches OAuth/API-token auth while keeping
  OAuth refresh behavior intact.
- Added settings metadata, token replacement, disconnect, Postgres-backed per-IP rate limiting, and
  trusted-proxy/site-suffix configuration.
- Added deterministic API-token mock behavior, unit/integration/Playwright coverage, setup guide,
  and ADR 0012.
- `pnpm check`, targeted API-token integration tests, and US-03 Playwright e2e pass.
- OAuth integration/refresh regression tests (18) and OAuth Playwright tests (6) pass with the
  generalized connection model and shared Jira client.

**In progress**

- US-03 is `active`; the story verification has not been run. `pnpm verify US-03` requires committed
  code and a clean tree.

**Next**

- Review the OAuth/API-token shared-client contract and run the story verification after committing
  `US-03: Jira API-token fallback`.

**Open questions**

- None blocking the story. Additional Jira domain suffixes and proxy IPs require deliberate runtime
  configuration; the default is `atlassian.net` and no trusted proxies.

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
