# US-21 — End-to-end golden path & release readiness

| Field      | Value                                             |
| ---------- | ------------------------------------------------- |
| Milestone  | M5 Release                                        |
| Depends on | US-10, US-12, US-14, US-19, US-20                 |
| State      | tracked in [feature-list.json](feature-list.json) |

## User story

As the product owner, I want the complete user journey verified as one pipeline and the app hardened for deployment, so that "done" means a QA team can actually rely on it.

## Context

Per-story tests pass in isolation; only a full pipeline run proves the boundaries work together (Lecture 10). This story adds **no new features** — it adds cross-story verification, fixes defects it uncovers, and prepares a release.

## Scope

**In**

- Golden-path Playwright spec against the app + mock services (fresh DB):
  1. Sign in via OAuth (mock) → connect Xray → select project.
  2. Pull (folders + 50 tests).
  3. Bulk add label to 10 tests; set status on 3; edit Gherkin of 1.
  4. Import a Markdown file: 1 update + 2 new scenarios into a new folder.
  5. Mock mutates 1 edited test remotely (same field) → conflict → resolve "Keep mine".
  6. Review → sync → batch COMPLETED; mock received exactly the expected writes.
  7. Export Local → re-import → all rows "Unchanged".
  8. History shows the batch and the import.
- API-token sign-in smoke path.
- Security checks:
  - Response scanner fixture: every API response in the golden path is scanned for known secret values → none found.
  - Security headers via `nuxt-security` (CSP, HSTS, frame-ancestors, referrer-policy); CSRF protection on state-changing routes verified.
  - `pnpm audit --prod` has no high/critical advisories.
- Production readiness:
  - `Dockerfile` (multi-stage, non-root) and `docker compose -f compose.prod.yml up` serving `/api/health` ok.
  - `prisma migrate deploy` step documented; runbook `docs/operations.md` (env vars, backups, key handling, log fields).
- Optional contract suite against a real Xray sandbox: `pnpm test:contract`, skipped unless `XRAY_SANDBOX_*` env vars are set; never in default CI.
- `docs/quality.md` updated with a grade per module; lowest-grade items recorded as follow-ups.

**Out**

- New product features, billing, multi-user workspaces.

## Acceptance criteria

```gherkin
Feature: Release readiness

  Scenario: Golden path passes end to end
    When I run "pnpm test:e2e e2e/us-21-golden-path.spec.ts"
    Then every step of the journey passes on a fresh database

  Scenario: Writes match the reviewed diff
    Given the golden path completed
    Then the mock services recorded exactly the writes listed in the frozen SyncBatch

  Scenario: No secret leaks
    When the response scanner inspects all captured responses and server logs
    Then no configured secret value is found

  Scenario: Production container
    When I start the production compose stack
    Then GET /api/health returns ok and the container runs as a non-root user

  Scenario: Fresh clone to green
    Given a fresh clone
    When I run "./scripts/init.sh && pnpm check && pnpm test:int && pnpm test:e2e"
    Then everything passes
```

## Verification

1. Static: `pnpm check`, `pnpm audit --prod --audit-level high`
2. Runtime: `pnpm test:int`
3. End-to-end: `pnpm test:e2e` (full suite, including `e2e/us-21-golden-path.spec.ts`)

## Story-specific done checks

- [ ] All stories US-00 … US-20 are `passing` in feature-list.json
- [ ] `docs/quality.md` has no module graded below B, or each has a tracked follow-up
- [ ] Release tag `v0.1.0` created after verification
