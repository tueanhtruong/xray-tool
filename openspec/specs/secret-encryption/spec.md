# secret-encryption Specification

## Purpose

Lets the application store user-provided Jira and Xray secrets so that a database dump alone does not reveal them. Provides one audited way to encrypt and decrypt secrets with tamper detection and a format that allows future key rotation.

## Requirements

### Requirement: Authenticated encryption round-trip
The system SHALL encrypt a secret string with AES-256-GCM using the configured encryption key and a fresh random 12-byte initialization vector for every call, and SHALL decrypt it back to the exact original string. Decryption SHALL verify the authentication tag.

#### Scenario: Encrypt/decrypt round-trip
- **WHEN** the string `s3cr3t` is encrypted and the result is decrypted with the same key
- **THEN** the decrypted value is `s3cr3t`

#### Scenario: Same plaintext produces different ciphertext
- **WHEN** the string `s3cr3t` is encrypted twice with the same key
- **THEN** the two encrypted values differ

#### Scenario: Non-ASCII and empty-adjacent inputs
- **WHEN** a secret containing multi-byte Unicode characters is encrypted and decrypted
- **THEN** the decrypted value equals the original

### Requirement: Versioned stored format
An encrypted value SHALL be a single string of the form `v1:<keyId>:<iv>:<tag>:<ciphertext>`, where the last three parts are base64url. `keyId` SHALL identify the key that produced the value without revealing it. Decrypting a value whose version is unknown SHALL fail with a decryption error.

#### Scenario: Format of an encrypted value
- **WHEN** a secret is encrypted
- **THEN** the result has five colon-separated parts, the first is `v1`, and the plaintext does not appear in it

#### Scenario: Unknown version rejected
- **WHEN** a value beginning with `v9:` is decrypted
- **THEN** decryption fails with a decryption error

#### Scenario: Value from another key rejected
- **WHEN** a value encrypted with key A is decrypted while key B is configured
- **THEN** decryption fails with a decryption error stating the value was encrypted with a different key

### Requirement: Tampering is detected without leaking plaintext
Decryption SHALL fail with a decryption error when any part of the stored value has been altered, truncated, or malformed. The error message SHALL NOT contain the plaintext, the key, or any partial decrypted output.

#### Scenario: Tampered ciphertext is rejected
- **WHEN** one byte of an encrypted value is changed and the value is decrypted
- **THEN** a decryption error is raised
- **AND** the error message does not contain the original secret

#### Scenario: Malformed input
- **WHEN** a string that is not in the stored format is decrypted
- **THEN** a decryption error is raised rather than an unrelated exception

### Requirement: Optional context binding
Encryption and decryption SHALL accept an optional context string that is authenticated along with the value. Decryption with a context different from the one used at encryption time SHALL fail with a decryption error. Omitting the context in both calls SHALL behave as in the round-trip requirement.

#### Scenario: Wrong context rejected
- **WHEN** a secret is encrypted with context `a` and decrypted with context `b`
- **THEN** a decryption error is raised

#### Scenario: Matching context accepted
- **WHEN** a secret is encrypted and decrypted with the same context
- **THEN** the original secret is returned

### Requirement: Missing key fails clearly at first use
When no encryption key is configured, encrypting or decrypting SHALL fail with an error that names `NUXT_ENCRYPTION_KEY` and explains how to generate a key. The error SHALL NOT be a generic crypto exception.

#### Scenario: Encrypt without a key
- **WHEN** a secret is encrypted while `NUXT_ENCRYPTION_KEY` is unset
- **THEN** the error message contains `NUXT_ENCRYPTION_KEY` and `openssl rand -base64 32`
