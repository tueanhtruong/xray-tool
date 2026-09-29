# 0011 — Sealed authentication sessions

- Status: accepted
- Date: 2026-09-29
- Story: US-02

## Context

US-02 introduces browser sessions and OAuth. Session contents must remain confidential and
tamper-resistant, and must not contain Atlassian access or refresh tokens. The app is a server-rendered
Nuxt application with an existing redacted error/logging foundation.

## Decisions

1. Use `nuxt-auth-utils` sealed cookie sessions rather than custom session cryptography or a
   database-backed opaque session. It provides Nuxt/Nitro session helpers and sealed cookies.
2. Session payload is limited to `userId` and `activeWorkspaceId`; profile and authorization data
   are loaded server-side when needed. OAuth tokens remain encrypted in the database.
3. Set cookies `httpOnly`, `SameSite=Lax`, and `Secure` in production/secure deployments. OAuth
   state and pending-site-flow identifiers use separate short-lived httpOnly cookies.
4. `NUXT_SESSION_PASSWORD` is a unique deployment secret of at least 32 characters. It is not
   required to start the server, but a session cannot be issued without it. No public fallback is
   permitted. Test servers inject a fixed test-only value.

## Consequences

- A deployment must configure the same session password across app instances to read existing
  sessions.
- Logout clears the browser session; server-side immediate revocation of other copies is outside
  this story.
- Session payload size stays small, avoiding cookie-size pressure and credential exposure.
