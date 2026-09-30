## MODIFIED Requirements

### Requirement: Browse the lightweight Test Repository index
The system SHALL provide a `/repository` page with a 260 px folder sidebar and a main area, stacked below 800 px width. The sidebar SHALL show an "All tests" root and a navigable folder tree with per-folder test counts, SHALL be keyboard operable (arrow keys move, Enter selects, Left/Right collapse and expand), and SHALL contain the pull action and progress. The main area SHALL show a toolbar with key/name search, result count, and an include-subfolders toggle, and a paginated test list backed by the cached index APIs. The list SHALL show only a selection checkbox, key, name/summary, and folder location until details are requested; its header checkbox SHALL select all visible rows, and it SHALL scroll horizontally inside its own container on narrow screens. The key SHALL link to `/tests/<key>`. The page SHALL preserve folder and search in the URL so reloads and browser navigation restore the same query, and SHALL remember folder expansion per workspace. The page SHALL show last-pulled time, pull progress, a loading skeleton while data loads, an actionable error with retry when loading fails, and empty states for never-pulled, empty-folder, and no-results cases. The page SHALL NOT show labels, status, draft, or review elements.

#### Scenario: Browse a folder and its descendants
- **WHEN** the owner selects a folder and then enables inclusion of subfolders
- **THEN** the list first shows tests in the exact folder and then also includes tests in descendant folders

#### Scenario: Search indexed tests
- **WHEN** the owner searches by key or name/summary
- **THEN** the list shows only matching tests

#### Scenario: Show only lightweight fields in the list
- **WHEN** the owner browses indexed tests before requesting their details
- **THEN** the list shows a selection checkbox, key, name/summary, and folder location only
- **AND** labels, status, test type, and draft indicators are omitted

#### Scenario: Restore a deep-linked query
- **WHEN** the owner reloads or navigates back to a URL containing a folder and search query
- **THEN** the same folder and search query are restored

#### Scenario: Navigate the folder tree by keyboard
- **WHEN** the folder tree has focus and the user presses Down, Right, and Enter
- **THEN** focus moves to the next folder, the folder expands, and it is selected

#### Scenario: Select all visible rows
- **WHEN** the owner ticks the list's header checkbox
- **THEN** every visible row is selected and the page shows the number selected

#### Scenario: Remember expanded folders per workspace
- **WHEN** the owner expands folders, navigates away, and returns in the same workspace
- **THEN** the previously expanded folder state is restored without affecting other workspaces

#### Scenario: Show last pull and active progress
- **WHEN** the owner opens the repository or starts a pull
- **THEN** the page shows the last successful pull time and reflects active progress and final results
- **AND** the pull action is disabled while a pull runs

#### Scenario: Show the never-pulled state
- **WHEN** the active project has never been pulled
- **THEN** the page prompts the owner to pull from Xray

#### Scenario: Show loading and error states
- **WHEN** the test list request is slow
- **THEN** a loading skeleton is shown
- **WHEN** the test list request fails
- **THEN** an actionable error with a retry action is shown

### Requirement: Fetch fresh safe test details and prepare editor selections
When an owner opens a test on its own page, the system SHALL fetch the current full test details from Xray on every open and SHALL NOT persist the detail response as a side effect of viewing. Details SHALL include summary, labels, status, type, and Gherkin when applicable; non-Cucumber tests SHALL be identified as read-only. When an owner selects a test for the editor, the system SHALL fetch full current details for the selected test and compare the result with any existing snapshot before updating it. If no snapshot exists, the system SHALL create one from the fetched remote state. If the fetched remote state is unchanged, the system SHALL leave the snapshot unchanged. If the remote state changed and no local draft exists, the system SHALL update the snapshot to the fetched remote state. If a local draft exists and the remote state changed, the system SHALL preserve the existing snapshot baseline and draft for conflict handling. Jira-provided text SHALL be rendered as text, not executable markup. An Open in Jira link SHALL use the active workspace's stored site URL and a stored test key, with `target="_blank"` and `rel="noopener noreferrer"`. The list's selection bar SHALL show the number selected, a Clear action, and an "Open in editor" action that is enabled only when exactly one test is selected; it SHALL prepare the snapshot as above and then open that test's page, without implementing editing in this capability.

#### Scenario: Fetch current details whenever a test is opened
- **WHEN** the owner opens a test from the list
- **THEN** the system fetches current Xray details and shows summary, labels, status, type, and Gherkin when applicable without edit controls
- **AND** opening the detail view does not persist the fetched details or change a snapshot

#### Scenario: Create a snapshot when preparing a test without one
- **WHEN** the owner selects a test for the editor and no snapshot exists
- **THEN** the system fetches its current Xray details and creates a snapshot from that remote state

#### Scenario: Preserve the baseline when a draft exists and Xray changed
- **WHEN** the owner selects a test for the editor, its fetched Xray state differs from the existing snapshot, and a local draft exists
- **THEN** the existing snapshot baseline and local draft remain unchanged for conflict handling

#### Scenario: Refresh a changed snapshot when there is no draft
- **WHEN** the owner selects a test for the editor, its fetched Xray state differs from the existing snapshot, and no local draft exists
- **THEN** the snapshot is updated to the fetched remote state

#### Scenario: Avoid rewriting an unchanged snapshot
- **WHEN** the owner selects a test for the editor and its fetched Xray state matches the existing snapshot
- **THEN** the existing snapshot remains unchanged

#### Scenario: Render remote content literally
- **WHEN** a test summary or Gherkin contains markup-like text
- **THEN** that content is displayed literally and no script or markup executes

#### Scenario: Open the Jira issue safely
- **WHEN** the owner chooses Open in Jira
- **THEN** the link is constructed from the stored site URL and cached test key and opens with safe target and rel attributes

#### Scenario: Select tests for the editor
- **WHEN** the owner selects exactly one test and chooses "Open in editor"
- **THEN** the system fetches current full details, applies the snapshot comparison rules, and opens that test's page
- **AND** the system does not mutate remote Jira or Xray data

#### Scenario: Open in editor needs exactly one test
- **WHEN** zero or more than one test is selected
- **THEN** "Open in editor" is disabled

## ADDED Requirements

### Requirement: Look up a cached test by key
The system SHALL provide an authenticated API that returns the fresh Xray details of the test whose key matches the request within the active workspace's ready project, using the same detail rules as by-identifier lookup. A key that is malformed or has no cached index entry in that workspace and project SHALL produce HTTP 404. The endpoint SHALL NOT persist the detail response, SHALL NOT return tests of other workspaces or projects, and SHALL be subject to the ready-workspace guard.

#### Scenario: Known key
- **WHEN** the owner requests the details of a key present in the cached index
- **THEN** the response contains the fresh summary, labels, status, type, and Gherkin
- **AND** nothing is persisted

#### Scenario: Unknown key
- **WHEN** the owner requests a key that is not cached for the workspace's project
- **THEN** the response status is 404

#### Scenario: Key from another workspace
- **WHEN** a key exists only in another workspace's index
- **THEN** the response status is 404

### Requirement: Show a test on its own page
The system SHALL provide a read-only page at `/tests/<key>` with a details card (key, summary, status, labels as chips, type, Open in Jira link) and a "Gherkin steps" card showing syntax-highlighted read-only steps, laid out in two columns that stack below 800 px. The page SHALL offer "Back to repository" preserving the previously applied folder and search, and SHALL show loading, error with retry, and "Test not found" states; the not-found state SHALL link back to the repository. The page SHALL contain no inputs or draft actions.

#### Scenario: Open a test
- **WHEN** the owner clicks the key `ONEDS-14043` in the list
- **THEN** the browser is on `/tests/ONEDS-14043`
- **AND** fresh Xray details and highlighted Gherkin are shown without edit controls

#### Scenario: Return to the repository
- **WHEN** the owner chooses "Back to repository" after opening a test from a folder and search
- **THEN** the same folder and search are applied

#### Scenario: Unknown test key
- **WHEN** the owner opens `/tests/NOPE-1`
- **THEN** a "Test not found" state with a link back to the repository is shown

#### Scenario: Remote content rendered safely on the page
- **WHEN** the test's summary contains markup-like text
- **THEN** it is displayed literally and no script runs
