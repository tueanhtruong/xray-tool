# AGENTS.md — xray-tool (bdd-xray-testcases)

Nuxt 4 app for bulk-editing Jira/Xray Cloud BDD test cases: pull, edit many at once,
Markdown import/export, review a field-level diff, then sync. Product brief:
[docs/xray-tool-description.md](docs/xray-tool-description.md). This file is a router; details live in `docs/`.

## Commands

| Command                                          | Purpose                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| `cp .env.example .env && ./scripts/init.sh`      | Idempotent bootstrap (deps, Postgres, test DB, migrations, browser) |
| `pnpm dev`                                       | Dev server on http://localhost:3000 (`/api/health`)                 |
| `pnpm check`                                     | Lint → typecheck → unit tests → build (no DB/network needed)        |
| `pnpm test:unit [path]` / `pnpm test:int [path]` | Vitest unit (pure) / integration (test DB + target)                 |
| `pnpm test:e2e [spec]`                           | Playwright against the built app (run `pnpm build` first)           |
| `pnpm mock`                                      | Mock Atlassian/Jira/Xray on :4010 (never started by init)           |
| `pnpm verify US-XX`                              | Run a story's verification; the only way to set `passing`           |

Node 24 (`.nvmrc`, `nvm use`), pnpm 11, Docker. Integration target: `NUXT_INTEGRATION_TARGET=live|mock`.

## Rules

- **WIP = 1**: at most one story is `active` in [feature-list.json](docs/user-stories/feature-list.json).
- **Next story**: continue the `active` one, else the lowest-ID `not_started` story whose `dependsOn` are all `passing`.
- Agents may set `not_started → active` and `active ↔ blocked`. Only `pnpm verify` sets `passing`.
- Definition of Done: [docs/user-stories/README.md](docs/user-stories/README.md#common-definition-of-done-applies-to-every-story).
- Respect layer boundaries ([architecture](docs/architecture.md)); lint enforces them.
- Never put secrets in code, logs, fixtures, or chat ([security](docs/security.md)).

## Session start

1. Read this file, then [docs/progress.md](docs/progress.md), then `feature-list.json`.
2. `./scripts/init.sh && pnpm check`. Fix the baseline before new work.
3. Pick or continue the story (rule above) and read its file in [docs/user-stories/](docs/user-stories/).

## Session exit checklist

- [ ] `pnpm check` passes; the story's e2e spec passes if it exists
- [ ] `feature-list.json` state is accurate
- [ ] Dated entry in [docs/progress.md](docs/progress.md): done, in progress, next, open questions
- [ ] No debug code, stray `console.log`, temp files, or commented-out code
- [ ] New decisions recorded in [docs/decisions/](docs/decisions/)
- [ ] Committed as `US-XX: <summary>`

## Docs

- [docs/architecture.md](docs/architecture.md): layers, allowed imports, integration targets
- [docs/conventions.md](docs/conventions.md): naming, layout, commits, error messages
- [docs/testing.md](docs/testing.md): test layers, targets, test DB rules, `test:live`
- [docs/security.md](docs/security.md): secrets and sandbox-only live testing
- [docs/progress.md](docs/progress.md): session log
- [docs/quality.md](docs/quality.md): per-module grades
- [docs/decisions/](docs/decisions/): ADRs
- [docs/user-stories/](docs/user-stories/): backlog, story files, state
