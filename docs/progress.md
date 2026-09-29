# Progress log

Newest entry first. One entry per session: done, in progress, next, open questions.

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
