# ADR 0012: Jira API-token connections and site identity

## Status

Accepted

## Context

US-03 adds Atlassian email/API-token authentication beside OAuth. Existing OAuth connections use a Jira `cloudId` to address Atlassian's central API, while API-token requests go directly to a Jira site's REST API. API-token workspaces therefore must not invent a cloud ID or silently replace an OAuth connection.

## Decision

- Model both auth methods as a `JiraConnection` with method-specific credentials. OAuth-only fields are nullable for API-token rows; API tokens are encrypted with workspace- and field-bound context.
- Keep `Workspace.cloudId` nullable and preserve cloud-ID uniqueness for OAuth identity. Store normalized HTTPS `siteOrigin` for all workspaces and enforce uniqueness per owner/site origin.
- Derive API-token user identity from the account ID returned by Jira `/myself`; do not link accounts by email alone.
- Require disconnect before changing a site's auth method. OAuth sign-in must not replace an API-token connection, and API-token sign-in must not replace OAuth.
- Validate the site URL against HTTPS and DNS-suffix allow-list boundaries before outbound requests. Reject redirects for Basic-auth requests.
- Store API-token sign-in attempt counts in Postgres, keyed by a hash of the normalized client IP. Trust forwarded addresses only when the direct peer is configured as a trusted proxy.

## Consequences

- The migration adds a site origin to existing OAuth workspaces, adds API-token credential columns and an enum value, and makes OAuth-only columns nullable without rewriting existing OAuth credentials.
- Every auth-specific persistence and Jira-client path must validate its credential shape.
- Deployments that add site suffixes or sit behind reverse proxies must configure trusted values deliberately; arbitrary user-supplied domains and forwarded IP headers are not trusted.
- Disconnect removes the application's connection and session but does not revoke the Atlassian token remotely.
