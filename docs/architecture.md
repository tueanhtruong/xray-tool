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
| Direct Jira site     | user-configured validated HTTPS site | `${NUXT_MOCK_SERVICES_URL}/jira-site` for mock target |

Each URL can be overridden individually (`NUXT_ATLASSIAN_AUTH_URL`, `NUXT_ATLASSIAN_API_URL`,
`NUXT_XRAY_BASE_URL`), and an override always wins. Integration clients receive resolved URLs and
**never branch on the target**.

For Jira API-token sign-in, site URLs are validated by the pure helper in `shared/jira/site-url.ts`
against the built-in `atlassian.net` suffix and optional `NUXT_JIRA_SITE_URL_SUFFIXES`. The Jira
workspace client retains the same `fetch` interface and selects cloud-ID/Bearer OAuth or
site-origin/Basic API-token behavior using the stored connection method.

Project discovery and metadata requests use that workspace-scoped Jira client. US-05 stores the
selected Jira project key, numeric ID, Test issue type, and status options on the workspace only
after Jira metadata and the Xray root-folder probe both succeed. A project readiness service gates
repository pages and project-data APIs; workspace onboarding remains available until the project
is ready. `Folder` and `TestCase` rows carry both `workspaceId` and `jiraProjectId`; snapshots and
drafts are children of their test case. Project switching locks the workspace, rejects persisted
drafts belonging to the old project, and removes that project's folders and test cases in the same
transaction as updating the selection. Snapshot/draft rows cascade with their test case. Future
project-owned cache models must use the same workspace/project scope and join the switch cleanup
boundary; folder, test-case, and draft writes acquire the workspace lock so they serialize with
switching.

Repository pulls stage the complete remote folder tree and (for a full pull) all paged lightweight
test index records (issue identity, key, name/summary, folder) before applying changes. One
transaction under the workspace row lock rechecks the selected project, upserts changed folders and
index entries (clearing a previously loaded test type when the index pull replaces it), removes stale
remote rows, preserves stale test cases with drafts by setting
`remoteDeletedAt`, and updates `foldersPulledAt`. Index pulls do not create or refresh snapshots.
Opening a detail view fetches current Xray details on every open without persisting them. Selecting
tests for the editor fetches those details and compares them to any existing snapshot: missing
snapshots are created, unchanged snapshots are left untouched, changed snapshots refresh only when
there is no draft, and changed baselines are preserved when a draft exists. Snapshot fingerprints
are SHA-256 of JSON containing trimmed summary, sorted labels, trimmed status, and Gherkin with
CRLF/CR normalized to LF and surrounding whitespace trimmed. Folder and test-index queries are
cache-only; detail and editor-selection flows are the only repository reads that call Xray.

## UI routes and design system (US-08.1)

| Route         | Screen                                             | Access                    |
| ------------- | -------------------------------------------------- | ------------------------- |
| `/`           | Landing                                            | public                    |
| `/login`      | Login (OAuth / API token tabs)                     | public                    |
| `/settings`   | Workspace setup (Jira, Xray, project, folder pull) | signed in                 |
| `/repository` | Folder tree + test list                            | signed in + project ready |
| `/tests/:key` | Test case page                                     | signed in + project ready |

Protected pages redirect to `/login?next=<path>` (same-origin relative paths only, validated by
`shared/ui/safe-next-path.ts`) and repository routes redirect to `/settings` until a project is
ready. `next` survives the OAuth round trip in a signed, HttpOnly, 10-minute `login_next` cookie
(`server/utils/oauth-cookies.ts`); after sign-in the destination is `next`, else `/repository`.
OAuth site selection and API-token sign-in answer with JSON `{ redirectTo }`. A signed-in user
opening `/login` is redirected. `GET /api/tests/by-key/:key` resolves a cached test by key for
`/tests/:key` (fresh Xray details, nothing persisted, 404 for unknown keys). The app session is
ID-only, so UI code detects sign-in with `session.userId` (see `useWorkspaceSession`), never
`useUserSession().loggedIn`. Visual tokens (`--bg`, `--sf`, `--ink`,
`--mute`, `--line`, `--brand`, `--soft`, `--ok`, `--warn`, `--bad`, `--add`, `--del`, `--code`) live
in `app/assets/css/main.css` and feed the Nuxt UI theme; light/dark uses Nuxt UI color mode. The
design reference is `refer/template`; decisions are in [0015](decisions/0015-ui-design-system-and-routes.md).

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
