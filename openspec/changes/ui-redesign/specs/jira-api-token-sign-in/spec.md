## ADDED Requirements

### Requirement: Offer sign-in methods as tabs on the login page
The `/login` page SHALL present a centered card with two keyboard-operable tabs: "Atlassian OAuth", selected by default, and "Email + API token". The OAuth tab SHALL offer a "Continue with Atlassian" action that navigates the full page to the OAuth start route, preserving any valid `next` path, and helper text stating that tokens are encrypted and never sent to the browser. The page SHALL show a banner for sign-in failure messages produced by the OAuth flow.

#### Scenario: Default tab
- **WHEN** a user opens `/login`
- **THEN** "Atlassian OAuth" is the selected tab

#### Scenario: Switch to API token
- **WHEN** the user selects "Email + API token"
- **THEN** the fields "Jira site URL", "Email", and "API token" are shown
- **AND** "Verify & connect" is disabled

#### Scenario: Keyboard tab navigation
- **WHEN** focus is on a tab and the user presses an arrow key
- **THEN** focus and selection move to the adjacent tab

### Requirement: Validate the API-token form before submitting
The API-token form SHALL mask the token field, disable browser autocompletion for it, and keep "Verify & connect" disabled until the site URL matches `https://<site>.atlassian.net`, the email is well formed, and a token is entered. An invalid site URL SHALL show the inline message "Use https://<your-site>.atlassian.net". The server SHALL remain the authority on site-URL acceptance. While the request is pending the form SHALL show progress, server errors SHALL appear inline, and the token field SHALL be emptied after every submit.

#### Scenario: Invalid site URL
- **WHEN** the user enters `http://acme.example.com` as the site
- **THEN** the inline message "Use https://<your-site>.atlassian.net" is shown
- **AND** "Verify & connect" stays disabled

#### Scenario: Token never lingers
- **WHEN** the user submits valid API-token credentials
- **THEN** the API token field is empty afterwards
- **AND** the token appears in no browser storage or page text

#### Scenario: Server rejects the credentials
- **WHEN** the server responds that Jira rejected the credentials
- **THEN** the message is shown inline and the token field is empty

### Requirement: Return a navigation target after API-token sign-in
A successful API-token sign-in SHALL respond with a JSON body `{ "redirectTo": "<path>" }` where the path is the validated `next` value supplied in the request if present, otherwise `/repository`, and the client SHALL navigate there. The response SHALL NOT be an HTTP redirect.

#### Scenario: Sign in from a protected-page redirect
- **WHEN** the user signs in with an API token from `/login?next=%2Frepository`
- **THEN** the response contains `redirectTo` `/repository` and the browser navigates there

#### Scenario: Unsafe next is ignored
- **WHEN** the submitted `next` is `https://evil.example/x`
- **THEN** the response contains `redirectTo` `/repository`
