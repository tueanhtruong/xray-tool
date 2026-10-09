## ADDED Requirements

### Requirement: Edit repository tests as private local drafts
The system SHALL let an authorized user edit the summary, labels, and status of editable Cucumber tests in the explicitly identified project's repository. The grid SHALL present effective values from that user's draft when present and otherwise from the user's immutable draft base/current prepared snapshot. Labels and status SHALL be populated from full test details rather than inferred from the lightweight index. Manual, Generic, unknown, or not-yet-hydrated tests SHALL NOT be editable. Edits SHALL be private to the user and SHALL NOT send mutation requests to Jira or Xray. A draft field SHALL represent only a change from that user's immutable base; when all draft fields equal the base, the draft SHALL be removed.

#### Scenario: Edit a Cucumber summary
- **WHEN** an authorized user changes a hydrated Cucumber test's summary in the repository grid
- **THEN** the summary is shown as changed from that user's base
- **AND** the changed value is saved as that user's draft
- **AND** no Jira or Xray mutation request is sent

#### Scenario: Load editable values from test details
- **WHEN** an authorized user views a repository page of lightweight test rows
- **THEN** full details needed for editing are loaded for the bounded displayed page
- **AND** the grid shows summary, labels, status, and editability based on those details
- **AND** the lightweight repository index remains free of labels, status, and test type

#### Scenario: Do not edit before hydration or after hydration failure
- **WHEN** a test's details are loading or failed to load
- **THEN** its editable controls remain unavailable
- **AND** the user can retry the detail load without losing other rows' drafts

#### Scenario: Lock a non-Cucumber test
- **WHEN** hydrated details identify a test as Manual or Generic
- **THEN** its editable fields are visibly locked and cannot be changed

#### Scenario: Return all fields to the immutable base
- **WHEN** a user's draft values become equal to that user's immutable base for every editable field
- **THEN** the draft is deleted
- **AND** the test no longer appears as changed for that user

### Requirement: Validate and autosave individual draft edits
The system SHALL validate summary values as non-empty and no longer than 255 characters, and SHALL reject labels containing spaces. Duplicate labels SHALL be represented once. Status values SHALL be limited to statuses available for the Test issue type in the authorized project's metadata. Valid edits SHALL be saved to the server as a user-owned draft after a debounce of no more than 500 ms. Invalid edits SHALL remain visibly marked with an actionable reason and SHALL NOT be persisted. Save failures SHALL retain the user's local edit, show an error state, and allow retry without silently replacing a newer edit with an older in-flight save.

#### Scenario: Reject a label containing spaces
- **WHEN** a user enters the label `needs review`
- **THEN** the label editor shows `Jira labels cannot contain spaces`
- **AND** that invalid value is not saved to the server

#### Scenario: Reject invalid summary and status values
- **WHEN** a summary is empty or exceeds 255 characters, or a status is not available for the Test issue type
- **THEN** the invalid cell displays its validation reason
- **AND** the invalid value is not persisted

#### Scenario: Autosave a valid edit
- **WHEN** a user pauses after entering a valid edit
- **THEN** the edit is saved to that user's server-side draft after at most 500 ms of debounce
- **AND** the interface reports saving and then saved

#### Scenario: Retry a failed draft save
- **WHEN** a valid draft save fails
- **THEN** the local edited value remains visible with an error and retry action
- **AND** retry does not overwrite a newer edit with an older in-flight value

### Requirement: Provide a virtualized, keyboard-operable editing grid
The repository SHALL retain project, folder, search, and pagination context while adding editable Summary, Labels, and Status columns, a key link, selection, folder, and a read-only Gherkin preview. The grid SHALL virtualize rendered rows and keep 1,000 indexed tests responsive without removing bounded server-side pagination. Keyboard users SHALL be able to move between editable cells with arrows, enter edit mode with Enter or F2, cancel with Escape, and move to the next cell with Tab. Changed cells and rows SHALL be distinguishable; each changed row SHALL provide Revert. A visible note SHALL explain that changes are local drafts and are not written to Xray until review and sync.

#### Scenario: Navigate and edit using only the keyboard
- **WHEN** a keyboard user moves through the grid, opens a cell with Enter or F2, edits it, and presses Tab
- **THEN** focus and editing move according to the grid keyboard contract
- **AND** Escape cancels the current uncommitted cell edit

#### Scenario: Revert a changed row
- **WHEN** a user activates Revert for a changed test row
- **THEN** that user's draft is removed and the row returns to that user's immutable base
- **AND** other users' drafts remain unchanged

#### Scenario: Preview Gherkin without editing it in the grid
- **WHEN** a user opens a row's Gherkin preview from the grid
- **THEN** the Gherkin is displayed read-only
- **AND** editing Gherkin remains available only through the later Gherkin editor capability

#### Scenario: Render a large repository smoothly
- **WHEN** the repository contains 1,000 tests
- **THEN** only the visible grid window and its overscan rows are rendered
- **AND** the user can navigate the bounded result pages without losing project or filter context

### Requirement: Edit a test on its detail page and expose draft actions
The authorized `/tests/:key` page SHALL allow editing the test's summary, labels, and status under the same validation, private-draft, no-op-removal, and read-only test rules as the repository grid. It SHALL provide Undo all to restore that user's immutable base for the test. The application header SHALL display the count of current-user drafts for the current project; the repository toolbar SHALL display the count of tests with changes and provide `Review N changes`, disabled when the count is zero and navigating to the project's review route when enabled. Draft counts SHALL exclude other users and other projects. The Gherkin preview on the detail page SHALL remain read-only in this change.

#### Scenario: Edit a test on its detail page
- **WHEN** a user edits a Cucumber test's summary, labels, or status on `/tests/:key`
- **THEN** the edit follows the same autosave, validation, and no-op rules as the grid
- **AND** the page preserves its explicit project and back-navigation context

#### Scenario: Undo all edits for one test
- **WHEN** a user activates Undo all on a test with a draft
- **THEN** that test's draft is removed and its values return to that user's immutable base
- **AND** drafts for other tests and users are unchanged

#### Scenario: Show private project draft counts
- **WHEN** the current user views an authorized project
- **THEN** the header draft chip and repository changed-test count reflect only that user's drafts in that project
- **AND** each count represents tests with a non-no-op draft, not the number of changed fields

#### Scenario: Navigate to review only when changes exist
- **WHEN** the current user has no changed tests in the project
- **THEN** `Review 0 changes` is disabled
- **WHEN** the current user has one or more changed tests and activates `Review N changes`
- **THEN** navigation targets the review route with the current project context

### Requirement: Preserve draft isolation and prohibit remote writes during editing
Every draft read, create, update, no-op deletion, revert, undo, count, and editability decision SHALL be scoped to the authenticated user and explicitly authorized project. Draft creation SHALL capture the user's immutable normalized base fields and fingerprint/revision when no draft exists. Subsequent shared snapshot changes SHALL NOT replace an existing draft's base. Editing workflows SHALL NOT issue Jira or Xray mutation requests.

#### Scenario: Keep drafts independent between users
- **WHEN** two authorized users edit the same shared Cucumber test
- **THEN** each user's grid, detail page, counts, save, undo, and revert operate only on that user's draft and base

#### Scenario: Capture and preserve an immutable draft base
- **WHEN** a user first changes a test without an existing draft
- **THEN** the draft captures the normalized base fields and remote fingerprint/revision
- **AND** later refreshes or another user's activity do not replace that base

#### Scenario: Reject a draft request outside the authorized project
- **WHEN** a user submits or reads a draft for a testcase outside the explicitly identified authorized project
- **THEN** the request is rejected without exposing or modifying that testcase or another user's draft

#### Scenario: Keep editing local
- **WHEN** a user edits, saves, reverts, or undoes draft fields
- **THEN** the mock Jira/Xray services receive zero write requests
