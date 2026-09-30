## Why

After connecting Jira, Xray, and a project, users need to find tests without retrieving and storing full details for the entire project. This change provides a lightweight, searchable repository index and fetches full test data only when a user opens a test or selects it for editor work.

## What Changes

- Pull and cache the selected project's folder tree and a lightweight test index containing issue identity, key, name/summary, and folder location; do not fetch or store full test details during the pull.
- Preserve the prior folder/index cache if remote retrieval or replacement fails; expose pull status and progress through polling.
- Fetch current full test details from Xray on every detail-view open without caching that response; fetch details for editor selection and compare them with any existing snapshot before deciding whether it can be updated.
- Add authenticated folder/index/detail/selection APIs and a repository page with navigation, key/name search, deep links, safe details, and selection affordance.
- Define and verify the Xray folder-enumeration, lightweight index, and on-demand detail GraphQL contracts.

## Capabilities

### New Capabilities
- `test-repository`: Pull, cache, query, and browse the selected Jira/Xray project's folders and test cases.

### Modified Capabilities

## Impact

- Affected systems: Xray GraphQL integration and mock, Prisma-backed folder/test-index/snapshot cache, pull and query APIs, repository UI, integration/e2e tests, architecture documentation.
- Builds on existing project-scoped cache models, workspace locking, Xray client, and repository readiness guard.
- No new external dependencies or changes to Jira/Xray data; pulls and on-demand reads remain read-only against remote systems.
