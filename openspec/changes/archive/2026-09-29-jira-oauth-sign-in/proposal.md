## Why

QA engineers need Jira access through their own Atlassian permissions without copying or managing API tokens. The app currently has no identity, workspace, session, or Jira authorization flow, blocking every connected workflow that depends on a user's Jira site.

## What Changes

- Add Atlassian OAuth 2.0 (3LO) sign-in with signed, short-lived state validation and server-side code exchange.
- Resolve the authenticated Atlassian account and accessible Jira sites; automatically use a single site or ask the user to choose when several are available. Persist a workspace and Jira connection only for the selected site.
- Store access and refresh tokens encrypted at rest; keep tokens out of browser responses and the user session.
- Add sealed cookie sessions, login/logout behavior, and page/API authentication guards.
- Add an authenticated Jira client that refreshes expiring OAuth tokens with per-workspace single-flight coordination.
- Extend the mock Atlassian services and tests to cover OAuth, Jira-site selection, token refresh, and session behavior.

## Capabilities

### New Capabilities
- `jira-oauth-sign-in`: Atlassian OAuth sign-in, site selection, token protection and refresh, and authenticated sessions.

### Modified Capabilities
- `runtime-config`: OAuth client configuration remains optional at startup, but sign-in requires valid OAuth settings and the callback URI; sealed sessions require a configured session password.
- `mock-services`: provide deterministic Atlassian OAuth and Jira identity/site endpoints for integration and end-to-end tests.

## Impact

- Prisma schema and migrations gain User, Workspace, JiraConnection, and short-lived pending OAuth grant persistence for the multi-site picker.
- Nuxt server gains OAuth routes, session/auth middleware, an Atlassian OAuth integration, and a workspace-scoped Jira client.
- Login, site-picker, and signed-in landing UI; setup instructions and an ADR for the session mechanism.
- Runtime config validation/use, mock-services routes, and unit/integration/e2e coverage.
- Add `nuxt-auth-utils` for sealed sessions and document `NUXT_SESSION_PASSWORD` alongside the Atlassian OAuth setup.
