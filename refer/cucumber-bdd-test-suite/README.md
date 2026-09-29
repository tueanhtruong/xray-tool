# Cucumber BDD Test Suite

Repository for authoring and maintaining Gherkin `.feature` coverage for Magenta Design System (MDS) components documented in Storybook and docs site flows.

## 📋 Overview

This workspace is **feature-files focused**.

- Primary artifact: Gherkin scenarios in `src/feature/*.feature`
- Primary purpose: validate behavior, visual styling, navigation, and cross-component regression coverage
- Execution/runtime (step definitions, runner wiring): managed outside this repository

## 🚀 Getting Started

### Prerequisites

- VS Code
- Cucumber extension for syntax support:
  - [alexkrechik.cucumberautocomplete](https://marketplace.visualstudio.com/items?itemName=alexkrechik.cucumberautocomplete)

### Recommended AI workflow (Jira ticket → BDD)

1. Follow `.github/skills/magenta-jira/README.md` to configure Jira API token.
2. Use `mds-bdd-orchestrator` directly (recommended). It will fetch Jira context via `magenta-jira` automatically.
```text
/mds-bdd-orchestrator mode=generate
Generate production-ready Gherkin scenarios for ONEDS-12372.
First fetch full Jira context via magenta-jira (TITLE, DESC, AC, REQUIREMENTS, subtasks, comments), then map coverage for happy/negative/edge paths.
Ask clarification questions if needed, and propose default answers for each question so I can quickly review.
```
3. Optional debugging step: run `magenta-jira` manually if you want to inspect raw ticket context first.
```text
/magenta-jira Get full requirement context including subtasks from ticket "ONEDS-12372", and use current repo conventions for context.
```
4. Review output to ensure:
  - happy + negative + edge scenarios are covered
  - each asked question is represented in scenario coverage
  - unknowns are marked with `@need-review`

### Pushing scenarios to Xray

Once `.feature` files are ready, run the interactive Xray automation menu (see [🚀 Xray Import Workflows](#-xray-import-workflows) below for full details):

```bash
pnpm xray
```

## 🏗️ Architecture

- **Testing Target**: MDS React components in Storybook/docs site
- **Test Format**: Gherkin (Given/When/Then)
- **Test Location**: `src/feature/[component-name].feature`
- **Design Token Reference**: `template/variables.css`

### 📁 Project Structure

```
cucumber-bdd-test-suite/
├── .github/
│   ├── copilot-instructions.md
│   ├── agents/          # Deprecated (see README in folder)
│   ├── prompts/         # Deprecated (see README in folder)
│   └── skills/          # Canonical AI workflow skills
├── api/                 # Xray GraphQL config + queries (see 🚀 Xray Import Workflows)
├── docs/
│   ├── GUIDELINE_CUCUMBER.md
│   ├── TAGGING_STRATEGY.md
│   ├── ONBOARDING.md
│   └── FEATURE_NAMING_AND_STYLE.md
├── scripts/              # pnpm xray / export-xray / create-xray-tests / update-xray-tests
├── src/
│   └── feature/
├── tasks/
├── template/
│   └── variables.css
└── README.md
```

## 📚 Documentation

- [Cucumber Guidelines](docs/GUIDELINE_CUCUMBER.md)
- [Tagging Strategy](docs/TAGGING_STRATEGY.md)
- [Onboarding](docs/ONBOARDING.md)
- [Feature Naming and Style](docs/FEATURE_NAMING_AND_STYLE.md)
- [Copilot Instructions](.github/copilot-instructions.md)
- [AI Skills Index](.github/skills/SKILLS.md)

## Guideline Highlights
- Recommended Jira-first AI workflow: use `mds-bdd-orchestrator` with Jira context from `magenta-jira`.


## 🤝 Contributing

When adding or updating scenarios:

1. Edit/create a file in `src/feature/*.feature`.
2. Follow rules in [GUIDELINE_CUCUMBER](docs/GUIDELINE_CUCUMBER.md) and [FEATURE_NAMING_AND_STYLE](docs/FEATURE_NAMING_AND_STYLE.md).
3. Use canonical status tags only: `@done`, `@only`, `@skip`, `@debug`, `@need-review`.
4. If a shared/base component behavior changes, include cross-component regression coverage.

### Quality Gate Policy

- **Strict for new/updated files**: must follow current rules.
- **Legacy files**: may remain as-is until touched; once updated, they must be normalized.

## 🚀 Xray Import Workflows

Run the interactive menu:

```bash
pnpm xray
```

It prompts you to pick one of the four workflows below (built with `@clack/prompts`). Generate, Create, and Update are also runnable standalone. Every path prompt accepts **one or more** comma-separated paths (relative to this package or absolute — e.g. pasting a full `/Users/.../src/feature/test-flow/x.feature` path works too).

### A. Generate test case (CSV/JSON export + manual Jira UI import)

```bash
pnpm export-xray
```

Generates `scripts/xray-import.json`. Import it via **Project Settings > Xray > Import Tests**. If a `xray_test_repository_folder` value doesn't exist yet in Jira, enable `"config.create.test.repository.folders": true` in the importer's field-mapping config so missing folders are created automatically during import.

### B. Create test case (direct API, no manual import step)

```bash
pnpm create-xray-tests
```

Calls the Xray Cloud GraphQL API directly to create each scenario as a Test issue, auto-creating the Test Repository folder if it doesn't exist.

Setup (one-time):
1. Fill in `XRAY_CLIENT_ID` / `XRAY_CLIENT_SECRET` in `.env` (Project Settings > Xray API Keys). Never commit this file.
2. Fill in `JIRA_EMAIL` / `JIRA_API_TOKEN` in `.env` for updating Jira Test summaries. The API token must have permission to edit issues. Never commit this file.
3. Fill in `projectKey` and `projectId` in `api/config.json` (numeric `projectId` can be found via Jira Project Settings > Details URL, or run `node scripts/lookup-project-id.js <PROJECT_KEY>`).

Folder path is derived from each file's location under `featureRoot` (`src/feature`), e.g. `src/feature/test-flow/x.feature` → Xray folder `/test-flow`, `src/feature/x.feature` → Xray folder `/` (the `featureRoot` itself is never included as a folder segment).

After a scenario is created, its issue key is written back into the `.feature` file as a `@xray-<KEY>` tag above the scenario. Re-running `create-xray-tests` on an already-tagged scenario does **not** create a duplicate — it overwrites the existing Xray Test's Gherkin definition and folder instead (same effect as `update-xray-tests` for that scenario).

### C. Update test case (sync changes back to already-created tests)

```bash
pnpm update-xray-tests
```

For every scenario tagged `@xray-<KEY>`, pushes the current scenario name, Gherkin steps, and Test Repository folder to the matching Xray Test. Untagged scenarios are skipped — create them first with `create-xray-tests`.

### D. Create Test Set and DEV/QA Test Executions

```bash
pnpm create-test-set-executions
```

The workflow asks for a root Jira ticket such as `ONEDS-13700`, then lets you choose one input mode:

- enter existing Test Case keys separated by commas or newlines
- enter feature file paths/directories; only scenarios with `@xray-<KEY>` tags are included

It creates a Test Set named after the root ticket summary, plus `[DEV] - <summary>` and `[QA] - <summary>` Test Executions. The selected Tests are added to all three Xray issues and all three issues are linked back to the root ticket.

Configure the Jira link display directions in `api/config.json`:

```json
"issueLinkDirections": {
  "testSet": "is tested by",
  "testExecution": "is tested by"
}
```

The labels must match exactly one inward or outward Jira issue-link description. The script stops before creating issues when the input is empty/duplicated, a feature scenario has no Xray tag, or the root ticket already has a matching link.

Jira REST operations require `JIRA_EMAIL` and `JIRA_API_TOKEN` in `.env`; Xray operations also require `XRAY_CLIENT_ID` and `XRAY_CLIENT_SECRET`.

### E. Sync test case (create and update in one pass)

The **Sync test case** workflow is available from `pnpm xray`. It processes every scenario according to its Xray tag:

- Scenarios without `@xray-<KEY>` are created, then tagged in the `.feature` file with the returned issue key.
- Scenarios with `@xray-<KEY>` update the existing Xray Test's summary, Gherkin definition, and Test Repository folder.

Sync prompts once for comma-separated labels. Labels are applied to newly created tests; updates use the existing Xray Test unchanged. The existing Create and Update workflows retain their current behavior.

### `api/` folder

```
api/
  config.json               # non-secret config: projectKey, projectId, xrayBaseUrl, featureRoot
  create/*.graphql           # operations used by create-xray-tests.js (getFolder, createFolder, createTest)
  update/*.graphql           # GraphQL operations used by xray-sync.js / update-xray-tests.js (updateGherkinTestDefinition, updateTestFolder); Jira summary uses REST
  map_id/*.graphql           # operations that resolve a human key -> numeric id (getTests by key/project)
```

Each `.graphql` file holds a single raw GraphQL query/mutation definition (no JS escaping). Scripts load them via `loadQuery("<folder>/<file>")` from `scripts/xray-client.js`, e.g. `loadQuery("create/create-test")` reads `api/create/create-test.graphql`. Add a new operation by dropping a `.graphql` file in the matching folder and loading it the same way — keeps every raw API call in one place instead of scattered across scripts.

## 🐛 Troubleshooting

### Storybook/docs navigation mismatches

- Confirm section and component names exactly match target UI.
- Keep step wording aligned with shared conventions to avoid duplicate step intents.

## 👥 Maintainers

- QA Team: review and feedback only
- Dev Team: scenario authoring and testcase writing

## 🔗 Related Resources

- [Cucumber Documentation](https://cucumber.io/docs/cucumber/)
- [Gherkin Reference](https://cucumber.io/docs/gherkin/reference/)
- [Jira Board](https://oneline.atlassian.net/jira/software/c/projects/ONEDS/boards/1378)
- [Testing Board](https://oneline.atlassian.net/projects/ONEDS?selectedItem=com.atlassian.plugins.atlassian-connect-plugin:com.xpandit.plugins.xray__testing-board)
