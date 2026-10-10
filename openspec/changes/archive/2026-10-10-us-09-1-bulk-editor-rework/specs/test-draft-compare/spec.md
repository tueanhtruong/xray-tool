## Purpose

Defines the Edit & Compare screen where a user edits a test's Gherkin and summary against the read-only Xray baseline, with live diff, per-hunk revert and autosaved local drafts. The screen never writes to Jira or Xray.

## ADDED Requirements

### Requirement: Open selected tests in Edit & Compare
The system SHALL provide an **Edit all (N)** action in the repository toolbar. It SHALL be disabled when N is 0. Otherwise it SHALL navigate to `/tests/edit?project=<id>` with exactly the selected tests. The selection SHALL be handed over through a client store mirrored to `sessionStorage`, not the URL. When the store is empty on load, the page SHALL redirect to the repository with a notice. The selection SHALL survive a reload in the same tab.

#### Scenario: Edit all is disabled without selection
- **WHEN** no test is selected
- **THEN** **Edit all** is disabled

#### Scenario: Open the selected tests
- **WHEN** the user selects 3 tests and activates **Edit all (3)**
- **THEN** the user is on `/tests/edit?project=<id>` and the rail lists exactly those 3 tests

#### Scenario: Redirect a new tab without selection
- **WHEN** a new tab without a stored selection opens `/tests/edit`
- **THEN** the user is redirected to the repository with a notice

#### Scenario: Restore selection after reload
- **WHEN** the user reloads `/tests/edit` in the same tab
- **THEN** the same selection is restored

### Requirement: Show baseline and editable draft side by side
The Edit & Compare screen SHALL show the read-only Xray baseline in the left pane and the editable draft in the right pane. The baseline SHALL be the snapshot the draft is based on. Details SHALL be fetched fresh on open and SHALL NOT be cached client-side.

#### Scenario: Show both panes
- **WHEN** the screen is open for a test
- **THEN** the left pane is read-only and shows the baseline
- **AND** the right pane is editable and shows the draft

#### Scenario: Read-only test blocks Gherkin editing
- **WHEN** a test is read-only
- **THEN** the draft pane is disabled with an explanatory banner
- **AND** Summary is disabled and no Gherkin draft can be created

#### Scenario: Test without Gherkin
- **WHEN** a test has no Gherkin
- **THEN** both panes show "No Gherkin for test type: <type>"
- **AND** only Summary is editable

### Requirement: Show live line diff while typing
The screen SHALL show added, changed and removed lines between baseline and draft, updated within 300 ms of typing. Both panes SHALL keep line alignment with filler lines and synchronized scrolling. Unchanged regions MAY be collapsed. The diff SHALL show line numbers on both sides and change markers in the gutter.

#### Scenario: Update diff while typing
- **WHEN** the user types in the draft pane
- **THEN** added, changed and removed lines appear in the diff within 300 ms
- **AND** filler lines keep both panes aligned

#### Scenario: Revert one change
- **WHEN** the user reverts a changed hunk
- **THEN** the draft pane shows the baseline text for that hunk
- **AND** the draft is updated

#### Scenario: Navigate between changes
- **WHEN** the user activates **Next change** or **Previous change**
- **THEN** focus moves to the next or previous changed hunk

### Requirement: Autosave drafts with visible save state
Edits SHALL be autosaved per test as local drafts through the draft endpoint with a debounce. The save state SHALL be one of `idle`, `saving`, `saved`, or `error`. A failed save SHALL keep the typed text, show `error`, and offer retry. Keystrokes typed while a save is in flight SHALL NOT be lost.

#### Scenario: Autosave an edit
- **WHEN** the user edits the Gherkin of a test
- **THEN** the draft is saved automatically and the state reports `saving` then `saved`

#### Scenario: Keep text after a failed save
- **WHEN** an autosave fails
- **THEN** the state shows `error` with a retry action
- **AND** no typed text is lost

#### Scenario: Warn only on unsaved navigation
- **WHEN** the user navigates away
- **THEN** a warning is shown only if a save is in flight or has failed

### Requirement: Keyboard access and focus
Every control on the screen SHALL be keyboard reachable. The rail SHALL move between tests with `Alt+Down` and `Alt+Up`. The diff editor SHALL NOT trap focus: `Esc` followed by `Tab` SHALL leave it. The screen SHALL meet WCAG 2.1 AA in light and dark themes.

#### Scenario: Leave the diff editor with the keyboard
- **WHEN** focus is inside the diff editor and the user presses `Esc` then `Tab`
- **THEN** focus moves to the next control outside the editor

#### Scenario: Move between tests in the rail
- **WHEN** the user presses `Alt+Down`
- **THEN** the next test in the rail becomes active
