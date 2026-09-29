## Context

The repo contains only planning docs (`docs/`, `openspec/`, `refer/`) and no commits. See proposal.md for motivation. Constraints that shape the design:

- **Toolchain**: Nuxt 4.5.2 runs on Nitro 2.13 / h3 1.15 and requires Node `^22.19.0 || ^24.11.0`. The local machine has Node 22.18.0, which is too old.
- **Prisma 7**: `prisma.config.ts` replaces env auto-loading; a driver adapter is required; the `prisma-client` generator writes to an explicit output path. npm's `latest` tag on `prisma` points to `8.0.0-rc.17`, while `@prisma/client` `latest` is `7.10.0`. Both must be pinned exactly.
- **pnpm 11**: dependencies with install scripts (prisma, esbuild, etc.) must be approved explicitly, or a fresh install silently skips them.
- **Integration targets**: the user develops and tests against a real Jira/Xray sandbox by default. The mock is a backup that runs separately. `pnpm verify` and CI use the mock only.
- **Shared state file**: `docs/user-stories/feature-list.json` is the machine-readable source of truth for story state. Agents may set `not_started→active` and `active↔blocked`; only `pnpm verify` sets `passing`.

## Goals / Non-Goals

**Goals:**

- A fresh clone plus `cp .env.example .env` plus `./scripts/init.sh` gives a working app and database with no manual steps.
- Every later story can add tests to existing layers (unit / integration / e2e / live) without touching harness plumbing.
- The integration target (live vs mock) is a single config switch. App code never branches on it.
- `pnpm verify` is deterministic: it depends only on the code and local Docker, never on Atlassian availability.

**Non-Goals:**

- Any Jira/Xray call, authentication, or domain Prisma model.
- A `test:live` suite. The script name and folder convention are reserved and documented; the first live contract test arrives with US-02/US-04.
- Mock endpoints beyond `GET /health`.
- Deployment or hosting.

## Decisions

### D1. Repo layout: Nuxt app at root + `packages/*` workspace

```
xray-tool/
├─ app/                 UI (pages, components, composables)
├─ server/
│  ├─ api/              HTTP handlers (thin)
│  ├─ services/         domain logic
│  ├─ integrations/     jira/, xray/ clients (empty in US-00)
│  ├─ plugins/          env validation (Nitro plugin)
│  └─ utils/            prisma client, config accessor
├─ shared/              pure TS libs — no Nuxt/Nitro/h3/Vue imports
├─ prisma/              schema.prisma, migrations/0_init/
├─ packages/
│  └─ mock-services/    @xray-tool/mock-services (h3 1.x), `pnpm mock`
├─ scripts/             init.sh, verify-story.mjs
├─ tests/{unit,integration,live}/   e2e/
├─ docs/  AGENTS.md  docker-compose.yml  prisma.config.ts
└─ pnpm-workspace.yaml  (packages: ['packages/*'])
```

**Alternative:** `apps/web` + `packages/*`. Rejected: it would change every path in `docs/architecture.md` and in all 22 stories for no benefit, since there is only one app.

### D2. Integration target switch, resolved only in config

```
NUXT_INTEGRATION_TARGET = live | mock      (default: live, per .env.example)
                │
     resolveIntegrationUrls(config)        server/utils — the only place that branches
                │
     ┌──────────┴──────────────────────────────┐
  live                                      mock
  atlassianAuthUrl  https://auth.atlassian.com     ${MOCK}/atlassian-auth
  atlassianApiUrl   https://api.atlassian.com      ${MOCK}/atlassian-api
  xrayBaseUrl       https://xray.cloud.getxray.app ${MOCK}/xray
                                     MOCK = NUXT_MOCK_SERVICES_URL (http://localhost:4010)
```

Each URL can also be overridden individually (for example, Xray regional endpoints). Integration clients (later stories) receive resolved URLs and never read the target themselves. The target is `NUXT_`-prefixed so that Nuxt runtime config picks it up automatically.

**Alternative:** separate `.env.mock` / `.env.live` files. Rejected: it creates two files that drift apart, and it's easy to run with the wrong one.

### D3. Runtime config validation: Zod in a Nitro plugin, runtime-only

- A `shared/` Zod schema describes the config shape, so it is pure and unit-testable. A Nitro plugin validates `useRuntimeConfig()` at startup.
- On failure, it prints one block that names every invalid or missing variable (as its env name, e.g. `NUXT_DATABASE_URL`) and says "see .env.example". Then it throws, which makes the production server exit non-zero.
- Validation never runs at build time. `pnpm build` in CI and `pnpm check` must work without a database or `.env`.
- Required in US-00: `NUXT_DATABASE_URL`. Optional with defaults: the target, the mock URL, and the base URLs. Credential variables are listed in `.env.example` but not required until the stories that use them.
- **Tested** by spawning the built server (`.output/server/index.mjs`) with the variable unset and asserting the exit code and stderr. `pnpm check` builds before integration tests run in the verify order, so `.output` exists. If it doesn't, the test fails with an actionable message.

**Alternative:** validate in `nuxt.config.ts`. Rejected: it runs at build time and would break CI builds.

### D4. Database: one Postgres 16 container, two databases, Prisma 7

- `docker-compose.yml` has a `postgres:16` service with a healthcheck and a named volume. The databases are `xray_dev` and `xray_test`.
- The test database is created by `init.sh` (check `pg_database`, then `CREATE DATABASE` if missing), not by the `docker-entrypoint-initdb.d` script. Entrypoint scripts only run when the volume is first created, so existing volumes would never get the database.
- `prisma.config.ts` loads `.env` (dotenv) and uses `NUXT_DATABASE_URL`. There is no separate `DATABASE_URL`. Integration tests override it with `NUXT_DATABASE_URL_TEST`.
- The client is generated into `server/generated/prisma` (gitignored) using `@prisma/adapter-pg`, so only `server/` can import it.
- The initial migration `prisma/migrations/0_init/migration.sql` is hand-written (a comment only), because `migrate dev` refuses to create an empty migration.
- `init.sh` applies migrations with `prisma migrate deploy`: non-interactive, idempotent, and it never resets data.
- **Test DB safety**: before any reset, the test-support code refuses to run unless the target URL's database name ends in `_test` and differs from `NUXT_DATABASE_URL`.
- **Test DB reset**: drop and recreate the `public` schema of the validated test database (via `pg`), then run `prisma migrate deploy`. We do not use `prisma migrate reset --force`, because Prisma 7 refuses it when an AI agent runs it, and that would block agent-run `pnpm test:int` / `pnpm verify`. Our own `_test` guard provides the safety instead.

### D5. Health endpoint

`GET /api/health` → `200 { status: "ok", db: "ok" | "down", version }`.

- The DB probe is `SELECT 1` with a 2-second timeout. If the database is down, the response is still 200 with `db: "down"`, and no error detail or connection string is included.
- `version` is the root `package.json` version, read at build time.

**Alternative:** return 503 when the database is down. Deferred: the story defines the payload shape. A readiness endpoint can be added at deploy time.

### D6. Mock services package

- `@xray-tool/mock-services` is an h3 1.x app (same major as Nitro 2). It runs with `node --watch`, has a fixed port from `MOCK_SERVICES_PORT` (default 4010), and serves `GET /health → { status: "ok", service: "mock-services" }`.
- Route prefixes `/atlassian-auth`, `/atlassian-api` and `/xray` are reserved (documented, not implemented).
- `init.sh` does **not** start it. The root script `pnpm mock` runs it in the foreground.
- When `NUXT_INTEGRATION_TARGET=mock`, the test runners start it automatically if it isn't already listening, and stop it afterwards: Vitest integration global setup and a Playwright `webServer` entry. So `verify` and CI need no process management.

**Alternatives:** a docker-compose service, or a background process with a pidfile. Rejected per the user's decision (separate workspace process). A pidfile would also be fragile.

### D7. Test layers and scripts

| Script | Runner | Scope |
|---|---|---|
| `pnpm test:unit [path]` | Vitest project `unit` | no network, no DB |
| `pnpm test:int [path]` | Vitest project `integration` | test DB + target (mock auto-started when target=mock) |
| `pnpm test:e2e [spec]` | Playwright (chromium) | built app + target |
| `pnpm check` | — | `lint` → `typecheck` (`nuxt typecheck` / vue-tsc) → `test:unit` → `build` |
| `pnpm mock` | — | runs the mock package |
| `pnpm verify <ID>` | node | `scripts/verify-story.mjs` |

`test:live` is reserved and documented in `docs/testing.md`. It gets implemented with the first integration story.

### D8. `verify-story.mjs` state gate

```
pnpm verify US-00
  │
  ├─ load feature-list.json ── story exists?                  no → exit 2
  ├─ state == "active"?                                       no → exit 2 (says how to activate)
  ├─ every dependsOn "passing"?                               no → exit 2 (lists blockers)
  ├─ git: HEAD exists and working tree clean?                 no → exit 2 (commit first)
  ├─ for cmd in verification (sequential, env NUXT_INTEGRATION_TARGET=mock):
  │     run with inherited stdio, time it
  │     exit≠0 → print "✗ <cmd> failed (exit N)", exit 1, file untouched
  ├─ tree still clean? (commands must not modify tracked files)  no → exit 1
  └─ write state:"passing", evidence:{ commit, verifiedAt, integrationTarget:"mock",
        commands:[{ cmd, durationMs }] }  → print "commit this change"
```

- The file path and command runner can be injected (`--file`, and an exported function), so unit tests exercise the failure and success paths against temporary fixtures without running real commands.
- Evidence records the SHA that was verified. The resulting edit to `feature-list.json` is committed afterwards as a separate `US-XX: mark passing` commit.

### D9. Architecture guard

- ESLint `no-restricted-imports` overrides:
  - `app/**`: forbids `~~/server/**`, `#server/**`, `**/server/**`, and the generated Prisma client.
  - `shared/**`: forbids `#imports`, `#app`, `nuxt`, `nuxt/*`, `#internal/*`, `nitropack*`, `h3`, `vue`, and anything under `server/` or `app/`.
- Nuxt 4's separate `shared/` tsconfig, which has no auto-import types, catches implicit use in typecheck.
- A unit test runs ESLint programmatically on inline sample sources (one violating, one allowed) for both rules, so the guard itself is tested.

### D10. UI kit and grid

Nuxt UI 4 (Tailwind v4) is the UI kit. Its `UTable` is built on TanStack Table and supports virtualization through TanStack Virtual, so "Nuxt UI + TanStack" is effectively one choice. Only `@nuxt/ui` is installed in US-00. `@tanstack/vue-virtual` / `@tanstack/vue-table` are added directly in US-10 if the grid outgrows `UTable`. Recorded in ADR 0002.

### D11. TypeScript version (spike first)

TypeScript 7.0 (Go-native) is `latest`. `vue-tsc` 3.3 declares `typescript >=5.0.0`, but it depends on TypeScript's JS language-service API. First implementation task: install TS 7 and run `nuxt typecheck` on the skeleton. If it fails, pin TS 5.9.x. Either way the result goes in ADR 0009.

### D12. `init.sh` flow

```
check prerequisites ── Node major == .nvmrc, pnpm available, docker daemon up, .env exists
                       (each failure: what is missing + exact fix command; exit 1)
pnpm install --frozen-lockfile
docker compose up -d --wait postgres          (skipped when CI=true; CI uses a service container)
ensure xray_test database exists
prisma generate && prisma migrate deploy      (dev DB)
playwright install chromium                   (no-op when present)
print summary + next commands
```

Every step is safe to repeat. Nothing drops or resets data.

### D13. ADR set (`docs/decisions/`)

0001 stack · 0002 UI kit and grid · 0003 one scenario = one Xray Cucumber test · 0004 labels = scenario tags · 0005 editable fields v1 · 0006 single-user workspaces · 0007 Markdown container · 0008 integration targets (live-first, mock backup, verify on mock) · 0009 TypeScript version.

### D14. CI

GitHub Actions: `ubuntu-latest`, Node from `.nvmrc`, pnpm via `packageManager`, a `postgres:16` service, and `NUXT_INTEGRATION_TARGET=mock`.

Steps: `./scripts/init.sh` → `pnpm check` → `pnpm test:int` → `pnpm test:e2e`. No Atlassian secrets are used in this pipeline.

## Risks / Trade-offs

- **Local Node 22.18 is below Nuxt's engine range** → `.nvmrc` = 24, `engines.node` = `>=24.11 <25`, `engine-strict`, and `init.sh` fails early naming the fix (`nvm install`).
- **`pnpm add prisma` pulls an 8.0 RC** → exact pins in `package.json`, recorded in ADR 0001.
- **pnpm 11 skips unapproved build scripts** → approve prisma, @prisma/engines and esbuild explicitly in workspace config. `init.sh` would then fail loudly on `prisma generate` instead of later.
- **The mock drifts from real Atlassian behavior** → later stories add `test:live` contract checks and save sanitized live responses as mock fixtures (ADR 0008).
- **Live-first dev runs can write to the sandbox** → docs require a dedicated sandbox site/project. Automated writes are namespaced and cleaned up (enforced from US-18).
- **The fail-fast test depends on a prior build** → verify order guarantees it. The test gives an actionable failure if `.output` is missing.
- **Evidence SHA vs the follow-up commit** → by design: the evidence names the verified code commit, and the state change is committed separately.
- **CI "green on initial commit" can't be confirmed without a remote** → the workflow is written anyway. The done-check stays open in `docs/progress.md` until a remote is added.
- **TypeScript 7 incompatibility** → spike plus 5.9 fallback (D11).

## Migration Plan

Greenfield, so there is nothing to migrate.

Rollout order:
1. Mark US-00 `active`.
2. Build the skeleton.
3. Commit `US-00: project setup and harness`.
4. Run `pnpm verify US-00`.
5. Commit `US-00: mark passing`.

Rollback is `git revert`.

## Open Questions

- The Xray region endpoint (global vs `us`/`eu`) for the user's sandbox. It only affects the default for `NUXT_XRAY_BASE_URL`, which can be overridden. It can be settled in US-04.
