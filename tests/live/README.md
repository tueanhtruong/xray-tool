# tests/live — reserved

Live contract tests against a **dedicated Jira/Xray sandbox** site and project.

Run `pnpm test:live` to verify the read-only Xray folder-tree and paginated-test GraphQL contracts
against the configured sandbox project. The script requires `SANDBOX_XRAY_CLIENT_ID`,
`SANDBOX_XRAY_CLIENT_SECRET`, and numeric `SANDBOX_XRAY_PROJECT_ID`; set
`SANDBOX_XRAY_BASE_URL` for a regional endpoint when needed.

To verify that independently authorized credentials see the same complete project cache, also set
`SANDBOX_XRAY_CLIENT_ID_2` and `SANDBOX_XRAY_CLIENT_SECRET_2` to a second Xray API key with access
to the same sandbox tenant/project. The check compares complete folder trees and paginated test
indexes; it fails if the results differ. Without the second credential, the shared-cache comparison
is reported as unchecked.

The contract check also introspects `getTests` arguments and queries one non-empty folder with
`folder: { path, includeDescendants: true }`, comparing its results with the full project index.
This verifies subtree retrieval for the sampled folder. It does not prove moved-out or deleted tests
can be discovered by a folder-only query; keep full-project refresh as the safe UI path unless a
separate reconciliation contract can identify those stale entries without a project-wide query.

Rules (see [docs/testing.md](../../docs/testing.md) and [docs/security.md](../../docs/security.md)):

- Run with `NUXT_INTEGRATION_TARGET=live` and the `SANDBOX_*` variables from `.env`.
- Never point these tests at a production site. Automated writes stay inside `SANDBOX_PROJECT_KEY`,
  are namespaced, and are cleaned up.
- Live tests are **not** part of `pnpm verify` or CI; those always use the mock.
- This contract check issues read-only GraphQL queries only; it does not create, update, or delete
  Jira/Xray records.
- A live response saved as a mock fixture must be sanitized first: no tokens, emails, account IDs,
  cloud IDs, or site URLs.
