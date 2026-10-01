## MODIFIED Requirements

### Requirement: Browse the lightweight Test Repository index
The system SHALL provide a `/repository` page with a folder sidebar that is 260 px wide by default on viewports at least 800 px wide, adjustable by the owner between 150 px and 500 px, and a main area. The layout SHALL remain stacked below 800 px. The sidebar SHALL show an "All tests" root and a navigable folder tree with each folder's direct test count. When descendant folders contain additional tests, the folder SHALL also show the inclusive count of tests in itself and all descendants in parentheses. Inclusive counts SHALL be computed independently of which folders are expanded. The folder tree SHALL have a clearly visible expand/collapse indicator and SHALL be keyboard operable (arrow keys move, Enter selects, Left/Right collapse and expand). The sidebar SHALL contain the pull action and progress. Its resize separator SHALL be operable by pointer and keyboard and SHALL expose separator orientation and current, minimum, and maximum values to assistive technology. The main area SHALL show a toolbar with key/name search, result count, and an include-subfolders toggle, and a paginated test list backed by the cached index APIs. The list SHALL show only a selection checkbox, key, name/summary, and folder location until details are requested; its header checkbox SHALL select all visible rows, and it SHALL scroll horizontally inside its own container on narrow screens. The key SHALL link to `/tests/<key>`. The page SHALL preserve folder and search in the URL so reloads and browser navigation restore the same query, and SHALL remember folder expansion per workspace. The page SHALL show last-pulled time, pull progress, a loading skeleton while data loads, an actionable error with retry when loading fails, and empty states for never-pulled, empty-folder, and no-results cases. The page SHALL NOT show labels, status, draft, or review elements.

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