# test-repository Specification

## Purpose

Lets an authenticated workspace owner browse the selected Jira/Xray project's Test Repository through a lightweight local index and retrieve current test details only when opening tests or preparing them for editing.

## Requirements

### Requirement: Pull the selected project's folder tree
The system SHALL retrieve the complete folder tree for a tenant-scoped Jira/Xray project associated with and authorized for the requesting workspace, including each folder's path, name, parent relationship, and remote test count. Folder enumeration SHALL use a verified Xray GraphQL contract. A folder pull SHALL be idempotent when the remote tree is unchanged, remove folders no longer present remotely, and leave the previous shared folder cache unchanged if retrieval or persistence fails. Pull coordination and refresh metadata SHALL be scoped to the shared project, so only one pull for a project is active at a time while pulls for different projects may proceed independently. A concurrent same-project start SHALL receive HTTP 409 and the message "A pull is already running". Switching the requesting user's project context SHALL NOT delete this cache or change the target of an already-started pull.

#### Scenario: Cache a nested folder tree for an authorized project
- **WHEN** an authorized workspace pulls a project containing nested folders
- **THEN** every folder is cached under that tenant/project with its path, name, parent, and remote test count
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

#### Scenario: Reject a concurrent pull for the same project
- **WHEN** a pull is active for a project and another authorized workspace starts a pull for that same project
- **THEN** the second request receives HTTP 409 with "A pull is already running"

#### Scenario: Allow independent projects to pull concurrently
- **WHEN** a pull is active for project A and an authorized workspace starts a pull for project B
- **THEN** project B's pull may proceed independently of project A

#### Scenario: Keep a pull scoped across a project-context change
- **WHEN** a user changes the project context in another tab while a pull is running
- **THEN** the running pull continues to update only the project it started for

### Requirement: Pull a lightweight project test index
The system SHALL retrieve all tests from an authorized tenant-scoped project using a verified, paginated Xray GraphQL query and cache only each remote test's stable issue identity, key, name/summary, and folder path as the shared test index. The index pull SHALL NOT retrieve or store labels, status, test type, Gherkin, remote update time, or snapshots/fingerprints. A failed index pull SHALL leave the previously committed folder and test-index cache unchanged. When a remotely deleted test has one or more user-owned drafts, the shared index SHALL retain a remotely-deleted record until no user's draft requires it; live repository queries SHALL hide that record and expose it only in each affected user's draft/review context. Project refresh SHALL NOT replace or mutate any user's immutable draft base. The system SHALL NOT write test or folder data to Jira or Xray.

#### Scenario: Pull all pages into a lightweight shared index
- **WHEN** an authorized workspace starts a full pull for a project with tests spanning multiple pages
- **THEN** all pages are retrieved and each remote test is cached under the tenant/project with its identity, key, name/summary, and folder path
- **AND** no full-detail fields or snapshots are fetched or stored by the pull
- **AND** successful completion reports the fetched test and folder counts

#### Scenario: Preserve all cache data after a page failure
- **WHEN** any remote page or local persistence step of an index pull fails
- **THEN** the previously committed folders and test index remain unchanged
- **AND** the owner receives an actionable error containing the request ID

#### Scenario: Remove a remotely deleted indexed test without drafts
- **WHEN** a successful pull no longer returns a previously cached remote test and no user has a draft for it
- **THEN** that test index entry is removed from the active project's shared remote cache

#### Scenario: Retain a remotely deleted test only for users with drafts
- **WHEN** a successful pull no longer returns a previously cached remote test and one or more users have drafts for it
- **THEN** the shared record is marked remotely deleted and remains available to those users' draft/review contexts
- **AND** users without a draft for it do not see it in their live repository list
- **AND** all users' drafts and immutable base versions remain unchanged

#### Scenario: Keep pull operations read-only remotely
- **WHEN** a folder or test pull completes or fails
- **THEN** the system has issued no mutation request to Jira or Xray

### Requirement: Report pull progress by polling
The system SHALL expose pull status and progress through an authenticated polling API scoped to the requested project and the requesting workspace's verified association. Progress SHALL include fetched and total test counts when known, the project identity, and a terminal success or failure state with user-safe result or error details. Pull state SHALL be independent for different projects and SHALL NOT be redirected by changes to another tab's project context. The browser SHALL be able to observe progress while a full pull is running.

#### Scenario: Observe an active full pull
- **WHEN** an authorized requester polls status for a project while its full pull is running
- **THEN** the response reports that project's active state and current fetched and total counts when known

#### Scenario: Observe completion
- **WHEN** a full pull finishes successfully
- **THEN** status reports completion and the final test and folder counts

#### Scenario: Observe a failed pull
- **WHEN** a full pull fails
- **THEN** status reports failure with an actionable sanitized message and request ID
- **AND** it does not expose credentials, tokens, or raw upstream response data

#### Scenario: Isolate pull status by project authorization
- **WHEN** a requester asks for status for a project not associated with their workspace
- **THEN** the API rejects the request without revealing its progress or results

#### Scenario: Isolate pull status across projects
- **WHEN** a requester asks for status for project B while only project A has a pull in progress
- **THEN** the response does not expose project A's pull state or results

### Requirement: Query cached folders and the lightweight test index
The system SHALL expose authenticated APIs for cached folders and the lightweight test index for an explicitly identified project associated with and authorized for the requesting workspace. Index queries SHALL support bounded server-side pagination, search by key or name/summary, exact-folder selection, and optional inclusion of descendant folders. Index query responses SHALL contain only the fields needed to browse the index (key, name/summary, folder location, and stable local/remote identity); they SHALL NOT include labels, status, test type, Gherkin, or snapshot data. Index query APIs SHALL NOT call Jira or Xray. Requests SHALL NOT infer their project from a mutable workspace-global selection. Unauthorized and unknown project identifiers SHALL NOT reveal whether a shared cache exists.

#### Scenario: Read the cached folders for an authorized project
- **WHEN** an authenticated requester requests folders for a project associated with their workspace
- **THEN** the API returns that project's shared folder hierarchy and project-scoped pull metadata

#### Scenario: Search and paginate the lightweight test index
- **WHEN** an authorized requester requests tests with key/name search, folder scope, and pagination for a project
- **THEN** the API returns only matching cached tests and stable page metadata from that project

#### Scenario: Keep full-detail fields out of index responses
- **WHEN** an owner requests the test index
- **THEN** each result contains key, name/summary, folder location, and stable identity only
- **AND** labels, status, test type, Gherkin, and snapshots are omitted

#### Scenario: Reject an unauthorized project cache lookup
- **WHEN** a workspace without a verified association requests folders or tests by guessing a project identifier
- **THEN** the API rejects the request without returning data or confirming shared cache existence

#### Scenario: Do not disclose another project's cache
- **WHEN** a request names a project other than its authorized project context
- **THEN** the API returns no data from any other project

### Requirement: Browse the lightweight Test Repository index
The system SHALL provide a `/repository` page for an explicitly identified, authorized tenant/project context. The page SHALL retain the current folder-tree and lightweight-list behavior: a 260 px default adjustable folder sidebar (150–500 px) on viewports at least 800 px wide, stacked layout below 800 px, navigable folder hierarchy with direct and inclusive descendant counts, an "All tests" root, visible expand/collapse chevrons, keyboard operation, safe test links, key/name search, optional descendant inclusion, bounded pagination, and folder/search state in the URL. Inclusive counts SHALL be computed independently of expansion state. The resize separator SHALL be pointer- and keyboard-operable and expose orientation/current/minimum/maximum values to assistive technology. The test list SHALL show only a selection checkbox, key, name/summary, and folder location before details are requested; its header checkbox SHALL select all visible rows, and the list SHALL scroll horizontally inside its own container on narrow screens. Test links SHALL include the authorized project context in the URL. Expanded-folder preference SHALL be scoped to the project context. The page SHALL show that project's last successful refresh time and project-scoped pull progress, loading/error/empty states, and a full-project refresh action with a confirmation naming the project and warning that it may take time. The test list SHALL remain lightweight and SHALL NOT show row-level labels, status, or draft fields before US-09. The application header SHALL provide a keyboard-accessible searchable project combobox using the existing paginated Jira project search integration, with loading, empty, error, pagination, current, and selection states. Selecting a project SHALL change only the current view's project context and preserve folder/search navigation where valid. The header SHALL provide a **Refresh folders** action that refreshes only the selected project's folder tree and project-scoped folder timestamp. A selected folder MAY expose **Refresh this folder** only when the Xray contract supports safe subtree enumeration and moved/deleted-test reconciliation; otherwise the UI SHALL NOT claim to refresh only a folder and SHALL offer the full-project refresh with accurate wording. Project-switch draft choices SHALL be isolated to the current user: when that user has drafts in the current project, the switch flow SHALL offer **Review drafts**, **Switch and keep drafts**, and **Cancel**. Review drafts SHALL navigate to that user's draft list for the current project without changing project context or syncing; switching SHALL retain drafts and bases; canceling SHALL leave context unchanged. Legacy `/repository` and `/tests/:key` URLs without explicit project context SHALL lead to an explicit authorized-project choice and SHALL NOT infer or silently select a last-used project.

#### Scenario: Browse a folder and its descendants
- **WHEN** an authorized user selects a folder and then enables inclusion of subfolders
- **THEN** the list first shows tests in the exact folder and then also includes tests in descendant folders

#### Scenario: Search indexed tests
- **WHEN** an authorized user searches by key or name/summary
- **THEN** the list shows only matching tests

#### Scenario: Show only lightweight fields in the list
- **WHEN** a user browses indexed tests before requesting their details
- **THEN** the list shows a selection checkbox, key, name/summary, and folder location only
- **AND** labels, status, test type, and draft indicators are omitted

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
- **WHEN** the owner ticks the list's header checkbox
- **THEN** every visible row is selected and the page shows the number selected

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

### Requirement: Fetch fresh safe test details and prepare editor selections
When an authorized user opens a test, the system SHALL resolve it only from the explicitly identified project associated with the requesting workspace, fetch current full test details from Xray on every open, and SHALL NOT persist the detail response as a side effect of viewing. Details SHALL include summary, labels, status, type, and Gherkin when applicable; non-Cucumber tests SHALL be identified as read-only. When a user selects a test for editor work, the system SHALL compare the fetched result with the shared current snapshot before updating it. If no snapshot exists, the system SHALL create one from the fetched remote state. If the fetched remote state is unchanged, the system SHALL leave the snapshot unchanged. If the remote state changed and the requesting user has no draft, the system SHALL update the shared snapshot to the fetched remote state. If the requesting user has a draft, the system SHALL preserve that user's immutable base and draft for conflict handling; updates to a shared current snapshot SHALL NOT change that base. Jira-provided text SHALL be rendered as text, not executable markup. An Open in Jira link SHALL use the requesting workspace's stored site URL and a stored test key, with `target="_blank"` and `rel="noopener noreferrer"`.

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
- **THEN** the response contains the fresh summary, labels, status, type, and Gherkin
- **AND** nothing is persisted

#### Scenario: Unknown key or unauthorized project
- **WHEN** a key is not cached in the requested project or the requesting workspace is not associated with it
- **THEN** the response is not found or forbidden without returning other-project data

### Requirement: Show a test on its own page
The system SHALL provide a read-only page at `/tests/<key>` in an explicit authorized project context. It SHALL show the existing details and Gherkin, safe Jira link, loading/error/not-found states, and a back link that preserves project, folder, and search context. The page SHALL NOT contain inputs or draft mutation actions.

#### Scenario: Open a test within a project context
- **WHEN** an authorized user opens a test from a project's repository
- **THEN** fresh Xray details and highlighted Gherkin are shown without edit controls
- **AND** the project context is preserved in the page URL

#### Scenario: Return to the same project repository context
- **WHEN** the user chooses Back to repository after opening a test from a project, folder, and search
- **THEN** the same authorized project, folder, and search are restored

#### Scenario: Unknown test key or project access
- **WHEN** the requested key is absent from the project's cache or the project is unauthorized
- **THEN** the page shows a not-found state without revealing another project's test

#### Scenario: Remote content rendered safely on the page
- **WHEN** the test's summary contains markup-like text
- **THEN** it is displayed literally and no script runs

### Requirement: Repair schema drift without losing existing data
The database migration and recovery process SHALL detect when applied-migration history claims a schema change is complete but the actual database is missing required columns, constraints, indexes, or tables. Any repair SHALL target the database used by the running application, preserve existing application data and encrypted credentials, and apply only reviewed forward-compatible schema changes. The repair process SHALL NOT reset or recreate a database, delete application data, or alter migration history merely to make status appear consistent. It SHALL verify schema parity and preserve representative data after repair.

#### Scenario: Applied migration is missing from the live schema
- **WHEN** migration history marks a migration successful but one or more schema objects defined by that migration are absent from the application's database
- **THEN** the discrepancy is reported despite migration status claiming the database is up to date
- **AND** a reviewed forward repair restores the missing schema objects without dropping or recreating application tables
- **AND** existing rows and encrypted credentials remain available

#### Scenario: Prevent repair against the wrong database
- **WHEN** the database inspected for repair differs from the database configured for the running application
- **THEN** the repair SHALL stop before making changes until the target is confirmed

#### Scenario: Verify a completed repair
- **WHEN** the schema-drift repair completes
- **THEN** required schema objects are present and migration history remains valid
- **AND** pre-repair application row counts and representative cache, workspace, and credential records remain intact
- **AND** the application can complete the operation that previously failed because of the missing schema object

### Requirement: Share remote project caches only across verified workspace associations
The system SHALL identify a Jira project by tenant identity and Jira project ID, using Atlassian cloud ID when available and otherwise the normalized Jira site origin. Project key, numeric project ID, and folder path alone SHALL NOT identify a global cache. A workspace SHALL be associated with a project only after Jira project metadata lookup and the Xray project access probe both succeed. Every repository read and pull SHALL authorize the requesting workspace's association. Remote folders, remote test-index rows, current snapshots, project metadata/status options, and refresh timestamps SHALL be shared by that project. Imported/local test records SHALL remain private to their creator and SHALL NOT appear in the shared remote index. Jira and Xray credentials SHALL remain workspace-owned and SHALL NOT be shared through the cache.

#### Scenario: Isolate equal project IDs across tenants
- **WHEN** two Jira tenants contain the same numeric project ID and folder path
- **THEN** their project metadata, folders, tests, and refresh state are stored and queried independently

#### Scenario: Reuse a cache after independently verified access
- **WHEN** two workspaces independently verify access to the same tenant/project
- **THEN** both authorized workspaces read the same remote folders and test index
- **AND** their Jira and Xray credentials remain separate

#### Scenario: Reject a workspace without verified association
- **WHEN** a workspace without a successful Jira metadata lookup and Xray access probe requests a project's cache
- **THEN** the request is rejected even if another workspace has populated that cache

#### Scenario: Keep imported tests private
- **WHEN** a workspace user creates or reads an imported/local test
- **THEN** it is visible only in that creator's private context and is not returned as a shared remote project test

#### Scenario: Preserve existing data during ownership migration
- **WHEN** existing workspace-scoped caches and drafts are migrated to tenant/project ownership
- **THEN** each cache is assigned to the correct tenant/project without merging distinct tenants
- **AND** existing draft owners and immutable base values are preserved

### Requirement: Keep project view context and drafts user-specific
The system SHALL make project view context request-scoped and addressable in the URL rather than persisting one mutable active project selection for all tabs. Every repository, detail, draft, and pull request SHALL identify a project and SHALL be checked against the requesting user's workspace association. Drafts SHALL be private to a user and testcase, allowing different users to draft changes to the same shared testcase independently. A draft SHALL capture an immutable base containing normalized field values and remote fingerprint/revision when first created. Project refreshes, other users' edits, and other users' syncs SHALL NOT silently replace that base. Draft operations and project-switch decisions SHALL consider only the requesting user's drafts.

#### Scenario: Keep two tabs on independent projects
- **WHEN** two tabs select project A and project B respectively
- **THEN** subsequent repository and pull requests in each tab use the project identified by that tab's URL

#### Scenario: Keep two users' drafts independent
- **WHEN** two users draft changes to the same shared testcase
- **THEN** each user reads and changes only their own draft and base
- **AND** discarding or switching projects for one user does not affect the other user's draft

#### Scenario: Keep the initial base immutable
- **WHEN** a user's draft is first created for a testcase
- **THEN** its base captures the normalized remote fields and fingerprint/revision
- **AND** later refreshes or another user's activity do not replace that base

#### Scenario: Preserve draft context on project switch
- **WHEN** a user switches away from a project containing their drafts
- **THEN** those drafts and bases remain stored and available when that user returns
- **AND** the switch does not sync or discard them

### Requirement: Refresh a folder subtree only when reconciliation is verified
The system SHALL enable folder-only refresh only after the Xray contract has been verified to enumerate the selected folder and descendants and to reconcile tests moved into or out of that subtree and tests deleted remotely without changing tests outside it. If the contract cannot safely identify the complete current subtree index, the UI SHALL omit folder-only refresh and SHALL offer full-project refresh with accurate wording. A supported subtree refresh SHALL be atomic for that project/subtree, report project and folder scoped progress, and preserve every user's drafts and immutable bases.

#### Scenario: Reconcile a verified folder subtree
- **WHEN** a verified Xray query returns the selected folder and descendant tests, including moved and deleted cases
- **THEN** the subtree is upserted and stale/moved/deleted records are reconciled without deleting tests that belong elsewhere
- **AND** all user drafts and bases remain unchanged

#### Scenario: Fall back when folder reconciliation is unsupported
- **WHEN** the Xray contract cannot safely reconcile all changes within a folder subtree
- **THEN** the interface does not claim folder-only refresh and offers the full-project refresh path

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
