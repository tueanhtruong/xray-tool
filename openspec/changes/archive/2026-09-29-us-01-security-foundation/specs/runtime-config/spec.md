## MODIFIED Requirements

### Requirement: Credentials not required before they are used
Jira and Xray credential variables, and the encryption key, SHALL be optional in this phase. The server SHALL start with all of them empty. An empty encryption key defers failure to the first attempt to encrypt or decrypt; a non-empty encryption key is validated at startup by the encryption key requirement.

#### Scenario: Start without Atlassian credentials
- **WHEN** the server starts with a valid database URL and no Atlassian or Xray credentials
- **THEN** startup succeeds

#### Scenario: Start without an encryption key
- **WHEN** the server starts with a valid database URL and `NUXT_ENCRYPTION_KEY` unset
- **THEN** startup succeeds

## ADDED Requirements

### Requirement: Encryption key validated when set
When `NUXT_ENCRYPTION_KEY` is non-empty, the server SHALL validate at start that it is valid base64 and decodes to exactly 32 bytes. On failure the process SHALL exit non-zero and print a message that names `NUXT_ENCRYPTION_KEY`, states that a 32-byte base64 key is required, and shows `openssl rand -base64 32` as the way to generate one. The message SHALL NOT contain the key value.

#### Scenario: Key too short
- **WHEN** the server starts with `NUXT_ENCRYPTION_KEY` set to a base64 value that decodes to 16 bytes
- **THEN** the process exits with a non-zero code
- **AND** stderr names `NUXT_ENCRYPTION_KEY`, mentions 32 bytes, and contains `openssl rand -base64 32`
- **AND** stderr does not contain the supplied key value

#### Scenario: Key not base64
- **WHEN** the server starts with `NUXT_ENCRYPTION_KEY` set to `not base64 !!!`
- **THEN** the process exits with a non-zero code and stderr names `NUXT_ENCRYPTION_KEY`

#### Scenario: Valid key
- **WHEN** the server starts with `NUXT_ENCRYPTION_KEY` set to 32 random bytes encoded as base64
- **THEN** startup succeeds

### Requirement: Local bootstrap provides an encryption key
Bootstrap SHALL fill an empty `NUXT_ENCRYPTION_KEY` in the developer's `.env` with a newly generated valid key, SHALL NOT overwrite a non-empty value, and SHALL NOT place any key in `.env.example` or version control.

#### Scenario: Fresh bootstrap
- **WHEN** a developer copies `.env.example` to `.env` and runs bootstrap
- **THEN** `.env` contains a valid `NUXT_ENCRYPTION_KEY`

#### Scenario: Re-run keeps the key
- **WHEN** bootstrap runs again
- **THEN** the `NUXT_ENCRYPTION_KEY` value in `.env` is unchanged
