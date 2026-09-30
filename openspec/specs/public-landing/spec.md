# public-landing Specification

## Purpose
Introduces the product to visitors on a static public page and routes them to sign in or, when already signed in, back into their workspace.

## Requirements

### Requirement: Public landing page
The system SHALL serve a landing page at `/` without requiring a session. It SHALL show a "Jira + Xray Cloud" badge, a headline and one-line subtitle, the six workflow steps Pull, Edit drafts, Import .md, Review diff, Sync, and Export, and six feature cards. The page SHALL NOT offer a demo mode. A signed-out visitor SHALL NOT trigger any workspace API request from this page.

#### Scenario: Signed-out visitor
- **WHEN** a signed-out visitor opens `/`
- **THEN** the page shows the "Jira + Xray Cloud" badge, six feature cards, and the six workflow steps
- **AND** the primary action "Sign in with Jira" opens `/login`

#### Scenario: Signed-out visitor makes no API calls
- **WHEN** a signed-out visitor opens `/`
- **THEN** no workspace API request is made and no authentication error is logged

### Requirement: Landing call-to-action reflects session state
When a session exists, the landing page's primary action SHALL replace "Sign in with Jira" with "Open repository" (to `/repository`) for a workspace with a ready project, or "Continue setup" (to `/settings`) otherwise.

#### Scenario: Signed in with a ready project
- **WHEN** a signed-in user with a ready project opens `/`
- **THEN** the primary action is "Open repository" and opens `/repository`

#### Scenario: Signed in without a ready project
- **WHEN** a signed-in user whose workspace has no ready project opens `/`
- **THEN** the primary action is "Continue setup" and opens `/settings`
