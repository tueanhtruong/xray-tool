## 1. Preflight & toolchain

- [x] 1.1 Confirm Node 24 LTS is active (`nvm install 24 && nvm use 24`); set US-00 to `active` in `docs/user-stories/feature-list.json`
- [x] 1.2 Initialize the root `package.json`: name, version `0.0.0`, `private`, `type: module`, exact `packageManager` (pnpm 11.x), `engines.node` `>=24.11 <25`; add `.nvmrc` (24) and `.npmrc` with `engine-strict=true`
- [x] 1.3 Add `pnpm-workspace.yaml` (`packages: ['packages/*']`) with explicit build-script approval for prisma, @prisma/engines and esbuild
- [x] 1.4 Add `.gitignore` (node_modules, .nuxt, .output, .env, `server/generated/`, playwright reports, coverage) and `.editorconfig`

## 2. Nuxt app skeleton

- [x] 2.1 Install exact `nuxt@4.5.2` and `@nuxt/ui` 4.x; create `nuxt.config.ts` (compatibility date, `@nuxt/ui`, `@nuxt/eslint`, runtimeConfig keys with empty defaults, `public.appVersion` from package.json)
- [x] 2.2 Create `app/app.vue`, `app/assets/css/main.css` (Tailwind v4 + Nuxt UI imports), and a placeholder `app/pages/index.vue` showing the app name
- [x] 2.3 Create empty layer folders with a `README.md` stub: `server/services/`, `server/integrations/jira/`, `server/integrations/xray/`, `shared/utils/`
- [x] 2.4 Enable TypeScript `strict` (and `noUncheckedIndexedAccess`) via Nuxt `typescript` options; confirm `nuxt prepare` generates the app, server, and shared tsconfigs
- [x] 2.5 TypeScript spike: install `typescript@7` + `vue-tsc@3.3.11` and run `nuxt typecheck` on the skeleton; fall back to exact `typescript@5.9.x` if it fails; note the result for ADR 0009

## 3. Tooling & architecture guard

- [x] 3.1 Add `@nuxt/eslint` flat config + Prettier (`eslint-config-prettier`), with `lint` and `format` scripts
- [x] 3.2 Add `no-restricted-imports` overrides: `app/**` must not import server code or the generated Prisma client; `shared/**` must not import `#imports`, `#app`, `nuxt*`, `#internal/*`, `nitropack*`, `h3`, `vue`, `server/`, or `app/`
- [x] 3.3 Add a `typecheck` script (`nuxt typecheck`) and check that it passes on the skeleton
- [x] 3.4 Unit test `tests/unit/architecture-guard.test.ts`: run ESLint programmatically on inline sources and assert both rules reject a violation and allow a permitted import

## 4. Test harness

- [x] 4.1 Install `vitest@5`, `@nuxt/test-utils@4`, `@vue/test-utils`, `happy-dom`; create `vitest.config.ts` with projects `unit` (`tests/unit/**`) and `integration` (`tests/integration/**`)
- [x] 4.2 Add scripts `test:unit` (`vitest run --project unit`) and `test:int` (`vitest run --project integration`), both accepting an optional path
- [x] 4.3 Install `@playwright/test`; create `playwright.config.ts` (chromium only, `e2e/` dir, `webServer` for the built app, plus the mock when `NUXT_INTEGRATION_TARGET=mock`, reusing an existing server); add a `test:e2e` script
- [x] 4.4 Create `tests/live/README.md` documenting the reserved `test:live` layer (no script yet)

## 5. Database

- [x] 5.1 Add `docker-compose.yml`: a `postgres:16` service, fixed port 5432, named volume, `pg_isready` healthcheck, local-only dev credentials
- [x] 5.2 Install exact `prisma@7.10.0`, `@prisma/client@7.10.0`, `@prisma/adapter-pg@7.10.0`, `pg`, `dotenv`; create `prisma.config.ts` (loads `.env`, uses `NUXT_DATABASE_URL`) and `prisma/schema.prisma` (postgresql datasource, `prisma-client` generator → `server/generated/prisma`, no models)
- [x] 5.3 Hand-write `prisma/migrations/0_init/migration.sql` (comment only) and `migration_lock.toml`; check that `prisma migrate deploy` applies it
- [x] 5.4 Create `server/utils/prisma.ts`: a lazily created singleton client using the pg adapter and `runtimeConfig.databaseUrl`
- [x] 5.5 Create integration global setup `tests/integration/setup/global.ts`: load `.env`, require `NUXT_DATABASE_URL_TEST`, refuse unless the database name ends in `_test` and differs from the dev URL, reset it (drop/recreate the `public` schema, then `prisma migrate deploy`; `prisma migrate reset` is blocked for AI agents), start/stop the mock when target=mock (reuse if already listening)

## 6. Runtime configuration

- [x] 6.1 Create a pure Zod schema in `shared/config/` for the config shape (databaseUrl required; integrationTarget `live|mock` default `live`; mockServicesUrl default `http://localhost:4010`; optional base URL overrides and credential fields), with an error formatter that maps keys to `NUXT_*` env names and mentions `.env.example`
- [x] 6.2 Create `server/utils/integration-urls.ts`: the only function that resolves auth / API / Xray base URLs from target + overrides
- [x] 6.3 Create the Nitro plugin `server/plugins/00.validate-config.ts`: validate `useRuntimeConfig()`, print the formatted error to stderr, and throw so the built server exits non-zero
- [x] 6.4 Write `.env.example` listing every planned variable with comments: DB (dev/test), integration target + mock URL + overrides, Atlassian OAuth client id/secret/redirect, Jira API token fallback, Xray client id/secret, encryption key, sandbox project key, `MOCK_SERVICES_PORT` — placeholders only
- [x] 6.5 Unit tests `tests/unit/config/*.test.ts`: schema accepts a minimal valid config; the missing DB URL error names `NUXT_DATABASE_URL` and `.env.example`; invalid URL and unknown target are rejected; URL resolution for live, mock, and override
- [x] 6.6 Integration test `tests/integration/config-fail-fast.test.ts`: spawn `.output/server/index.mjs` with `NUXT_DATABASE_URL` unset and assert a non-zero exit plus stderr contents; fail with an actionable message if `.output` is missing

## 7. Health endpoint

- [x] 7.1 Create `server/api/health.get.ts`: `SELECT 1` with a 2s timeout → `{ status: "ok", db: "ok"|"down", version }`, with no error details in the body
- [x] 7.2 Integration test `tests/integration/health.test.ts`: against the built app with the test DB, assert 200/ok/ok/version; with an unreachable DB URL, assert `db: "down"` within 3s and only the three fields present

## 8. Mock services package

- [x] 8.1 Create `packages/mock-services` (`@xray-tool/mock-services`, private, `type: module`) with exact `h3@1.x`; `src/server.ts` serving `GET /health` and 404 for everything else, on `MOCK_SERVICES_PORT` (default 4010); a `dev` script using `node --watch`
- [x] 8.2 Add the root script `pnpm mock` (`pnpm --filter @xray-tool/mock-services dev`); document the reserved prefixes `/atlassian-auth`, `/atlassian-api`, `/xray` in the package README
- [x] 8.3 Integration test `tests/integration/mock-services.test.ts`: with the mock target, `/health` returns ok and an unknown route returns 404; the global setup reuses a running mock

## 9. Bootstrap script

- [x] 9.1 Write `scripts/init.sh` (`set -euo pipefail`): prerequisite checks with fix commands (Node major vs `.nvmrc`, pnpm, docker daemon unless `CI=true`, `.env` present)
- [x] 9.2 Add bootstrap steps: `pnpm install --frozen-lockfile`, `docker compose up -d --wait postgres` (skipped in CI), ensure the `xray_test` DB exists, `prisma generate`, `prisma migrate deploy`, `playwright install chromium`, print a summary; no mock start
- [x] 9.3 Manually check idempotency: run `./scripts/init.sh` twice, insert a row into a scratch table in between, and confirm it survives (then drop the scratch table)

## 10. Story verification gate

- [x] 10.1 Write `scripts/verify-story.mjs`: arg parsing (`<US-ID>`, `--file`); preconditions (exists, `active`, deps `passing`, HEAD exists, clean tree, not already passing), each with a non-zero exit and explanation
- [x] 10.2 Run verification commands sequentially with inherited stdio, `NUXT_INTEGRATION_TARGET=mock`, timing each; stop at the first failure and print the command + exit code; leave the file untouched
- [x] 10.3 On success: re-check the tree is clean (list changed files if not), write `state: "passing"` + evidence `{ commit, verifiedAt, integrationTarget, commands[{cmd,durationMs}] }` with 2-space JSON + trailing newline, print a "commit this change" hint; export the core function with an injectable command runner and git adapter
- [x] 10.4 Add the root script `verify` (`node scripts/verify-story.mjs`)
- [x] 10.5 Unit tests `tests/unit/verify-story.test.ts` using temporary fixture files: not active, dependency not passing, dirty tree, already passing, a failing command leaves the file unchanged, success writes evidence with the SHA, and modified tracked files block passing

## 11. Quality gate & e2e

- [x] 11.1 Add `pnpm check` = `lint && typecheck && test:unit && build`; make sure it runs without `.env`, the database, or the mock
- [x] 11.2 Add a unit test for any pure helper not yet covered (e.g. config error formatter) so `test:unit` has real coverage
- [x] 11.3 Write `e2e/us-00-smoke.spec.ts`: the home page renders the app name; `GET /api/health` returns `status: "ok"`
- [x] 11.4 Run `pnpm check`, `pnpm test:int`, and `pnpm test:e2e` locally with `NUXT_INTEGRATION_TARGET=mock` until all are green

## 12. CI

- [x] 12.1 Write `.github/workflows/ci.yml`: push + PR triggers, `ubuntu-latest`, Node from `.nvmrc`, pnpm from `packageManager` with cache, a `postgres:16` service, env `CI=true`, `NUXT_INTEGRATION_TARGET=mock`, DB URLs for the service, `cp .env.example .env`, steps `./scripts/init.sh` → `pnpm check` → `pnpm test:int` → `pnpm test:e2e`; no Atlassian secrets
- [x] 12.2 Record in `docs/progress.md` that "CI green on initial commit" stays open until a GitHub remote exists

## 13. Harness documentation

- [x] 13.1 Write `AGENTS.md` (≤ 60 lines): purpose, commands table, rules (WIP=1, DoD, session start/exit checklist), links to all topic docs and `docs/user-stories/`
- [x] 13.2 Write `docs/architecture.md`: layer diagram, allowed dependencies, where the integration target is resolved, mock package role
- [x] 13.3 Write `docs/testing.md`: layers, commands, integration targets (live default for dev; mock for verify/CI), reserved `test:live`, test DB safety rule, fixture sanitization rule
- [x] 13.4 Write `docs/security.md` (secrets only in `.env`/CI secrets, never in chat/logs/fixtures, sandbox-only live testing) and `docs/conventions.md` (naming, file layout, commit format `US-XX: …`, error message style)
- [x] 13.5 Create `docs/progress.md` (first dated entry) and `docs/quality.md` (empty grade table with columns)
- [x] 13.6 Write ADRs `docs/decisions/0001-stack.md` … `0009-typescript-version.md` (stack, UI kit/grid, 5 README assumptions, integration targets, TS version)

## 14. Backlog alignment

- [x] 14.1 Update `docs/user-stories/US-00-project-setup-and-harness.md`: mock as a separate workspace package via `pnpm mock`; bootstrap AC no longer expects mocks; add a mock health AC; add integration target to scope
- [x] 14.2 Update `docs/user-stories/README.md`: rewrite DoD #3 (mock-gated verify, `test:live` for integration stories, sandbox-only, no secrets in fixtures); add `pnpm mock` to the standard commands table
- [x] 14.3 Update the US-00 `verification` array in `feature-list.json` to: `pnpm check`, `./scripts/init.sh`, `./scripts/init.sh`, `pnpm test:int tests/integration/health.test.ts tests/integration/config-fail-fast.test.ts tests/integration/mock-services.test.ts`, `pnpm test:e2e e2e/us-00-smoke.spec.ts`

## 15. Finish

- [x] 15.1 Check `AGENTS.md` ≤ 60 lines and that every topic doc link resolves
- [x] 15.2 Run the session exit checklist (no stray logs or temp files, progress entry written)
- [x] 15.3 Commit `US-00: project setup and harness`
- [ ] 15.4 Run `pnpm verify US-00`; on success commit `US-00: mark passing`
