# dev-bootstrap Specification

## Purpose

Lets a developer or agent turn a fresh clone into a working local environment (dependencies, database, migrations, test tooling) with one idempotent command.

## Requirements

### Requirement: One-command bootstrap
The repository SHALL provide `./scripts/init.sh`, which installs dependencies, starts the local Postgres, ensures both the development and test databases exist, generates the database client, applies all migrations to the development database, and installs the end-to-end browser. It SHALL exit with code 0 when every step succeeds.

#### Scenario: Fresh clone bootstraps
- **WHEN** a developer on a fresh clone with Docker running copies `.env.example` to `.env` and runs `./scripts/init.sh`
- **THEN** the script exits with code 0
- **AND** Postgres is running and accepting connections
- **AND** the development and test databases both exist
- **AND** all migrations are applied to the development database

### Requirement: Bootstrap is idempotent
Running `./scripts/init.sh` again after a successful run SHALL succeed without dropping, resetting, or recreating existing data.

#### Scenario: Second run preserves data
- **WHEN** `./scripts/init.sh` has already succeeded and a row exists in the development database
- **AND** the developer runs `./scripts/init.sh` again
- **THEN** the script exits with code 0
- **AND** the existing row is still present

### Requirement: Actionable prerequisite failures
`./scripts/init.sh` SHALL check its prerequisites before doing any work: the Node major version matches `.nvmrc`, pnpm is available, the Docker daemon is reachable (unless running in CI), and `.env` exists. Each failure SHALL name what is missing and the exact command to fix it, and SHALL exit with a non-zero code.

#### Scenario: Missing .env
- **WHEN** a developer runs `./scripts/init.sh` without a `.env` file
- **THEN** the script exits non-zero
- **AND** the output tells the developer to run `cp .env.example .env`

#### Scenario: Wrong Node version
- **WHEN** the active Node major version differs from `.nvmrc`
- **THEN** the script exits non-zero and names the required version and the command to switch to it

### Requirement: Mock services are not part of bootstrap
`./scripts/init.sh` SHALL NOT start the mock services. Mock services SHALL be started separately.

#### Scenario: Bootstrap leaves the mock port free
- **WHEN** `./scripts/init.sh` completes
- **THEN** no mock services process was started by it

### Requirement: Pinned toolchain
The repository SHALL pin the Node LTS major in `.nvmrc` and `engines`, the package manager version in `packageManager`, and every framework and database-client dependency to an exact version.

#### Scenario: Engine mismatch is rejected
- **WHEN** dependencies are installed with a Node version outside the `engines` range
- **THEN** installation fails with an engine error
