# 0004 — Labels = scenario-level tags

- Status: accepted (assumption, revisable before US-06/US-08)
- Date: 2026-09-29
- Source: [user-stories README, assumption 2](../user-stories/README.md#assumptions-to-confirm)

## Context

Gherkin tags and Jira labels are both flat string sets. Xray models `Background` as separate
Precondition issues.

## Decision

- The test's Jira **labels** = the scenario-level tags, **minus** `@xray-KEY` (the leading `@`
  is dropped).
- Feature-level tags and `Background` are kept in the local model so Markdown round-trips
  exactly, but they are **not synced** to Xray in v1. Syncing Background would need Precondition
  issues, which is out of scope.

## Consequences

- Exporting then importing is lossless. Sync only touches scenario tags ↔ labels.
- Editing a feature-level tag never produces a remote change. The diff UI (US-16) must make that clear.
