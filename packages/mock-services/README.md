# @xray-tool/mock-services

A separately run, local stand-in for the Atlassian auth, Jira REST and Xray Cloud APIs.

- **Backup** target for development when the real sandbox is unavailable.
- **Deterministic** target for `pnpm verify` and CI (`NUXT_INTEGRATION_TARGET=mock`).

It is **not** started by `./scripts/init.sh`.

## Run

```sh
pnpm mock                       # from the repo root; node --watch, foreground
MOCK_SERVICES_PORT=4011 pnpm mock
```

Default port: `4010` (`MOCK_SERVICES_PORT`). The app reaches it through `NUXT_MOCK_SERVICES_URL`
(default `http://localhost:4010`); keep both in sync.

`pnpm test:int` and `pnpm test:e2e` start it automatically when the target is `mock` and nothing
is listening yet, and stop only an instance they started.

## Routes

| Route           | Status                                               |
| --------------- | ---------------------------------------------------- |
| `GET /health`   | `200 { "status": "ok", "service": "mock-services" }` |
| everything else | `404`                                                |

### Reserved prefixes

The app derives its base URLs from these prefixes when the target is `mock`
(see `server/utils/integration-urls.ts`). They are implemented by later stories.

| Prefix            | Emulates                                 | First story  |
| ----------------- | ---------------------------------------- | ------------ |
| `/atlassian-auth` | `https://auth.atlassian.com` (OAuth 2.0) | US-02        |
| `/atlassian-api`  | `https://api.atlassian.com` (Jira REST)  | US-02, US-03 |
| `/xray`           | `https://xray.cloud.getxray.app` (Xray)  | US-04        |

Mock fixtures copied from live responses must be sanitized first (see `docs/testing.md`).
