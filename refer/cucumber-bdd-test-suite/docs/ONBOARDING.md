# Onboarding

This repository is for authoring and maintaining Gherkin feature files for MDS component validation.

## What lives here

- `.feature` files under `src/feature/`
- Authoring standards under `docs/`
- Agent guidance and reusable skills under `.github/`

## What does not live here

- Step definition implementation
- Runtime/test harness configuration
- E2E execution wiring

## First-day setup

1. Open the repo in VS Code.
2. Install the Cucumber extension:
   - [alexkrechik.cucumberautocomplete](https://marketplace.visualstudio.com/items?itemName=alexkrechik.cucumberautocomplete)
3. Read, in order:
   - `docs/GUIDELINE_CUCUMBER.md`
   - `docs/FEATURE_NAMING_AND_STYLE.md`
   - `docs/TAGGING_STRATEGY.md`
   - `.github/copilot-instructions.md`

## Authoring workflow

1. Identify target component/behavior and acceptance criteria.
2. Create or update `src/feature/<name>.feature`.
3. Apply required syntax/style rules.
4. Add canonical tags.
5. Validate cross-component impact if shared primitives are involved.
6. Mark with `@need-review` until approved.

## Recommended Jira-first AI workflow (effective path)

Use this flow for best output quality and a single source of truth:

1. Configure Jira API token using `.github/skills/magenta-jira/README.md`.
2. Invoke `mds-bdd-orchestrator` directly with `mode=generate`.
3. Let orchestrator fetch Jira context via `magenta-jira` (`TITLE`, `DESC`, `AC`, `REQUIREMENTS`).
4. Provide explicit expectations/questions in the same prompt.
5. Review generated coverage:
   - each question should map to at least one scenario
   - assumptions should be tagged `@need-review`
   - style checks should use explicit values (`rgb(...)`, token names, `semi-bold`)

Example:

```text
/mds-bdd-orchestrator mode=generate
Create production-ready Gherkin scenarios for ONEDS-12372.
Fetch Jira context via magenta-jira first, then generate happy/negative/edge coverage.
Ask clarification questions with proposed defaults.
```

## Review checklist

- Exactly one `Feature:` header exists.
- `Scenario Outline` is used for parameterized scenarios.
- No `//` comments are present.
- Step phrasing is consistent with existing navigation patterns.
- Status tags follow canonical policy.

## Skills quick start

- `mds-bdd-orchestrator` — canonical workflow skill (`generate`, `audit`, `normalize`, `regression`)
- `magenta-jira` — Jira ticket context provider

Full index: `.github/skills/SKILLS.md`
