# Testing

Three verification layers, run in this order: **static → runtime → end-to-end**.

| Layer         | Command                         | Runner                                                | Scope                                                      |
| ------------- | ------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------- |
| Static + unit | `pnpm check`                    | ESLint, `nuxt typecheck`, Vitest `unit`, `nuxt build` | No DB, no network, no `.env` needed                        |
| Unit only     | `pnpm test:unit [path]`         | Vitest project `unit` (`tests/unit/**`)               | Pure code only: no network, no DB                          |
| Integration   | `pnpm test:int [path]`          | Vitest project `integration` (`tests/integration/**`) | Built app / server code + **test DB** + integration target |
| End-to-end    | `pnpm test:e2e [spec]`          | Playwright, chromium (`e2e/**`)                       | Built app (`.output`) + test DB + integration target       |
| Live contract | `pnpm test:live` (**reserved**) | —                                                     | Real sandbox; see below                                    |

- Pass a path to run one file: `pnpm test:int tests/integration/health.test.ts`.
- Integration and e2e tests that need the server spawn the **built** app, so run `pnpm build`
  (or `pnpm check`) first. They fail with that instruction if `.output` is missing.
- Shared helpers live in `tests/support/` (env loading, test DB guard, mock and server launchers).

## Integration targets

| Target                             | Talks to                                                  | Used by                                                    |
| ---------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------- |
| `live` (default in `.env.example`) | Real Atlassian/Jira/Xray endpoints, **sandbox site only** | Day-to-day development, `test:live`                        |
| `mock`                             | `packages/mock-services` (`pnpm mock`, :4010)             | `pnpm verify`, CI, and dev when the sandbox is unavailable |

- `pnpm verify` always forces `NUXT_INTEGRATION_TARGET=mock`, and CI sets it too. Verification
  never depends on Atlassian being available or on credentials.
- With target `mock`, `pnpm test:int` (Vitest global setup) and `pnpm test:e2e` (Playwright
  `webServer`) start the mock if nothing is listening on `NUXT_MOCK_SERVICES_URL`, and stop only
  the instance they started. A mock you started with `pnpm mock` is reused and left running.
- Tests that are about the target itself (e.g. `mock-services.test.ts`) may start the mock on
  their own.

## Test database rules

- Integration and e2e tests use `NUXT_DATABASE_URL_TEST` (`xray_test`). They **never** use the
  development database.
- It is **reset before every run**: the `public` schema is dropped and recreated, then
  `prisma migrate deploy` runs (`tests/support/test-db.ts`). We don't use `prisma migrate reset`
  because Prisma blocks it for AI agents.
- The reset refuses to run, and explains why, unless the database name ends in `_test` **and**
  it is not the database in `NUXT_DATABASE_URL`.
- `./scripts/init.sh` creates `xray_test` if it is missing (`scripts/ensure-test-db.mjs`).
- Integration test files run sequentially (`fileParallelism: false`) because they share one DB.

## Live contract tests (`test:live`)

`pnpm test:live` performs read-only Xray GraphQL contract checks for folder trees, paged lightweight
test indexes, and on-demand test details
against a dedicated sandbox project. It requires `SANDBOX_XRAY_CLIENT_ID`,
`SANDBOX_XRAY_CLIENT_SECRET`, and `SANDBOX_XRAY_PROJECT_ID`; `SANDBOX_XRAY_BASE_URL` is optional.

- Run only against a **dedicated sandbox** Jira/Xray site and project (`SANDBOX_*` variables).
  Never a production site.
- Automated writes are namespaced, stay inside `SANDBOX_PROJECT_KEY`, and are cleaned up.
- Not part of `pnpm verify` or CI.
- Integration stories use them to check that the mock still behaves like the real API.

## Fixture sanitization

A live response copied into a mock fixture or test file must be sanitized first. Remove or replace:
tokens, JWTs, cookies, client secrets, emails, account IDs, cloud IDs, and real site URLs. Use
`example.atlassian.net`, `user@example.com`, and obviously fake IDs instead. Review fixtures in the
diff before committing. See [security.md](security.md).

## Story verification

`pnpm verify US-XX` runs the story's `verification` array from
[feature-list.json](user-stories/feature-list.json), in order. It requires the story to be
`active`, all dependencies `passing`, a commit, and a clean tree. On full success it records
evidence (commit SHA, time, target, per-command duration). Commit that change as `US-XX: mark passing`.
