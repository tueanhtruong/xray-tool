# tests/live — reserved

Live contract tests against a **dedicated Jira/Xray sandbox** site and project.

Status: reserved. There is no `test:live` script yet; the first live contract test and the
`pnpm test:live` script arrive with the first integration story (US-02 / US-04).

Rules (see [docs/testing.md](../../docs/testing.md) and [docs/security.md](../../docs/security.md)):

- Run with `NUXT_INTEGRATION_TARGET=live` and the `SANDBOX_*` variables from `.env`.
- Never point these tests at a production site. Automated writes stay inside `SANDBOX_PROJECT_KEY`,
  are namespaced, and are cleaned up.
- Live tests are **not** part of `pnpm verify` or CI; those always use the mock.
- A live response saved as a mock fixture must be sanitized first: no tokens, emails, account IDs,
  cloud IDs, or site URLs.
