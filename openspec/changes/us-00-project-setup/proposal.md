## Why

The repository currently holds only planning documents: no app, no tooling, no tests. Every later story (US-01 … US-21) assumes a runnable, testable, self-describing baseline and a `pnpm verify` gate that controls story state. US-00 builds that baseline as infrastructure only, with no business features, so that future sessions start from a verified state instead of working out how the project runs.

## What Changes

- Scaffold a Nuxt 4.5.2 app (Vue 3, Nitro 2, TypeScript `strict`) at the repo root. Use pnpm workspaces, pin Node 24 LTS in `.nvmrc` + `engines`, and pin `packageManager`.
- Add Nuxt UI 4 as the UI kit and TanStack Table/Virtual as the grid library, each recorded as an ADR.
- Add tooling: `@nuxt/eslint` + Prettier, `vue-tsc`, Vitest + `@nuxt/test-utils`, Playwright.
- Run Postgres 16 via `docker-compose.yml` in a single container holding dev + test databases. Pin Prisma 7.10.0 with `prisma.config.ts`, the `@prisma/adapter-pg` driver adapter, and a hand-written empty `0_init` migration.
- Validate runtime config with Zod at server start. The server fails fast with a message naming the missing variable and pointing to `.env.example`. `.env.example` lists every planned variable with placeholders only.
- Add an integration target switch (`INTEGRATION_TARGET=live|mock`). All Atlassian/Jira/Xray base URLs come from runtime config. The real Jira/Xray sandbox is the default for development; the mock is the backup and the CI default.
- Add a mock services skeleton as a separate workspace package (`packages/mock-services`, h3 1.x). It runs on its own via `pnpm mock` on a fixed port and serves only `GET /health`. It is **not** started by `init.sh`.
- Add `GET /api/health` → `{ status, db, version }`.
- Add scripts: `scripts/init.sh` (idempotent bootstrap), `pnpm check`, `pnpm test:unit`, `pnpm test:int`, `pnpm test:e2e`, `pnpm mock`, `pnpm verify <US-ID>`.
- Add `scripts/verify-story.mjs`. It runs a story's verification commands and sets `passing` + evidence only when all of them succeed. It refuses to run unless the story is `active`, every `dependsOn` story is `passing`, and the working tree is clean.
- Add an architecture guard: ESLint import restrictions (`app/**` must not import `server/**`; `shared/**` must not import Nuxt/Nitro/h3/server code), backed by Nuxt 4's separate `shared/` tsconfig.
- Add harness docs: `AGENTS.md` (≤ 60 lines, a router), `docs/architecture.md`, `docs/conventions.md`, `docs/testing.md`, `docs/security.md`, `docs/progress.md`, `docs/quality.md`, and `docs/decisions/` ADRs (stack, UI/grid, the five README assumptions, integration targets, TypeScript version).
- Add CI (GitHub Actions): `init` → `pnpm check` → `pnpm test:int` → `pnpm test:e2e`, with Postgres as a service and `INTEGRATION_TARGET=mock`.
- Update the backlog docs for the live-first decision:
  - US-00 acceptance criteria no longer expect `init.sh` to start mocks.
  - README DoD #3 is rewritten: tests must pass against mock; integration stories add a `test:live` contract check against the sandbox; `pnpm verify` gates on mock only.

## Capabilities

### New Capabilities

- `dev-bootstrap`: one-command idempotent bootstrap (`init.sh`), local Postgres with dev/test databases, Prisma migrations, pinned toolchain.
- `runtime-config`: Zod-validated runtime configuration, fail-fast startup errors, `.env.example` contract, integration target switch and base URLs.
- `health-check`: `GET /api/health` reporting app status, database reachability, and version.
- `mock-services`: separately-run workspace package emulating Atlassian/Jira/Xray, serving `GET /health` in this story.
- `quality-gate`: `pnpm check` (lint, typecheck, unit tests, build), test commands per layer, architecture import guard, CI pipeline.
- `story-verification`: `pnpm verify <US-ID>` state gate over `feature-list.json`, with preconditions, evidence, and failure reporting.
- `agent-harness`: `AGENTS.md` router and topic docs that let a fresh session learn how to run, test, see progress, and pick the next story.

### Modified Capabilities

(none — `openspec/specs/` is empty)

## Impact

- **New code**: the whole repo skeleton (`app/`, `server/`, `shared/`, `prisma/`, `packages/mock-services/`, `scripts/`, `tests/`, `e2e/`, `.github/workflows/`).
- **Docs changed**: `docs/user-stories/US-00-project-setup-and-harness.md` (acceptance criteria and scope for the mock), `docs/user-stories/README.md` (DoD #3, standard commands), `docs/user-stories/feature-list.json` (US-00 verification list).
- **Dependencies**: nuxt 4.5.2, @nuxt/ui 4.x, @tanstack/vue-table + @tanstack/vue-virtual, prisma + @prisma/client + @prisma/adapter-pg 7.10.0 (pinned exactly, because npm's `latest` tag on `prisma` points to an 8.0 RC), zod 4, vitest 5, @nuxt/test-utils 4, @playwright/test, vue-tsc 3, typescript 7 or 5.9 (decided by a spike).
- **Environment**: Node 24 LTS required (the local Node 22.18 does not meet Nuxt's `^22.19.0` engine range). Docker is required for Postgres.
- **Secrets**: none needed in US-00. Jira/Xray credentials are first needed in US-02/US-04 and live only in `.env` (gitignored) and GitHub Actions secrets.
- **External**: CI "green on initial commit" can only be confirmed after a GitHub remote is added.
