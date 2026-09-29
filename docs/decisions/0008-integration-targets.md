# 0008 — Integration targets: live-first, mock backup, verify on mock

- Status: accepted
- Date: 2026-09-29
- Story: US-00

## Context

The user develops and tests against a real Jira/Xray sandbox. Automated verification has to be
deterministic and must not need credentials or Atlassian to be available.

## Decision

- One switch: `NUXT_INTEGRATION_TARGET=live|mock`, default `live`.
- `resolveIntegrationUrls()` (`server/utils/integration-urls.ts`) is the only code that branches
  on it. It derives the Atlassian auth, Atlassian API, and Xray base URLs: official endpoints for
  `live`, `${NUXT_MOCK_SERVICES_URL}/{atlassian-auth,atlassian-api,xray}` for `mock`. Any single
  URL can be overridden (e.g. an Xray regional endpoint).
- The mock is a **separate workspace package** (`packages/mock-services`, h3 1.x, `pnpm mock`,
  port 4010). `init.sh` does not start it. The test runners start it on demand when the target is
  `mock` and stop only what they started.
- **`pnpm verify` and CI always run with `mock`.**
- Integration stories add `test:live` contract checks against the sandbox so the mock doesn't drift
  from the real API. Sanitized live responses become mock fixtures.

Rejected: separate `.env.live` / `.env.mock` files (they drift and it's easy to run the wrong
one); running the mock as a docker-compose service or a pidfile-managed background process (the
user preferred a separate workspace process; pidfiles are fragile).

## Consequences

- Live-first development can write to the sandbox. Only a dedicated sandbox site/project may be
  used, and automated writes are namespaced and cleaned up (enforced from US-18).
- The README's Definition of Done #3 is rewritten to match (mock-gated verify, `test:live` for
  integration stories).
- Open: the Xray region (global vs `us`/`eu`) for the sandbox. Settled in US-04 via
  `NUXT_XRAY_BASE_URL`.
