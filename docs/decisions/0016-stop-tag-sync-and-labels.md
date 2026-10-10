# 0016 — Remove labels and stop tag sync

- Status: accepted
- Date: 2026-10-10
- Supersedes: [0004](0004-labels-are-scenario-tags.md) and the labels part of [0005](0005-editable-fields-v1.md)
- Source: US-09.1 explore session

## Context

Jira labels were the only carrier for Gherkin scenario tags. Keeping tag sync would require labels in the model, drafts, grid, fingerprint and sync. US-09.1 removes labels, so the carrier is gone.

## Decision

- Jira labels are removed from the app: no drafts, grid column, API field, fingerprint input or sync step.
- Gherkin tags (scenario and feature level) are kept only as Markdown/Gherkin text. They are not synced to Xray.
- `@xray-KEY` stays as the identity link between a scenario and its Xray test ([0003](0003-one-scenario-one-xray-test.md)). It is not a sync field.
- The app does not write or clear existing Xray labels.
- Jira status is not decided here. [0005](0005-editable-fields-v1.md) still applies to status until a later ADR changes it.

## Consequences

- US-11 parser: no label output; `@xray-KEY` is still parsed and checked for duplicates.
- US-13, US-14: no tag-to-label mapping. Export keeps `@xray-KEY` tags.
- US-18: no Jira label update step.
- US-19: keeps inserting `@xray-KEY` tags for created scenarios.
- US-09.1 migration deletes drafts that differ only in labels.
