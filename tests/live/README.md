# tests/live — reserved

Live contract tests against a **dedicated Jira/Xray sandbox** site and project.

Run `pnpm test:live` to verify the read-only Xray folder-tree and paginated-test GraphQL contracts
against the configured sandbox project. The script requires `SANDBOX_XRAY_CLIENT_ID`,
`SANDBOX_XRAY_CLIENT_SECRET`, and numeric `SANDBOX_XRAY_PROJECT_ID`; set
`SANDBOX_XRAY_BASE_URL` for a regional endpoint when needed.

Rules (see [docs/testing.md](../../docs/testing.md) and [docs/security.md](../../docs/security.md)):

- Run with `NUXT_INTEGRATION_TARGET=live` and the `SANDBOX_*` variables from `.env`.
- Never point these tests at a production site. Automated writes stay inside `SANDBOX_PROJECT_KEY`,
  are namespaced, and are cleaned up.
- Live tests are **not** part of `pnpm verify` or CI; those always use the mock.
- This contract check issues read-only GraphQL queries only; it does not create, update, or delete
  Jira/Xray records.
- A live response saved as a mock fixture must be sanitized first: no tokens, emails, account IDs,
  cloud IDs, or site URLs.
