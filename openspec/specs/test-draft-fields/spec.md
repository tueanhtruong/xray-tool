# test-draft-fields Specification

## Purpose

Defines the private draft contract for editing a test's summary and Gherkin locally. Drafts never write to Jira or Xray, and labels and status are not part of the draft model.

## Requirements

### Requirement: Draft fields are summary and Gherkin only
The system SHALL store and accept draft values for `summary` and `gherkin` only. A draft write that contains `labels` or `status` SHALL be rejected with HTTP 400 and error `unknown_field`. Responses SHALL NOT include `labels` or `status` in draft or test-detail payloads.

#### Scenario: Reject a removed field
- **WHEN** a client sends a draft containing `labels` or `status`
- **THEN** the API responds 400 with error `unknown_field`
- **AND** no draft is created or changed

#### Scenario: Accept summary and Gherkin drafts
- **WHEN** an authorized user saves a draft with `summary` and/or `gherkin`
- **THEN** the draft is stored for that user and testcase only

### Requirement: Remove a draft when it equals its base
A draft SHALL be deleted when every draft field equals the user's immutable base for that field. Setting Gherkin text back to the baseline SHALL remove the Gherkin draft. Other users' drafts SHALL NOT be affected.

#### Scenario: Restore the baseline text
- **WHEN** a user sets the Gherkin text back to its baseline
- **THEN** the draft is deleted
- **AND** the test no longer shows as changed for that user

### Requirement: Fingerprint excludes removed fields
The remote fingerprint SHALL cover summary and Gherkin only. The fingerprint version SHALL be incremented, and stored fingerprints SHALL be recomputed from baseline data in the same migration so that existing drafts are not reported stale.

#### Scenario: Existing drafts stay current after migration
- **WHEN** the migration completes on a database containing US-09 drafts
- **THEN** no remaining draft is reported stale or conflicting because of the fingerprint change

### Requirement: Migrate away label and status drafts
The forward-only migration SHALL delete drafts whose only differences from their base were labels or status. It SHALL remove both fields from remaining drafts and from the draft and baseline tables. The migration SHALL log the number of drafts deleted and the number changed.

#### Scenario: Delete label-only and status-only drafts
- **WHEN** a draft differs from its base only in labels or status
- **THEN** the draft is deleted by the migration

#### Scenario: Keep summary and Gherkin drafts
- **WHEN** a draft differs from its base in summary or Gherkin
- **THEN** the draft is kept and its labels and status are removed

#### Scenario: Log migration counts
- **WHEN** the migration runs
- **THEN** the number of drafts deleted and the number changed are logged

### Requirement: Keep draft writes local
Draft create, update, delete, and revert operations SHALL NOT send any mutation request to Jira or Xray.

#### Scenario: Save and revert without remote writes
- **WHEN** a user saves, reverts, or deletes drafts
- **THEN** the Jira and Xray mock services receive zero write requests