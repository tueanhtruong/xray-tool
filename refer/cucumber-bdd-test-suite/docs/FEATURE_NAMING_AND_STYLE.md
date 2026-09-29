# Feature Naming and Style

Standards in this document are required for all new or updated files in `src/feature/`.

## File Naming

- Use `kebab-case` filenames.
- Use concise, behavior-oriented names.
- Use `.feature` extension only.

Examples:

- `weekpicker.feature`
- `picker-control-open-state.feature`
- `tab-order-range-calendar.feature`

## File Structure

Each file should contain:

1. Optional tags
2. Exactly one `Feature:` section
3. Optional `Background:`
4. `Scenario` and/or `Scenario Outline`

## Scenario Rules

- Use `Scenario` for single-case behavior.
- Use `Scenario Outline` with `Examples:` for parameterized behavior.
- If a step contains `<placeholder>`, the scenario must be `Scenario Outline`.
- Scenario titles should be unique in the file and describe observable behavior.

## Step Writing Style

- Prefer user-observable outcomes.
- Keep tense and phrasing consistent with existing project patterns.
- Avoid implementation details (selectors, internal state names).

## Comments

- Use Gherkin comments only: `# comment`
- Do not use `//` comments.

## Visual and Token Assertions

When UI style is in scope, assert exact expected values:

- RGB values (example: `rgb(234, 242, 253)`)
- Font-weight tokens (example: `semi-bold`)
- Token references when appropriate (see `template/variables.css`)

## Legacy Migration Rule

Legacy files may contain older formatting.

When touching a file:

- Normalize it to these rules as part of the same update.
- Migrate legacy status tags to canonical tags from `docs/TAGGING_STRATEGY.md`.
