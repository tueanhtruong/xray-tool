## Purpose

Lets an authenticated workspace owner import the selected Jira/Xray project's Test Repository into a reliable local cache and browse that cache without modifying remote tests.

## ADDED Requirements

### Requirement: Pull the selected project's folder tree
The system SHALL retrieve the complete folder tree for the active workspace's ready Jira/Xray project, including each folder's path, name, parent relationship, and remote test count. Folder enumeration SHALL use a verified Xray GraphQL contract. A folder pull SHALL be idempotent when the remote tree is unchanged, remove folders no longer present remotely, and leave the previous folder cache unchanged if retrieval or persistence fails. Only one pull for a workspace SHALL be active at a time; a concurrent start SHALL receive HTTP 409 and the message "A pull is already running".

#### Scenario: Cache a nested folder tree
- **WHEN** the owner pulls a project containing nested folders
- **THEN** every folder is cached with its path, name, parent, and remote test count
- **AND** the result reports the number of folders pulled

#### Scenario: Reflect remote folder deletion
- **WHEN** a successful folder pull finds that a previously cached folder no longer exists remotely
- **THEN** the stale folder is removed from the local cache

#### Scenario: Preserve folder cache on failure
- **WHEN** folder enumeration or cache persistence fails
- **THEN** the previous folder cache remains unchanged
- **AND** the owner receives an actionable error containing the request ID

#### Scenario: Avoid writes for an unchanged tree
- **WHEN** the owner pulls the same folder tree again without remote changes
- **THEN** existing folder rows are not updated solely because another pull occurred

#### Scenario: Reject a concurrent pull
- **WHEN** a pull is active for the workspace and another pull is started
- **THEN** the second request receives HTTP 409 with "A pull is already running"

### Requirement: Pull a lightweight project test index
The system SHALL retrieve all tests from the selected project using a verified, paginated Xray GraphQL query and cache only each remote test's stable issue identity, key, name/summary, and folder path as the test index. The index pull SHALL NOT retrieve or store labels, status, test type, Gherkin, remote update time, or snapshots/fingerprints. Snapshots created during editor selection SHALL retain the existing SHA-256 fingerprint normalization over summary, sorted labels, status, and LF-normalized trimmed Gherkin. A failed index pull SHALL leave the previously committed folder and test-index cache unchanged. The system SHALL NOT write test or folder data to Jira or Xray.

#### Scenario: Pull all pages into a lightweight index
- **WHEN** the owner starts a full pull for a project with tests spanning multiple pages
- **THEN** all pages are retrieved and each remote test is cached with its identity, key, name/summary, and folder path
- **AND** no full-detail fields or snapshots are fetched or stored by the pull
- **AND** successful completion reports the fetched test and folder counts

#### Scenario: Preserve all cache data after a page failure
- **WHEN** any remote page or local persistence step of an index pull fails
- **THEN** the previously committed folders and test index remain unchanged
- **AND** the owner receives an actionable error containing the request ID

#### Scenario: Remove a remotely deleted indexed test
- **WHEN** a successful pull no longer returns a previously cached remote test that has no local draft
- **THEN** that test index entry is removed from the active project's remote cache

#### Scenario: Preserve a remotely deleted indexed test with a local draft
- **WHEN** a successful pull no longer returns a previously cached remote test that has a local draft
- **THEN** the test index entry, its last snapshot, and its draft remain locally available
- **AND** the test is marked as remotely deleted so the owner can distinguish it from a current remote test

#### Scenario: Keep pull operations read-only remotely
- **WHEN** a folder or test pull completes or fails
- **THEN** the system has issued no mutation request to Jira or Xray

### Requirement: Report pull progress by polling
The system SHALL expose pull status and progress through an authenticated polling API scoped to the active owned workspace and selected project. Progress SHALL include fetched and total test counts when known, and a terminal success or failure state with user-safe result or error details. The browser SHALL be able to observe progress while a full pull is running.

#### Scenario: Observe an active full pull
- **WHEN** the owner polls status while a full pull is running
- **THEN** the response reports its active state and current fetched and total counts when known

#### Scenario: Observe completion
- **WHEN** a full pull finishes successfully
- **THEN** status reports completion and the final test and folder counts

#### Scenario: Observe a failed pull
- **WHEN** a full pull fails
- **THEN** status reports failure with an actionable sanitized message and request ID
- **AND** it does not expose credentials, tokens, or raw upstream response data

#### Scenario: Isolate pull status by workspace
- **WHEN** an owner requests pull status for a workspace or project they do not own or that is not active
- **THEN** the API rejects the request without revealing its progress or results

### Requirement: Query cached folders and the lightweight test index
The system SHALL expose authenticated, project-scoped APIs for the cached folder tree and lightweight test index. Index queries SHALL support bounded server-side pagination, search by key or name/summary, exact-folder selection, and optional inclusion of descendant folders. Index query responses SHALL contain only the fields needed to browse the index (key, name/summary, folder location, and stable local/remote identity); they SHALL NOT include labels, status, test type, Gherkin, or snapshot data. Index query APIs SHALL NOT call Jira or Xray. Query APIs SHALL reject requests when the active workspace has no ready project.

#### Scenario: Read the cached folder tree
- **WHEN** an authenticated owner requests folders for a ready workspace
- **THEN** the API returns the active project's cached folder hierarchy and pull metadata

#### Scenario: Search and paginate the lightweight test index
- **WHEN** an owner requests tests with key/name search, folder scope, and pagination
- **THEN** the API returns only matching cached tests and stable page metadata

#### Scenario: Keep full-detail fields out of index responses
- **WHEN** an owner requests the test index
- **THEN** each result contains key, name/summary, folder location, and stable identity only
- **AND** labels, status, test type, Gherkin, and snapshots are omitted

#### Scenario: Reject an unready project
- **WHEN** an owner queries project repository data before a project is ready
- **THEN** the API rejects the request without calling Jira or Xray

#### Scenario: Do not disclose another workspace's cache
- **WHEN** a request attempts to query cache data outside the active owned workspace
- **THEN** the API rejects it without returning project data

### Requirement: Browse the lightweight Test Repository index
The system SHALL provide a `/repository` page with a navigable folder tree and a paginated test list backed by the cached index APIs. The list SHALL show only key, name/summary, and folder location until details are requested. The browser SHALL support key/name search, optional inclusion of descendant folders, and URL state for folder and search so reloads and browser navigation restore the same query. Folder expansion state SHALL be remembered per workspace. The page SHALL show last-pulled time, pull action and progress, and empty states for never-pulled, empty-folder, and no-results cases.

#### Scenario: Browse a folder and its descendants
- **WHEN** the owner selects a folder and then enables inclusion of subfolders
- **THEN** the list first shows tests in the exact folder and then also includes tests in descendant folders

#### Scenario: Search indexed tests
- **WHEN** the owner searches by key or name/summary
- **THEN** the list shows only matching tests

#### Scenario: Show only lightweight fields in the list
- **WHEN** the owner browses indexed tests before requesting their details
- **THEN** the list shows key, name/summary, and folder location only
- **AND** labels, status, and test type are omitted

#### Scenario: Restore a deep-linked query
- **WHEN** the owner reloads or navigates back to a URL containing a folder and search query
- **THEN** the same folder and search query are restored

#### Scenario: Remember expanded folders per workspace
- **WHEN** the owner expands folders, navigates away, and returns in the same workspace
- **THEN** the previously expanded folder state is restored without affecting other workspaces

#### Scenario: Show last pull and active progress
- **WHEN** the owner opens the repository or starts a pull
- **THEN** the page shows the last successful pull time and reflects active progress and final results

#### Scenario: Show the never-pulled state
- **WHEN** the active project has never been pulled
- **THEN** the page prompts the owner to pull from Xray

### Requirement: Fetch fresh safe test details and prepare editor selections
When an owner opens a test detail view, the system SHALL fetch the current full test details from Xray on every open and SHALL NOT persist the detail response as a side effect of viewing. Details SHALL include summary, labels, status, type, and Gherkin when applicable; non-Cucumber tests SHALL be identified as read-only. When an owner selects tests for the editor, the system SHALL fetch full current details for every selected test and compare each result with any existing snapshot before updating it. If no snapshot exists, the system SHALL create one from the fetched remote state. If the fetched remote state is unchanged, the system SHALL leave the snapshot unchanged. If the remote state changed and no local draft exists, the system SHALL update the snapshot to the fetched remote state. If a local draft exists and the remote state changed, the system SHALL preserve the existing snapshot baseline and draft for conflict handling. Jira-provided text SHALL be rendered as text, not executable markup. An Open in Jira link SHALL use the active workspace's stored site URL and a stored test key, with `target="_blank"` and `rel="noopener noreferrer"`. The list SHALL allow row selection and provide an action to open selected tests in the editor entry point without implementing editing in this capability.

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
- **WHEN** the owner selects one or more tests and chooses the editor action
- **THEN** the system fetches current full details for each selected test, applies the snapshot comparison rules, and passes the selected identities to the editor entry point
- **AND** the system does not mutate remote Jira or Xray data
