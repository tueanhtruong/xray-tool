## MODIFIED Requirements

### Requirement: Browse the lightweight Test Repository index
The system SHALL provide a `/repository` page for an explicitly identified, authorized tenant/project context. The page SHALL retain the current folder-tree and list behavior: a 260 px default adjustable folder sidebar (150–500 px) on viewports at least 800 px wide, stacked layout below 800 px, navigable folder hierarchy with direct and inclusive descendant counts, an "All tests" root, visible expand/collapse chevrons, keyboard operation, safe test links, key/name search, optional descendant inclusion, bounded pagination, and folder/search state in the URL. Inclusive counts SHALL be computed independently of expansion state. The resize separator SHALL be pointer- and keyboard-operable and expose orientation/current/minimum/maximum values to assistive technology. The test list SHALL show exactly these columns in this order: selection checkbox, key, summary, folder, Gherkin preview, and draft indicator. The list SHALL NOT show labels, status, or test type. The folder column SHALL have a fixed, limited width and SHALL NOT wrap. The header checkbox SHALL select all tests matching the active search and folder filter, not only rendered rows, and SHALL show the number selected. Test links SHALL include the authorized project context in the URL. Expanded-folder preference SHALL be scoped to the project context. The page SHALL show that project's last successful refresh time and project-scoped pull progress, loading/error/empty states, and a full-project refresh action with a confirmation naming the project and warning that it may take time. The application header SHALL provide a keyboard-accessible searchable project combobox using the existing paginated Jira project search integration, with loading, empty, error, pagination, current, and selection states. Selecting a project SHALL change only the current view's project context and preserve folder/search navigation where valid. The header SHALL provide a **Refresh folders** action that refreshes only the selected project's folder tree and project-scoped folder timestamp. A selected folder MAY expose **Refresh this folder** only when the Xray contract supports safe subtree enumeration and moved/deleted-test reconciliation; otherwise the UI SHALL NOT claim to refresh only a folder and SHALL offer the full-project refresh with accurate wording. Project-switch draft choices SHALL be isolated to the current user: when that user has drafts in the current project, the switch flow SHALL offer **Review drafts**, **Switch and keep drafts**, and **Cancel**. Review drafts SHALL navigate to that user's draft list for the current project without changing project context or syncing; switching SHALL retain drafts and bases; canceling SHALL leave context unchanged. Legacy `/repository` and `/tests/:key` URLs without explicit project context SHALL lead to an explicit authorized-project choice and SHALL NOT infer or silently select a last-used project.

#### Scenario: Browse a folder and its descendants
- **WHEN** an authorized user selects a folder and then enables inclusion of subfolders
- **THEN** the list first shows tests in the exact folder and then also includes tests in descendant folders

#### Scenario: Search indexed tests
- **WHEN** an authorized user searches by key or name/summary
- **THEN** the list shows only matching tests

#### Scenario: Show only lightweight fields in the list
- **WHEN** a user views the repository list
- **THEN** the columns are selection, key, summary, folder, Gherkin preview, and draft indicator
- **AND** labels, status, and test type appear in no column

#### Scenario: Trim a long folder path and keep its leaf
- **WHEN** a folder path is longer than its column
- **THEN** the cell shows the path start-trimmed with an ellipsis and keeps the leaf segment visible
- **AND** the full path is available in a tooltip linked with `aria-describedby` on hover or keyboard focus

#### Scenario: Short folder path has no tooltip
- **WHEN** a folder path fits its column
- **THEN** no tooltip is shown

#### Scenario: Restore project and repository deep links
- **WHEN** an authorized user reloads or navigates back to a URL containing a project, folder, and search query
- **THEN** the same authorized project, folder, and search query are restored

#### Scenario: Require a project for a legacy repository URL
- **WHEN** a user opens `/repository` without explicit project context and has one or more authorized projects
- **THEN** the application asks the user to choose a project and does not silently select one

#### Scenario: Require a project for a legacy test URL
- **WHEN** a user opens `/tests/<key>` without explicit project context
- **THEN** the application asks the user to choose an authorized project before resolving the test

#### Scenario: Navigate the folder tree by keyboard
- **WHEN** the folder tree has focus and the user presses its supported navigation keys
- **THEN** focus movement, expansion, and folder selection remain keyboard-operable

#### Scenario: Select all visible rows
- **WHEN** the owner ticks the list's header checkbox while a search or folder filter matches more tests than are rendered
- **THEN** every matching test is selected, not only the rendered rows
- **AND** the page shows "N selected"

#### Scenario: Keep folder expansion state project-scoped
- **WHEN** a user expands folders in project A, switches to project B, then returns to A
- **THEN** A's expansion state is restored without being applied to B

#### Scenario: Show project-specific refresh time and progress
- **WHEN** the user opens a project or starts a refresh
- **THEN** the page shows that project's last successful refresh time and current progress
- **AND** refresh status for another project is not shown

#### Scenario: Show the never-pulled state
- **WHEN** the selected project has never been pulled
- **THEN** the page prompts the owner to pull from Xray

#### Scenario: Show loading and error states
- **WHEN** the test list request is slow
- **THEN** a loading skeleton is shown
- **WHEN** the test list request fails
- **THEN** an actionable error with a retry action is shown

#### Scenario: Show direct and inclusive folder test counts
- **WHEN** a folder contains 2 tests directly and its descendants contain 7 tests in total
- **THEN** the folder shows its direct count and the inclusive count as `2 (9)`
- **AND** the inclusive count is correct whether or not the descendant folders are expanded

#### Scenario: Avoid repeating a folder count without descendant tests
- **WHEN** a folder has no tests in its descendants
- **THEN** the folder shows its direct test count without a duplicate inclusive count

#### Scenario: Make folder expansion state visible
- **WHEN** the owner views a folder that can be expanded or collapsed
- **THEN** a chevron icon visibly distinguishes its expanded and collapsed states
- **AND** folders without children do not display a disclosure icon

#### Scenario: Resize the desktop folder sidebar within bounds
- **WHEN** the owner drags the sidebar separator toward either edge
- **THEN** the sidebar width changes but never becomes less than 150 px or greater than 500 px
- **AND** the main area remains usable without horizontal overlap

#### Scenario: Resize the folder sidebar by keyboard
- **WHEN** the owner focuses the resize separator and presses its supported arrow keys
- **THEN** the sidebar width changes within the same 150–500 px bounds
- **AND** assistive technology can read the separator's current, minimum, and maximum values

#### Scenario: Keep the stacked layout on narrow screens
- **WHEN** the repository is displayed below 800 px wide
- **THEN** the folder sidebar and main area remain stacked
- **AND** the desktop resize separator is not presented as an active control

#### Scenario: Confirm full-project refresh
- **WHEN** the user starts **Refresh all project tests**
- **THEN** a confirmation identifies the project and warns that the full index may take time
- **WHEN** the user cancels
- **THEN** no pull starts and no cache or draft changes
- **WHEN** the user confirms
- **THEN** the full project index is refreshed read-only and project-scoped progress and completion counts are shown

#### Scenario: Refresh folders without refreshing tests
- **WHEN** the user activates **Refresh folders** for the selected project
- **THEN** only that project's folder tree and folder refresh timestamp change
- **AND** testcase rows and user drafts remain unchanged

#### Scenario: Offer folder refresh only with safe reconciliation
- **WHEN** Xray supports verified folder-subtree enumeration and moved/deleted-test reconciliation
- **THEN** **Refresh this folder** refreshes that folder and descendants without affecting tests outside the subtree or changing drafts/bases
- **WHEN** Xray cannot satisfy that contract
- **THEN** the UI does not claim to refresh only that folder and instead offers the full-project refresh

#### Scenario: Switch projects while drafts exist
- **WHEN** the current user chooses another authorized project while they have drafts in the current project
- **THEN** the user is offered **Review drafts**, **Switch and keep drafts**, and **Cancel**
- **WHEN** the user chooses **Switch and keep drafts**
- **THEN** only the current view's context changes and the old project's cache, drafts, and bases remain available
- **WHEN** the user chooses **Cancel**
- **THEN** the project context remains unchanged

#### Scenario: Review drafts without switching or syncing
- **WHEN** the user chooses **Review drafts** for the current project
- **THEN** that user's draft list for the current project opens without changing project context
- **AND** no Jira/Xray write, draft discard, or implicit sync occurs

#### Scenario: Keep project context independent across tabs
- **WHEN** two tabs are open and select different authorized projects
- **THEN** subsequent repository, detail, and pull requests in each tab remain scoped to their URL project

### Requirement: Edit repository tests as private local drafts
The system SHALL let an authorized user edit the summary of editable Cucumber tests in the explicitly identified project's repository. The Gherkin definition SHALL be edited only on the Edit & Compare screen. The grid SHALL present effective values from that user's draft when present and otherwise from the user's immutable draft base/current prepared snapshot. Summary SHALL be populated from full test details rather than inferred from the lightweight index. Manual, Generic, unknown, or not-yet-hydrated tests SHALL NOT be editable. Edits SHALL be private to the user and SHALL NOT send mutation requests to Jira or Xray. A draft field SHALL represent only a change from that user's immutable base; when all draft fields equal the base, the draft SHALL be removed.

#### Scenario: Edit a Cucumber summary
- **WHEN** an authorized user changes a hydrated Cucumber test's summary in the repository grid
- **THEN** the summary is shown as changed from that user's base
- **AND** the changed value is saved as that user's draft
- **AND** no Jira or Xray mutation request is sent

#### Scenario: Load editable values from test details
- **WHEN** an authorized user views a repository page of lightweight test rows
- **THEN** full details needed for editing are loaded for the bounded displayed page
- **AND** the grid shows summary and editability based on those details
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

### Requirement: Provide a virtualized, keyboard-operable editing grid
The repository SHALL retain project, folder, search, and pagination context while providing an editable Summary column, a key link, selection, folder, a read-only Gherkin preview, and a draft indicator. The grid SHALL virtualize rendered rows and keep 1,000 indexed tests responsive without removing bounded server-side pagination. Keyboard users SHALL be able to enter edit mode on a summary with Enter or F2, cancel with Escape, and move between editable rows with Up and Down. Changed rows SHALL be distinguishable; each changed row SHALL provide Revert. A visible note SHALL explain that changes are local drafts and are not written to Xray until review and sync.

#### Scenario: Navigate and edit using only the keyboard
- **WHEN** a keyboard user moves through the grid, opens a summary with Enter or F2, edits it, and presses Down
- **THEN** focus and editing move to the next editable row according to the grid keyboard contract
- **AND** Escape cancels the current uncommitted summary edit

#### Scenario: Revert a changed row
- **WHEN** a user activates Revert for a changed test row
- **THEN** that user's draft is removed and the row returns to that user's immutable base
- **AND** other users' drafts remain unchanged

#### Scenario: Preview Gherkin without editing it in the grid
- **WHEN** a user opens a row's Gherkin preview from the grid
- **THEN** the Gherkin is displayed read-only
- **AND** editing Gherkin remains available only on the Edit & Compare screen

#### Scenario: Render a large repository smoothly
- **WHEN** the repository contains 1,000 tests
- **THEN** only the visible grid window and its overscan rows are rendered
- **AND** the user can navigate the bounded result pages without losing project or filter context

### Requirement: Edit a test on its detail page and expose draft actions
The authorized `/tests/:key` page SHALL allow editing the test's summary under the same validation, private-draft, no-op-removal, and read-only test rules as the repository grid. It SHALL provide Undo all to restore that user's immutable base for the test. The application header SHALL display the count of current-user drafts for the current project; the repository toolbar SHALL display the count of tests with changes and provide `Review N changes`, disabled when the count is zero and navigating to the project's review route when enabled. Draft counts SHALL exclude other users and other projects. The Gherkin preview on the detail page SHALL remain read-only in this change.

#### Scenario: Edit a test on its detail page
- **WHEN** a user edits a Cucumber test's summary on `/tests/:key`
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

### Requirement: Fetch fresh safe test details and prepare editor selections
When an authorized user opens a test, the system SHALL resolve it only from the explicitly identified project associated with the requesting workspace, fetch current full test details from Xray on every open, and SHALL NOT persist the detail response as a side effect of viewing. Details SHALL include summary, type, and Gherkin when applicable; labels and status are not part of test details. Non-Cucumber tests SHALL be identified as read-only. When a user selects a test for editor work, the system SHALL compare the fetched result with the shared current snapshot before updating it. If no snapshot exists, the system SHALL create one from the fetched remote state. If the fetched remote state is unchanged, the system SHALL leave the snapshot unchanged. If the remote state changed and the requesting user has no draft, the system SHALL update the shared snapshot to the fetched remote state. If the requesting user has a draft, the system SHALL preserve that user's immutable base and draft for conflict handling; updates to a shared current snapshot SHALL NOT change that base. Jira-provided text SHALL be rendered as text, not executable markup. An Open in Jira link SHALL use the requesting workspace's stored site URL and a stored test key, with `target="_blank"` and `rel="noopener noreferrer"`.

#### Scenario: Fetch current details only within the authorized project
- **WHEN** an authorized user opens a cached test with a project context
- **THEN** the system fetches its current details from Xray using that project context
- **AND** opening the detail view does not persist the detail response

#### Scenario: Create a snapshot when preparing a test without one
- **WHEN** the owner selects a test for the editor and no snapshot exists
- **THEN** the system fetches its current Xray details and creates a snapshot from that remote state

#### Scenario: Reject a test key or ID from another project
- **WHEN** a user requests a test identifier or key that is not in the explicitly identified authorized project's cache
- **THEN** the request returns not found without exposing another project's record

#### Scenario: Preserve a user's draft base when shared remote state changes
- **WHEN** a selected test's fetched remote state differs from the shared snapshot and the requesting user has a draft
- **THEN** that user's immutable base and draft remain unchanged
- **AND** another user's draft and base remain unchanged

#### Scenario: Refresh the shared snapshot when the user has no draft
- **WHEN** a selected test's fetched remote state differs from the shared snapshot and the requesting user has no draft
- **THEN** the shared snapshot may be updated without changing any other user's immutable draft base

#### Scenario: Render remote content literally
- **WHEN** a test summary or Gherkin contains markup-like text
- **THEN** that content is displayed literally and no script or markup executes

#### Scenario: Open the Jira issue safely
- **WHEN** the owner chooses Open in Jira
- **THEN** the link is constructed from the stored site URL and cached test key and opens with safe target and rel attributes

#### Scenario: Create a snapshot when preparing a test without one
- **WHEN** an authorized user selects a test for editor work and no snapshot exists
- **THEN** the system fetches its current Xray details and creates a snapshot from that remote state

#### Scenario: Refresh a changed snapshot when the user has no draft
- **WHEN** an authorized user selects a test for editor work, its fetched Xray state differs from the shared snapshot, and the user has no draft
- **THEN** the shared snapshot is updated to the fetched remote state

#### Scenario: Avoid rewriting an unchanged snapshot
- **WHEN** a user selects a test for editor work and its fetched Xray state matches the shared snapshot
- **THEN** the existing snapshot remains unchanged

#### Scenario: Open a selected test for editor work
- **WHEN** a user selects exactly one test and chooses "Open in editor"
- **THEN** the system fetches current full details, applies the snapshot comparison rules, and opens that test's page
- **AND** the system does not mutate remote Jira or Xray data

#### Scenario: Open in editor needs exactly one test
- **WHEN** zero or more than one test is selected
- **THEN** "Open in editor" is disabled

### Requirement: Look up a cached test by key
The system SHALL provide an authenticated API that returns fresh Xray details for a key in an explicitly identified project associated with and authorized for the requesting workspace. A malformed key, unknown project, unauthorized project, or key absent from that project's index SHALL NOT disclose data from another project. The endpoint SHALL NOT persist the detail response and SHALL be subject to the project-association authorization check.

#### Scenario: Known key in an authorized project
- **WHEN** an authorized user requests a key present in the specified project's cache
- **THEN** the response contains the fresh summary, type, and Gherkin
- **AND** labels and status are not returned
- **AND** nothing is persisted

#### Scenario: Unknown key or unauthorized project
- **WHEN** a key is not cached in the requested project or the requesting workspace is not associated with it
- **THEN** the response is not found or forbidden without returning other-project data

## REMOVED Requirements

### Requirement: Validate and autosave individual draft edits
**Reason**: Label and status fields are removed from the draft model (US-09.1, ADR 0016); only summary and Gherkin drafts remain.
**Migration**: Summary validation and autosave are restated in "Validate and autosave summary edits". Label and status validation is removed.

## ADDED Requirements

### Requirement: Validate and autosave summary edits
The system SHALL validate summary values as non-empty and no longer than 255 characters. Invalid summary edits SHALL remain visibly marked with an actionable reason and SHALL NOT be persisted. Valid edits SHALL be saved to the server as a user-owned draft after a debounce of no more than 500 ms. Save failures SHALL retain the user's local edit, show an error state, and allow retry without silently replacing a newer edit with an older in-flight save.

#### Scenario: Reject an invalid summary
- **WHEN** a summary is empty or exceeds 255 characters
- **THEN** the cell displays its validation reason
- **AND** the invalid value is not persisted

#### Scenario: Autosave a valid edit
- **WHEN** a user pauses after entering a valid summary edit
- **THEN** the edit is saved to that user's server-side draft after at most 500 ms of debounce
- **AND** the interface reports saving and then saved

#### Scenario: Retry a failed draft save
- **WHEN** a valid draft save fails
- **THEN** the local edited value remains visible with an error and retry action
- **AND** retry does not overwrite a newer edit with an older in-flight value
