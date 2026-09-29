## Purpose

Defines the automated checks every change must pass (lint, typecheck, tests by layer, production build, architecture boundaries, CI) so that quality is judged mechanically, not by opinion.

## ADDED Requirements

### Requirement: Single static quality command
`pnpm check` SHALL run, in order, lint, typecheck, unit tests, and the production build. It SHALL exit non-zero if any of them fails. It SHALL NOT require a running database, mock, or network access to Atlassian.

#### Scenario: Green quality gate
- **WHEN** a developer runs `pnpm check` on the US-00 baseline
- **THEN** lint, typecheck, at least one unit test, and the production build all pass
- **AND** the command exits with code 0

#### Scenario: Lint failure fails the gate
- **WHEN** a source file contains a lint error
- **THEN** `pnpm check` exits non-zero and does not report success

### Requirement: Layered test commands
The repository SHALL provide `pnpm test:unit [path]` (no network, no database), `pnpm test:int [path]` (test database plus the configured integration target), and `pnpm test:e2e [spec]` (browser tests against the built app plus the configured integration target). Each SHALL accept an optional path so a single file can be run.

#### Scenario: Run one integration file
- **WHEN** a developer runs `pnpm test:int tests/integration/health.test.ts`
- **THEN** only that file's tests run

#### Scenario: End-to-end smoke
- **WHEN** a developer runs `pnpm test:e2e e2e/us-00-smoke.spec.ts`
- **THEN** the test confirms the home page renders and `/api/health` returns `status` `"ok"`

### Requirement: Integration tests never touch the development database
Integration tests SHALL run against the test database only, reset before each integration run. The reset SHALL refuse to proceed if the target database name does not end in `_test` or equals the development database.

#### Scenario: Unsafe test database URL
- **WHEN** `NUXT_DATABASE_URL_TEST` points at the development database
- **THEN** `pnpm test:int` aborts before resetting anything and explains why

### Requirement: Architecture import boundaries
Lint SHALL reject imports from the UI layer (`app/`) into server code (`server/`), and imports from pure shared libraries (`shared/`) into framework, server, or UI code. A unit test SHALL prove that both rules reject a violating import and allow a permitted one.

#### Scenario: UI imports server code
- **WHEN** a file under `app/` imports a module under `server/`
- **THEN** lint reports an error naming the forbidden import

#### Scenario: Shared imports the framework
- **WHEN** a file under `shared/` imports from `#imports`, `nuxt`, `h3`, or `vue`
- **THEN** lint reports an error

### Requirement: Continuous integration pipeline
CI SHALL run bootstrap, then `pnpm check`, then `pnpm test:int`, then `pnpm test:e2e` on every push and pull request. It SHALL provide Postgres as a service and use the mock integration target, with no Atlassian credentials.

#### Scenario: CI uses mock target
- **WHEN** the CI workflow runs
- **THEN** `NUXT_INTEGRATION_TARGET` is `mock` and no Atlassian secret is referenced
