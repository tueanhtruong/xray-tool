# Conventions

## Naming

- Files and folders: `kebab-case` (`integration-urls.ts`, `verify-story.mjs`). Vue components:
  `PascalCase.vue`. Pages follow Nuxt routing (`app/pages/index.vue`).
- Nitro routes: `server/api/<name>.<method>.ts` (e.g. `health.get.ts`).
- Nitro plugins: numeric prefix for order (`00.validate-config.ts`).
- Functions and variables `camelCase`, types `PascalCase`, constants `UPPER_SNAKE_CASE`.
- Env variables: `NUXT_*` when Nuxt runtime config reads them (`NUXT_DATABASE_URL` ↔ `databaseUrl`).
  Tooling-only variables have no prefix (`MOCK_SERVICES_PORT`, `SANDBOX_*`).

## File layout

| Path                                                                 | Contents                                                              |
| -------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `app/`                                                               | UI (pages, components, composables, assets)                           |
| `server/api/`                                                        | Thin HTTP handlers                                                    |
| `server/services/`                                                   | Domain logic                                                          |
| `server/integrations/{jira,xray}/`                                   | External API clients                                                  |
| `server/utils/`                                                      | Server helpers, auto-imported (`usePrisma`, `resolveIntegrationUrls`) |
| `server/plugins/`                                                    | Nitro startup plugins                                                 |
| `shared/`                                                            | Pure TS usable anywhere (import as `#shared/...` or `~~/shared/...`)  |
| `prisma/`                                                            | `schema.prisma`, `migrations/`                                        |
| `packages/mock-services/`                                            | Mock Atlassian/Jira/Xray                                              |
| `scripts/`                                                           | `init.sh`, `verify-story.mjs`, helpers                                |
| `tests/unit/`, `tests/integration/`, `tests/live/`, `tests/support/` | Vitest layers + shared helpers                                        |
| `e2e/`                                                               | Playwright specs, named `us-XX-<topic>.spec.ts`                       |
| `docs/`                                                              | Harness docs, ADRs, user stories                                      |

Unit tests mirror the code they cover (`tests/unit/config/schema.test.ts` ↔ `shared/config/schema.ts`).

## Code style

- Prettier formats (`pnpm format`) and ESLint checks (`pnpm lint`). Don't hand-format.
- TypeScript `strict` + `noUncheckedIndexedAccess`. No `any` without a comment explaining why.
- Pin dependencies to exact versions (`pnpm add -E`). pnpm 11 needs every dependency with a build
  script to be listed under `allowBuilds` in `pnpm-workspace.yaml`.
- No `console.log` debugging left behind. Scripts, CLI output, and startup errors may print.

## Commits

- One story at a time. Commit message: `US-XX: <imperative summary>` (e.g. `US-00: project setup and harness`).
- After `pnpm verify US-XX` succeeds, commit the state change separately: `US-XX: mark passing`.
- Never commit `.env`, generated code (`server/generated/`, `.nuxt/`, `.output/`), or test reports.

## Error messages

User- and developer-facing errors must be **actionable**: say what failed and what to do next,
naming the exact variable, file, or command.

- Good: `NUXT_DATABASE_URL is required … see .env.example`
- Good: `.env is missing. Fix: cp .env.example .env`
- Bad: `Invalid config` / `Something went wrong`

Never include secrets, connection strings, or stack traces in HTTP responses. Log details
server-side, redacted (US-01).
