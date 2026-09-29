# Architecture

One Nuxt 4 app (Vue 3 + Nitro 2) at the repo root plus a separate workspace package for mocks.
Decisions behind this: [ADR 0001](decisions/0001-stack.md), [ADR 0008](decisions/0008-integration-targets.md).

## Layers

```
            ┌──────────────────────────┐
            │ app/  (UI: pages,        │  browser + SSR
            │ components, composables) │
            └────────────┬─────────────┘
                         │ HTTP only ($fetch / useFetch)
            ┌────────────▼─────────────┐
            │ server/api/  (handlers,  │  thin: parse, authorize, call a service
            │ thin)                    │
            └────────────┬─────────────┘
            ┌────────────▼─────────────┐
            │ server/services/         │  domain logic, transactions
            └──────┬─────────────┬─────┘
    ┌──────────────▼───┐   ┌─────▼────────────────────┐
    │ server/utils/    │   │ server/integrations/     │  jira/, xray/ HTTP clients
    │ prisma, config,  │   │ (get resolved base URLs) │
    │ integration-urls │   └──────────────────────────┘
    └──────┬───────────┘
    ┌──────▼──────┐        shared/  pure TS (config schema, parsers, diff, helpers)
    │ prisma/     │        usable from every layer above; imports nothing from them
    │ Postgres 16 │
    └─────────────┘

packages/mock-services   separate process (`pnpm mock`), emulates Atlassian/Jira/Xray over HTTP
```

## Allowed dependencies

| From                   | May import                                         | Must not import                                                                          |
| ---------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `app/`                 | `shared/`, Nuxt/Vue, `@nuxt/ui`                    | `server/**`, `#server`, the Prisma client                                                |
| `server/api/`          | `server/services`, `server/utils`, `shared/`       | `app/`                                                                                   |
| `server/services/`     | `server/integrations`, `server/utils`, `shared/`   | `app/`, `server/api`                                                                     |
| `server/integrations/` | `server/utils`, `shared/`                          | `app/`, `server/services`, `server/api`                                                  |
| `shared/`              | pure libraries (e.g. `zod`), other `shared/` files | `#imports`, `#app`, `nuxt*`, `#internal/*`, `nitropack*`, `h3`, `vue`, `server/`, `app/` |

- **Enforced by lint**: the `app/` and `shared/` rows are `no-restricted-imports` rules in
  `eslint.config.mjs`, and `tests/unit/architecture-guard.test.ts` tests them.
- **Enforced by types**: Nuxt gives `shared/` its own tsconfig with no auto-imports, so implicit use
  of `useRuntimeConfig` and similar fails typecheck.
- **Server-only by location**: the Prisma client is generated into `server/generated/prisma`
  (gitignored). Import it only through `usePrisma()` in `server/utils/prisma.ts`.
- Server-internal rows are conventions for now; a lint rule is added when a violation first shows up.

## Configuration

- `nuxt.config.ts` `runtimeConfig` declares every key with an empty default. Values come from
  `NUXT_*` env variables at runtime (`databaseUrl` ← `NUXT_DATABASE_URL`).
- `shared/config/schema.ts` (Zod) defines the shape. `server/plugins/00.validate-config.ts`
  validates it at server start, never at build time. On failure the server prints every bad
  variable by env name, points to `.env.example`, and exits non-zero.

## Integration targets

`NUXT_INTEGRATION_TARGET=live|mock` (default `live`). The target is resolved in exactly one
place: `resolveIntegrationUrls()` in `server/utils/integration-urls.ts`.

| Base URL             | live                             | mock                                       |
| -------------------- | -------------------------------- | ------------------------------------------ |
| Atlassian auth       | `https://auth.atlassian.com`     | `${NUXT_MOCK_SERVICES_URL}/atlassian-auth` |
| Atlassian API (Jira) | `https://api.atlassian.com`      | `${NUXT_MOCK_SERVICES_URL}/atlassian-api`  |
| Xray                 | `https://xray.cloud.getxray.app` | `${NUXT_MOCK_SERVICES_URL}/xray`           |

Each URL can be overridden individually (`NUXT_ATLASSIAN_AUTH_URL`, `NUXT_ATLASSIAN_API_URL`,
`NUXT_XRAY_BASE_URL`), and an override always wins. Integration clients receive resolved URLs and
**never branch on the target**.

## Mock services (`packages/mock-services`)

- `@xray-tool/mock-services` is an h3 1.x app run with `pnpm mock` on `MOCK_SERVICES_PORT` (default 4010).
- It is the backup dev target and the deterministic target for `pnpm verify` and CI.
- `init.sh` does not start it. `pnpm test:int` / `pnpm test:e2e` start it when the target is
  `mock` and nothing is listening, and stop only an instance they started.
- Reserved prefixes: `/atlassian-auth`, `/atlassian-api`, `/xray`. See its
  [README](../packages/mock-services/README.md).

## Health

`GET /api/health` → `200 { status: "ok", db: "ok" | "down", version }`. The DB probe is `SELECT 1`
with a 2 s timeout. The body never contains error details.
