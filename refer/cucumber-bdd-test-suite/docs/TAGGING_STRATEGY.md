# Tagging Strategy

This document defines how tags are used in `src/feature/*.feature` files.

## Status Tags (Canonical)

Use these tags for execution/review lifecycle:

- `@need-review` — draft/newly updated scenario needing validation
- `@done` — reviewed and approved scenario
- `@skip` — intentionally excluded from execution temporarily
- `@debug` — temporary troubleshooting marker
- `@only` — temporary focused execution marker

## Tag Lifecycle

Recommended transitions:

1. Authoring: `@need-review`
2. Validation complete: `@done`
3. Temporary exclusion: add `@skip` (and remove when resolved)
4. Local troubleshooting: add `@debug` or `@only` temporarily, then remove before finalizing

## Component and Behavior Tags

Non-status tags are allowed for discoverability, for example:

- component tag: `@weekpicker`, `@select`
- behavior tag: `@keyboard-focus`, `@tab-order`

Use stable, meaningful names. Avoid one-off tags that duplicate scenario titles.

## Legacy Tags

Legacy status-like tags (for example `@created`, `@updated`, `@reviewed-*`) are not canonical.

Policy:

- Existing untouched files may retain legacy tags.
- Any **new or updated** file should migrate to canonical status tags.

## Do / Don't

Do:

- Keep status meaning unambiguous.
- Keep at most one primary status tag (`@need-review` or `@done`) on final content.

Don't:

- Keep `@only` or `@debug` in finalized content.
- Introduce new status tags without updating this document.
