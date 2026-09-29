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

| Route                 | Status                                                       |
| --------------------- | ------------------------------------------------------------ |
| `GET /health`         | `200 { "status": "ok", "service": "mock-services" }`         |
| `/atlassian-auth/*`   | authorize and token/refresh mock routes                      |
| `/atlassian-api/*`    | accessible resources, `/me`, and OAuth Jira identity route  |
| `/jira-site/*`        | direct Jira API-token `/rest/api/3/myself` route              |
| `GET/POST /__control` | select deterministic scenario and inspect request counts     |
| unknown routes        | `404`                                                        |

### Reserved prefixes

The app derives its base URLs from these prefixes when the target is `mock`
(see `server/utils/integration-urls.ts`).

| Prefix            | Emulates                                 | First story  |
| ----------------- | ---------------------------------------- | ------------ |
| `/atlassian-auth` | `https://auth.atlassian.com` (OAuth 2.0) | US-02        |
| `/atlassian-api`  | `https://api.atlassian.com` (Jira REST)  | US-02, US-03 |
| `/jira-site`      | direct Jira Cloud site REST API-token requests | US-03 |
| `/xray`           | `https://xray.cloud.getxray.app` (Xray)  | US-04        |

Mock fixtures copied from live responses must be sanitized first (see `docs/testing.md`).

### OAuth scenarios

Mock OAuth defaults to one accessible site. Tests can select `single`, `multi`, `denied`,
`invalid-code`, `expired`, or `revoked` behavior without real Atlassian credentials. Refresh tokens
are one-time-use and are rotated after a successful refresh:

```sh
curl -X POST http://localhost:4010/__control \
  -H 'content-type: application/json' -d '{"mode":"multi","resetRefreshCount":true}'
curl http://localhost:4010/__control
```

The control route is intended for local/test mock use only. Test identities, sites, and tokens are
obviously fake.

### API-token scenario

The mock Jira site accepts the fake credentials `qa@example.com` and
`mock-valid-api-token` at `/jira-site/rest/api/3/myself`; any other Basic credentials receive
401. The request count is visible in `GET /__control` and reset with
`POST /__control` body `{"resetApiTokenMyselfCount":true}`.
