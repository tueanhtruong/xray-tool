## Purpose

Makes the `passing` state of a user story something only a successful run of that story's verification commands can grant, and records reproducible evidence of that run.

## ADDED Requirements

### Requirement: Verification preconditions
`pnpm verify <US-ID>` SHALL refuse to run any command, and SHALL exit non-zero with an explanation, when any of the following is true:
- the story ID is not in `docs/user-stories/feature-list.json`
- the story's state is not `active`
- any story in its `dependsOn` is not `passing`
- the repository has no commit
- the working tree has uncommitted changes

#### Scenario: Story not active
- **WHEN** a developer runs `pnpm verify US-00` while US-00 is `not_started`
- **THEN** no verification command runs
- **AND** the output says the story must be `active` first

#### Scenario: Dependency not passing
- **WHEN** a developer runs `pnpm verify US-01` while US-00 is not `passing`
- **THEN** no verification command runs
- **AND** the output lists US-00 as the blocking dependency

#### Scenario: Dirty working tree
- **WHEN** the working tree has uncommitted changes
- **THEN** no verification command runs
- **AND** the output asks the developer to commit first

### Requirement: Sequential verification against the mock target
When the preconditions hold, `pnpm verify` SHALL run the story's `verification` commands in order, with `NUXT_INTEGRATION_TARGET=mock`, streaming their output. It SHALL stop at the first failing command.

#### Scenario: A command fails
- **WHEN** US-00 is `active` and one verification command exits non-zero
- **THEN** `pnpm verify US-00` prints which command failed and its exit code
- **AND** exits non-zero
- **AND** US-00 stays `active` and `feature-list.json` is unchanged

### Requirement: Passing state with evidence
When every verification command succeeds and no tracked file was modified by them, `pnpm verify` SHALL set the story's state to `passing` and record evidence containing the verified commit SHA, an ISO-8601 timestamp, the integration target, and each command with its duration. It SHALL change no other story and SHALL keep the file's formatting.

#### Scenario: All commands pass
- **WHEN** US-00 is `active` and all its verification commands pass
- **THEN** US-00 becomes `passing`
- **AND** its evidence contains the commit SHA of `HEAD` at the time of the run

#### Scenario: Commands modified tracked files
- **WHEN** all commands pass but a tracked file changed during the run
- **THEN** the story is not set to `passing` and the output names the changed files

### Requirement: Passing is irreversible via verify
`pnpm verify` SHALL NOT change a story that is already `passing`.

#### Scenario: Re-verify a passing story
- **WHEN** a developer runs `pnpm verify` on a story that is already `passing`
- **THEN** the command exits non-zero, reports that the story is already passing, and changes nothing
