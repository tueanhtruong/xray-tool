# Cucumber Guideline (Feature Authoring)

This document defines how to write and maintain Gherkin feature files for this repository.

## Repository Scope

This repository is **feature-files-only**:

- Write and maintain Gherkin scenarios in `src/feature/*.feature`
- Keep scenario wording reusable and human-readable
- Do **not** assume step-definition implementation or runner setup exists in this workspace

## Tooling

- Install the VS Code extension for syntax support:
   - [alexkrechik.cucumberautocomplete](https://marketplace.visualstudio.com/items?itemName=alexkrechik.cucumberautocomplete)

## Authoring Rules (Required for new/updated files)

1. Every file must contain exactly one `Feature:` header.
2. Keep one feature per file.
3. Use `Scenario Outline` whenever placeholders like `<value>` or an `Examples:` table are used.
4. Use `Scenario` when no parameterization is needed.
5. Use only valid Gherkin comments (`# ...`), never `//` comments.
6. Write user-observable steps (avoid selector-level or implementation-specific language).
7. Keep scenario names clear, unique, and behavior-focused.
8. Keep steps consistent with existing navigation phrasing to reduce duplicate intent.

## File Location and Naming

- Location: `src/feature/*.feature`
- Recommended naming: kebab-case based on component or behavior
   - Example: `weekpicker.feature`
   - Example: `picker-control-open-state.feature`

For detailed naming and style standards, see [FEATURE_NAMING_AND_STYLE.md](./FEATURE_NAMING_AND_STYLE.md).

## Tagging

Use canonical status tags only:

- `@done`
- `@only`
- `@skip`
- `@debug`
- `@need-review`

Additional non-status tags (component/behavior labels) are allowed for discoverability as long as they are meaningful and stable.

For lifecycle and transition rules, see [TAGGING_STRATEGY.md](./TAGGING_STRATEGY.md).

## Recommended Scenario Structure

```gherkin
@component-tag @need-review
Feature: Component behavior
   As a user
   I want ...
   So that ...

   Background: Common navigation
      Given I have accessed Storybook successfully
      And I navigate to the "[Section Name]" section
      And I select "[Component]" component at the sidebar

   Scenario: Happy path behavior
      When ...
      Then ...

   Scenario Outline: Data-driven behavior
      Given ... "<variant>" ...
      When ...
      Then ...
      Examples:
         | variant |
         | A       |
         | B       |
```

## Cross-Component Regression Expectation

When a shared/base behavior changes (for example List Item visual behavior), include validation across dependent components, not only the base component story.

## Legacy File Policy

- Existing legacy formatting may remain until a file is touched.
- Any new or updated file must comply fully with this guideline.

## AI-assisted authoring from Jira DOCX

When using AI to generate scenarios from Jira-exported `.docx` files:

1. Place ticket files under `tasks/` (example: `tasks/ONEDS-1234.docx`).
2. Attach/drag the docx file into chat when prompting.
3. Include explicit questions/checkpoints in your prompt (for example keyboard behavior, validation messages, token assertions).
4. Require mapping from each question/checkpoint to at least one generated scenario.

Recommended prompt style:

- `write BDD testcase for ticket tasks/ONEDS-1234.docx with focus on: [question 1], [question 2], [question 3]`

Effectiveness tips:

- Be specific about Storybook target (`README`, `Usage`, `Playground`, `Examples`).
- Request explicit expected values for style checks (`rgb(...)`, token names, font weights).
- Ask AI to mark unknown requirements with `@need-review` instead of inventing behavior.
- If the ticket affects shared primitives, ask for impacted consumer coverage as part of output.

