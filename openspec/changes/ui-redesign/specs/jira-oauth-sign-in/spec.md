## MODIFIED Requirements

### Requirement: Protect authenticated pages and APIs
Unauthenticated requests to the protected pages `/settings`, `/repository`, and `/tests/*` SHALL be redirected to `/login?next=<encoded path and query>`. Unauthenticated requests to protected API routes SHALL receive HTTP 401. The landing page `/`, `/login`, the OAuth and site-selection routes, health, and other explicitly public routes SHALL remain accessible without a session.

#### Scenario: Visit protected page while signed out
- **WHEN** an unauthenticated user requests `/repository?folder=/Autocomplete`
- **THEN** the user is redirected to `/login?next=%2Frepository%3Ffolder%3D%2FAutocomplete`

#### Scenario: Visit the landing page while signed out
- **WHEN** an unauthenticated user requests `/`
- **THEN** the landing page is served and the user is not redirected

#### Scenario: Call protected API while signed out
- **WHEN** an unauthenticated client requests a protected API route
- **THEN** the response status is 401 and contains no session or token data

## ADDED Requirements

### Requirement: Accept only safe return paths
The system SHALL accept a `next` return path only when it is a same-origin relative path: it starts with a single `/`, contains no scheme, no `//` prefix, no backslash, and no control characters, and is at most 2048 characters. Any other value SHALL be ignored, and the default destination SHALL be used instead. The path SHALL be validated again at the moment it is used for a redirect.

#### Scenario: Relative path accepted
- **WHEN** `next` is `/repository?folder=/Autocomplete`
- **THEN** it is accepted

#### Scenario: External URL refused
- **WHEN** `next` is `https://evil.example/x`, `//evil.example/x`, or `/\evil.example`
- **THEN** it is ignored and the user lands on the default destination after signing in

### Requirement: Return to the requested page after sign-in
After a successful sign-in by any method, including after site selection, the system SHALL send the user to the validated `next` path when one was supplied, and otherwise to `/repository`. A `next` value supplied to the OAuth start route SHALL survive the Atlassian round trip in a server-signed, short-lived, HttpOnly cookie and SHALL be discarded after use. A user whose workspace has no ready project who is sent to a repository page SHALL continue to be redirected to `/settings`.

#### Scenario: Land on the originally requested page
- **WHEN** a signed-out user opened a protected page, signs in with Atlassian, and the callback succeeds for one site
- **THEN** the user lands on the originally requested path

#### Scenario: Next survives site selection
- **WHEN** the user signs in with a `next` path, Atlassian returns multiple sites, and the user selects a site
- **THEN** the user lands on the originally requested path

#### Scenario: Default destination
- **WHEN** the user signs in without a `next` path
- **THEN** the user lands on `/repository`
- **AND** when the workspace has no ready project, the user then arrives at `/settings`

#### Scenario: Tampered next cookie
- **WHEN** the return-path cookie is missing or its signature is invalid
- **THEN** the default destination is used

### Requirement: Keep signed-in users off the login page
A signed-in user who opens `/login` SHALL be redirected to the validated `next` path if supplied, otherwise to `/repository`.

#### Scenario: Signed-in user opens login
- **WHEN** a signed-in user with a ready project opens `/login`
- **THEN** the user is redirected to `/repository`
