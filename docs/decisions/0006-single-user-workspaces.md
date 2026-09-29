# 0006 — Single-user workspaces

- Status: accepted (assumption, revisable before US-02)
- Date: 2026-09-29
- Source: [user-stories README, assumption 4](../user-stories/README.md#assumptions-to-confirm)

## Decision

In v1 each workspace belongs to exactly one user: one Jira connection, one Xray credential, one
selected project, and that user's drafts. Team sharing, roles, and billing are out of scope.

## Consequences

- There are no concurrent-editor conflicts inside the app. Remote conflicts with Xray are still
  handled (US-17).
- The data model keeps a `workspace` boundary, so sharing can be added later without changing
  every table.
