# 0001 — Stack

- Status: accepted
- Date: 2026-09-29
- Story: US-00

## Context

The product brief fixes Nuxt 4.5.2 + Postgres via Prisma. The toolchain needs to be pinned so
every session and CI build the same thing.

## Decision

| Concern         | Choice                                                                                                          | Pin                                             |
| --------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Runtime         | Node 24 LTS                                                                                                     | `.nvmrc` = `24`, `engines.node` = `>=24.11 <25` |
| Package manager | pnpm 11 workspaces (`packages/*`)                                                                               | `packageManager: pnpm@11.21.0`                  |
| Framework       | Nuxt 4.5.2 (Vue 3, Nitro 2 / h3 1)                                                                              | exact                                           |
| Language        | TypeScript, `strict` + `noUncheckedIndexedAccess`                                                               | see [0009](0009-typescript-version.md)          |
| Database        | Postgres 16 in `docker-compose.yml` (`xray_dev` + `xray_test`)                                                  | `postgres:16`                                   |
| ORM             | Prisma 7.10.0 + `@prisma/adapter-pg`, `prisma.config.ts`, `prisma-client` generator → `server/generated/prisma` | exact                                           |
| Validation      | Zod 4                                                                                                           | exact                                           |
| Lint / format   | `@nuxt/eslint` (flat) + Prettier via `eslint-config-prettier`                                                   | exact                                           |
| Tests           | Vitest 5 (projects `unit` / `integration`), `@nuxt/test-utils` 4, Playwright (chromium)                         | exact                                           |
| Mocks           | `packages/mock-services`, h3 1.x                                                                                | exact                                           |

- The Nuxt app lives at the repo root; `apps/web` was rejected because it would change every
  path in the docs and stories for no benefit.
- All dependencies are pinned exactly (`pnpm add -E`).
- `prisma` is pinned to 7.10.0 on purpose: npm's `latest` tag for `prisma` points to an 8.0 RC,
  while `@prisma/client` `latest` is 7.10.0.
- pnpm 11 only runs dependency build scripts listed under `allowBuilds` in `pnpm-workspace.yaml`:
  `prisma`, `@prisma/engines` and `esbuild` are allowed; `vue-demi` and `unrs-resolver` are
  denied (not needed).
- `engineStrict: true` lives in `pnpm-workspace.yaml`, because pnpm 11 reads only auth/registry
  settings from `.npmrc`. pnpm always enforces the root project's own `engines` field.

## Consequences

- The local Node 22.18 doesn't meet Nuxt's engine range. `init.sh` fails early with `nvm install 24 && nvm use 24`.
- Upgrades are explicit, one pin at a time, and recorded here.
