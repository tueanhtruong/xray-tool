# Repository and Cucumber Suite Report

## Purpose

`magenta-toolbox` is a private monorepo that consolidates internal developer tools and reusable AI skills. It is a collection of utilities rather than one application. The root [README](../../../../README.md) describes its main areas:

- A/B testing applications (`ab-testing-v1` and `ab-testing-v2`)
- The Cucumber BDD suite for Magenta Design System (MDS) behavior scenarios and Xray workflows
- A Jira-to-changelog browser utility
- Reusable AI skills for Jira, changelog, pull request, and icon workflows

## Cucumber Suite: Main Function

The `cucumber-bdd-test-suite` package is for authoring and maintaining Gherkin `.feature` files that describe MDS component behavior and documentation-site flows. It also provides tools to export those scenarios to Xray, create and update Xray Tests, and assemble Jira Test Sets and Test Executions.

It is **not** a local Cucumber test runner. Step definitions, runtime configuration, and E2E execution are managed outside this package. Its primary content is under `src/feature/`; authoring conventions are documented in the [Cucumber guideline](GUIDELINE_CUCUMBER.md), [feature naming guide](FEATURE_NAMING_AND_STYLE.md), and [tagging strategy](TAGGING_STRATEGY.md).

## How the Xray Workflow Works

```text
Acceptance criteria / component behavior
                  |
                  v
       Gherkin .feature files
                  |
                  v
   Parse scenarios and their tags
          /                 \
         v                   v
  Create or update      Export JSON for
  Xray Cucumber Tests   manual Xray import
         |
         v
  @xray-<KEY> written to the feature file
         |
         v
  Later runs update the linked Test
```

The scripts recursively find `.feature` files in the selected file or directory. Each `Scenario` or `Scenario Outline` is handled as an individual test. A scenario's title becomes the Jira summary, and its steps and examples become the Xray Gherkin definition. The directory path below `featureRoot` maps to the Xray Test Repository folder path; missing folders are created by the direct-create workflow.

After a Test is created, the script writes its Jira key to the feature file as an `@xray-KEY` tag above the scenario. That tag is the association used by later updates. A tagged scenario is updated rather than duplicated by Create/Sync; Update skips untagged scenarios. The parser and API workflows are implemented in [`gherkin-parser.js`](../scripts/gherkin-parser.js), [`create-xray-tests.js`](../scripts/create-xray-tests.js), and [`xray-client.js`](../scripts/xray-client.js).

## Authoring Workflow

1. Identify the target component or behavior and its acceptance criteria.
2. Create or update a feature file under `src/feature/`, using a behavior-focused name.
3. Keep one `Feature:` header per file. Use `Scenario Outline` for parameterized cases and write user-observable steps.
4. Add the appropriate status tag, such as `@need-review` while a scenario needs review or `@done` after approval. Add stable component or behavior tags when useful.
5. Include cross-component regression scenarios when shared component behavior changes.
6. Review the scenarios, then use an Xray workflow if the cases need to be published or synchronized.

See the [onboarding guide](ONBOARDING.md) for the recommended Jira-first authoring workflow and review checklist.

## Setup

- Use Node.js 20 or newer and pnpm 9 or newer, as recommended by the root README.
- Install the Cucumber extension for VS Code syntax support.
- Install workspace dependencies before running the scripts. The Cucumber package declares `@clack/prompts`; installing the full monorepo may also require the private npm registry used by the A/B testing packages.
- Direct Xray workflows need `XRAY_CLIENT_ID` and `XRAY_CLIENT_SECRET` in the package `.env` file. Jira REST operations also need `JIRA_EMAIL` and `JIRA_API_TOKEN`.
- Project, endpoint, and feature-root settings are in [`api/config.json`](../api/config.json). The configured feature root defaults to `src/feature`.
- Keep `.env` credentials out of version control.

## Commands

Run commands from `packages/tools/cucumber-bdd-test-suite/`, or prefix them from the monorepo root with `pnpm --filter cucumber-bdd-test-suite`.

| Command | Purpose |
| --- | --- |
| `pnpm xray` | Open the interactive workflow menu. |
| `pnpm export-xray` | Generate `scripts/xray-import.json` for manual Jira/Xray import. |
| `pnpm create-xray-tests` | Create Xray Tests directly from scenarios; existing tagged Tests are updated. |
| `pnpm update-xray-tests` | Update Tests for scenarios tagged with `@xray-KEY`. |
| `pnpm create-test-set-executions` | Create a Test Set plus DEV and QA executions, populate them with selected Tests, and link them to a Jira ticket. |

The interactive menu currently has five choices: Generate, Create, Update, Sync, and Create Test Set and executions. Sync creates untagged scenarios and updates tagged ones. Test Set selection accepts Test keys or feature paths; feature-based selection requires every included scenario to have an `@xray-KEY` tag.

For direct API operations, scripts prompt for feature paths and other inputs. Paths may be relative to the package root or absolute. The export workflow creates JSON for a manual import and does not itself create Xray issues.

## Scope and Documentation Notes

- The package manifest contains Xray utility scripts but no Cucumber test, lint, or build script. Running the root test task does not make this package execute `.feature` scenarios.
- The root README describes the Cucumber package as supporting test execution, while this package's onboarding and authoring guides explicitly place execution outside the repository. The package description should be understood as scenario authoring and Xray management.
- The suite README describes four menu workflows, but the current CLI exposes five.
- The root README recommends Node.js 20+, while the root `package.json` engine metadata says Node.js 16+. Follow the README's newer version recommendation when using this workspace.

## Inspection Boundary

This report documents the repository and current script behavior. The scripts were inspected but not run against Jira or Xray, because those operations can create or modify external issues.