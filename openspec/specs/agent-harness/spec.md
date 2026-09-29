# agent-harness Specification

## Purpose

Makes the repository describe itself, so any new human or agent session can learn from the repo alone how to run the app, how to test it, where progress lives, and which story comes next.

## Requirements

### Requirement: Short router entry file
The repository SHALL have `AGENTS.md` at its root, at most 60 lines. It SHALL state the project purpose, the standard commands, the working rules (WIP = 1, the Definition of Done, the session exit checklist), and link to every topic document.

#### Scenario: Entry file stays short
- **WHEN** `AGENTS.md` is measured
- **THEN** it has at most 60 lines

#### Scenario: Every topic doc is linked
- **WHEN** `AGENTS.md` is inspected
- **THEN** it links to `docs/architecture.md`, `docs/conventions.md`, `docs/testing.md`, `docs/security.md`, `docs/progress.md`, `docs/quality.md`, `docs/decisions/`, and `docs/user-stories/`

### Requirement: Fresh session can orient
Starting from `AGENTS.md` alone, a new session SHALL be able to find out how to run the app, how to run each test layer, where session progress is logged, and how to choose the next story.

#### Scenario: Orientation questions answered
- **WHEN** a new session has read only `AGENTS.md`
- **THEN** it can name the bootstrap command, the dev command, the check and test commands, the progress log location, and the rule for picking the next story

### Requirement: Topic documents
The repository SHALL contain these documents:
- `docs/architecture.md`, describing the layers (`app/`, `server/api`, `server/services`, `server/integrations/{jira,xray}`, `shared/`, `prisma/`, `packages/mock-services`) and their allowed dependencies
- `docs/conventions.md`
- `docs/testing.md`, describing the test layers, integration targets, the reserved `test:live` layer, and test database rules
- `docs/security.md`, describing secret handling and the sandbox-only rule for live tests
- `docs/progress.md`, a dated session log
- `docs/quality.md`, a per-module grade table

#### Scenario: Integration targets documented
- **WHEN** `docs/testing.md` is read
- **THEN** it explains the `live` and `mock` targets, that `pnpm verify` and CI use `mock`, and that live tests may only touch a sandbox site

### Requirement: Architecture decision records
The repository SHALL record one ADR in `docs/decisions/` for each of the following:
- the stack choice
- the UI kit and grid choice
- each of the five backlog assumptions
- the integration target strategy
- the TypeScript version

#### Scenario: Assumptions recorded
- **WHEN** `docs/decisions/` is listed
- **THEN** it contains an ADR for each assumption in `docs/user-stories/README.md` under "Assumptions to confirm"
