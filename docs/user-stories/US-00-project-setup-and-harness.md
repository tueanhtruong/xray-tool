# US-00 — Project setup & agent harness

| Field      | Value                                             |
| ---------- | ------------------------------------------------- |
| Milestone  | M0 Foundation                                     |
| Depends on | —                                                 |
| State      | tracked in [feature-list.json](feature-list.json) |

## User story

As a developer (human or agent) starting any future session, I want a runnable, testable, self-describing repository, so that every later story starts from a verified baseline instead of rediscovering how the project works.

## Context

Initialization is a separate phase (harness Lecture 06). This story produces **infrastructure only — no business features**. Its success is measured by the startup readiness checklist: _can start, can test, can see progress, can pick up the next step_.

## Scope

**In**

- Nuxt 4 app (pin exact version; target 4.5.2), Vue 3, Nitro, TypeScript `strict`, pnpm, Node LTS pinned in `.nvmrc` + `engines`.
- UI kit and grid library chosen and recorded as decisions (suggested: Nuxt UI + TanStack Table/Virtual).
- Tooling: `@nuxt/eslint` + Prettier, `vue-tsc` typecheck, Vitest + `@nuxt/test-utils`, Playwright.
- Postgres 16 via `docker-compose.yml` (dev + test databases), Prisma configured with an initial empty migration.
- Mock services skeleton as a separate workspace package (`packages/mock-services`, `@xray-tool/mock-services`): a small h3 server on a fixed port (`MOCK_SERVICES_PORT`, default 4010), started separately with `pnpm mock` (not by `init.sh`). It will emulate Atlassian auth, Jira REST and Xray GraphQL; in this story it serves only `GET /health`.
- Integration target switch `NUXT_INTEGRATION_TARGET=live|mock` (default `live`, the real Jira/Xray sandbox). All Atlassian/Jira/Xray base URLs are derived from it in one place and can be overridden individually. `pnpm verify` and CI always use `mock`.
- Runtime config validated with Zod at server start; `.env.example` lists every planned variable with placeholders only (no real secrets).
- `GET /api/health` → `{ status: "ok", db: "ok" | "down", version }`.
- Scripts: `scripts/init.sh` (idempotent bootstrap), `pnpm check`, `pnpm test:unit`, `pnpm test:int`, `pnpm test:e2e`, `pnpm verify <US-ID>`.
- `scripts/verify-story.mjs`: reads the story's `verification` array from `docs/user-stories/feature-list.json`, runs each command, and **only on full success** sets `state: "passing"` with `evidence` (commit SHA, timestamp, command summary). On failure prints which command failed and leaves state unchanged.
- Harness docs:
  - `AGENTS.md` — short entry file (≤ 60 lines): purpose, commands, rules (WIP=1, DoD, exit checklist), links to topic docs.
  - `docs/architecture.md` — layers: `app/` (UI), `server/api` (HTTP), `server/services` (domain), `server/integrations/{jira,xray}` (clients), `shared/` (pure libs), `prisma/`.
  - `docs/conventions.md`, `docs/testing.md`, `docs/security.md`.
  - `docs/decisions/0001-stack.md` … one ADR per assumption in [README](README.md#assumptions-to-confirm).
  - `docs/progress.md` — dated session log.
  - `docs/quality.md` — per-module quality grade (empty table to start).
- CI (GitHub Actions): `init` → `pnpm check` → `pnpm test:int` → `pnpm test:e2e`, Postgres as a service.
- Architecture guard: lint rule preventing `app/**` from importing `server/**` and `shared/**` from importing Nuxt/Nitro.

**Out**

- Authentication, domain Prisma models, any Jira/Xray call, any product UI beyond a placeholder home page.

## Acceptance criteria

```gherkin
Feature: Repository is ready for multi-session development

  Scenario: Fresh clone bootstraps with one command
    Given a fresh clone with Docker running and no .env file
    When I copy .env.example to .env and run "./scripts/init.sh"
    Then the script exits with code 0
    And Postgres is running with the development and test databases
    And Prisma migrations are applied
    And no mock services process was started

  Scenario: Bootstrap is idempotent
    Given "./scripts/init.sh" has already succeeded
    When I run it again
    Then it exits with code 0 without recreating data

  Scenario: Mock services run separately
    When I run "pnpm mock" and request GET http://localhost:4010/health
    Then the response is 200 with status "ok"
    And an unimplemented route returns 404

  Scenario: App starts and reports health
    Given the environment is bootstrapped
    When I run "pnpm dev" and request GET /api/health
    Then the response is 200 with status "ok" and db "ok"

  Scenario: Missing configuration fails fast with an actionable message
    Given NUXT_DATABASE_URL is unset
    When the server starts
    Then it exits with an error naming NUXT_DATABASE_URL and pointing to .env.example

  Scenario: Quality gate is green
    When I run "pnpm check"
    Then lint, typecheck, at least one unit test, and the production build all pass

  Scenario: End-to-end smoke test
    When I run "pnpm test:e2e e2e/us-00-smoke.spec.ts"
    Then the home page renders and /api/health returns ok

  Scenario: Verification gate controls story state
    Given US-00 is "active" in feature-list.json
    When I run "pnpm verify US-00" and a command fails
    Then US-00 stays "active" and the failing command is printed
    When all verification commands pass
    Then US-00 becomes "passing" with evidence containing the commit SHA

  Scenario: A fresh session can orient from the repo alone
    Given a new agent session that has only read AGENTS.md
    Then it can answer how to run, how to test, where progress lives, and what the next story is
```

## Technical notes

- Keep `AGENTS.md` a router, not an encyclopedia (Lecture 04). Detail goes into `docs/*`.
- `pnpm verify` must refuse to flip a story whose `dependsOn` are not all `passing`.
- Mock services listen on `NUXT_MOCK_SERVICES_URL` (default `http://localhost:4010`); app base URLs for Atlassian/Jira/Xray come from runtime config (`server/utils/integration-urls.ts`) so tests can point at the mocks.
- Test DB is reset per integration run (drop/recreate the `public` schema, then `prisma migrate deploy`) against `NUXT_DATABASE_URL_TEST` only, and only if its name ends in `_test`. Never the dev DB. (`prisma migrate reset` is blocked by Prisma for AI agents.)

## Verification

1. Static: `pnpm check`
2. Runtime: `./scripts/init.sh && ./scripts/init.sh` (idempotency), `pnpm test:int tests/integration/health.test.ts tests/integration/config-fail-fast.test.ts tests/integration/mock-services.test.ts`
3. End-to-end: `pnpm test:e2e e2e/us-00-smoke.spec.ts`

## Story-specific done checks

- [ ] `AGENTS.md` ≤ 60 lines and links to every topic doc
- [ ] ADRs exist for stack choice and each README assumption
- [ ] CI run is green on the initial commit
- [ ] Initial checkpoint commit: `US-00: project setup and harness`
