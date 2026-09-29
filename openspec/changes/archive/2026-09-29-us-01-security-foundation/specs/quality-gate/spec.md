## ADDED Requirements

### Requirement: No console output in server code
Lint SHALL reject `console.log`, `console.info`, `console.debug`, and `console.dir` in `server/**`, so `pnpm check` fails when they appear. `console.error` and `console.warn` SHALL remain allowed for startup failure messages that are printed before the structured logger exists.

#### Scenario: console.log in server code
- **WHEN** a file under `server/` contains `console.log(...)`
- **THEN** `pnpm check` exits non-zero and lint names the offending line

#### Scenario: Startup error output allowed
- **WHEN** the configuration plugin prints its validation failure with `console.error`
- **THEN** lint reports no error
