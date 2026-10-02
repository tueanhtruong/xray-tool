# 0006 — Single-user workspaces and shared project cache

- Status: accepted (revised by US-08.2)
- Date: 2026-10-01
- Source: US-08.2 multi-project repository

## Decision

Each Jira workspace remains owned by one application user and retains its own Jira and Xray
credentials. Jira projects are separate tenant-scoped records keyed by cloud ID (or normalized site
origin for API-token sites) plus Jira project ID. A workspace gains access to a project only after
Jira metadata lookup and Xray access verification; authorized workspaces reuse the same read-only
project cache. Project context belongs to each URL/request, not a mutable workspace selection.

Drafts belong to `(user, shared test case)` and capture immutable base fields and fingerprint when
created. A project refresh may update shared remote state without replacing any user's draft base.
Team roles, shared draft editing, and billing remain out of scope. Independently authorized Xray
credentials are assumed to expose equivalent project indexes; a second-credential sandbox check is
optional and may be performed manually later.

## Consequences

- Different users may edit the same shared test case independently; each user's draft and project
  context remain private.
- Project switches retain caches and drafts and never write to Jira/Xray.
- Same-project pulls are serialized; different projects can refresh concurrently under the
  single-instance job coordinator.
- Cache access depends on a verified workspace/project association, never cache existence or a
  guessed project identifier.
