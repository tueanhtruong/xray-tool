# ui-design-system Specification

## Purpose
Defines the shared visual language, application shell, and accessibility and responsive rules that every screen follows, so later features inherit one consistent, accessible look in light and dark themes.

## Requirements

### Requirement: Design tokens in light and dark themes
The system SHALL define the design tokens `--bg`, `--sf`, `--ink`, `--mute`, `--line`, `--brand`, `--soft`, `--ok`, `--warn`, `--bad`, `--add`, `--del`, and `--code` for a light and a dark theme and SHALL apply them to all application screens, including built-in UI components. The light theme SHALL use `#fafaf9` for `--bg` and `#4f46e5` for `--brand`; the dark theme SHALL use `#0c0a09` for `--bg` and `#818cf8` for `--brand`. The theme SHALL default to the operating-system preference, SHALL be switchable by the user, and SHALL persist the user's choice across reloads.

#### Scenario: Light theme tokens
- **WHEN** the theme is light
- **THEN** the page background is `#fafaf9` and the brand color is `#4f46e5`

#### Scenario: Toggle to dark theme
- **WHEN** the user toggles the theme
- **THEN** the page background is `#0c0a09` and the brand color is `#818cf8`
- **AND** the choice is still applied after a reload

#### Scenario: Follow the system preference by default
- **WHEN** a user with no stored choice opens the app and the operating system prefers dark
- **THEN** the dark theme is applied

### Requirement: Shared application shell
Every page SHALL render a sticky header containing a logo that links to `/` and a theme toggle with an accessible label. When the user is signed in, the header SHALL show the selected project's key and name and a breadcrumb to the repository, and a menu with a sign-out action. The header SHALL NOT include a screen switcher or demo controls. The header SHALL reserve a slot for a future draft-count indicator that renders nothing until drafts exist.

#### Scenario: Signed-out header
- **WHEN** a signed-out user opens any public page
- **THEN** the header shows the logo and theme toggle only

#### Scenario: Signed-in header
- **WHEN** a signed-in user opens a page in a workspace with a selected project
- **THEN** the header shows the project key and name, a Repository breadcrumb, and a sign-out action

#### Scenario: Logo navigation
- **WHEN** the user activates the logo
- **THEN** the browser navigates to `/`

### Requirement: Accessible and responsive screens
Every screen SHALL satisfy WCAG 2.1 AA in both themes: form controls are labelled, every interactive element shows a visible focus indicator, icon-only buttons have accessible names, and text contrast is at least 4.5:1. Two-column layouts SHALL stack below 800 px width, and pages SHALL NOT scroll horizontally at 375 px width except inside a data list's own scroll area. Every screen that loads data SHALL present distinct loading, empty, and error states, and error states SHALL offer a retry or recovery action.

#### Scenario: Automated accessibility scan
- **WHEN** each screen is scanned in the light theme and in the dark theme
- **THEN** no serious or critical accessibility violations are reported

#### Scenario: Narrow viewport
- **WHEN** a screen is opened at 375 px width
- **THEN** two-column layouts are stacked
- **AND** the page has no horizontal overflow outside a list's own scroll area

#### Scenario: Keyboard-visible focus
- **WHEN** the user tabs through a screen
- **THEN** each focused interactive element shows a visible focus indicator

### Requirement: Render user and remote content as text
The system SHALL render user-provided and Jira/Xray-provided content as text and SHALL NOT inject it as HTML. The lint configuration SHALL treat raw HTML rendering as an error.

#### Scenario: Markup-like content
- **WHEN** a test summary contains `<img src=x onerror=alert(1)>`
- **THEN** every screen shows it literally and no script runs
