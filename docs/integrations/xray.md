# Xray Cloud integration

US-04 connects each workspace to Xray Cloud. The app stores API client credentials encrypted and
uses Xray JWTs only on the server. US-05 adds the read-only root-folder probe used to verify a
selected Jira project's Xray access. US-06/07 use the same client to read folder trees and tests.

## Endpoints and regions

The client uses these Xray Cloud API v2 endpoints:

- `POST /api/v2/authenticate` with JSON `{ "client_id": "…", "client_secret": "…" }`; Xray
  returns a short-lived JWT.
- `POST /api/v2/graphql` with JSON `{ "query": "…", "variables": { … } }` and
  `Authorization: Bearer <JWT>`.
- `query GetFolder($projectId: String!, $path: String!)` verifies access using the numeric Jira
  project ID and root path `/` during project selection. The server keeps this small query with the
  Xray client so it is compatible with both Vite development and Nitro production builds.
- Folder pull requests the root with `name`, `path`, `testsCount`, `preconditionsCount`,
  `issuesCount`, and `folders`. Xray documents `folders` as a JSON scalar; the root response
  contains nested child objects with those same fields. The client validates each child's name,
  path, test count, and nested folders, then derives parent paths while flattening the tree.
- The lightweight test-index pull uses `getTests(projectId, limit, start)` with a maximum page limit
  of 100 and reads `total`, `start`, `limit`, `issueId`, `folder { path }`, and Jira `key` and
  `summary` only. It does not request test type, Gherkin, labels, status, or update timestamps.
- Opening a test fetches current details with `getTests(jql: "key = ...", limit: 1)`; editor selection
  batches keys into one JQL `IN` query (up to 100 tests per request). Both read issue identity,
  test type, Gherkin, folder, Xray `lastModified`, and Jira key, summary, labels, status, and updated.
  Detail opens do not persist the response. Selecting tests for the editor uses the same details and
  safely creates or refreshes snapshots after comparing normalized fingerprints; changed baselines
  are retained when a local draft exists.

The supported, server allow-listed regions are:

| Region | Base URL                            |
| ------ | ----------------------------------- |
| Global | `https://xray.cloud.getxray.app`    |
| US     | `https://us.xray.cloud.getxray.app` |
| EU     | `https://eu.xray.cloud.getxray.app` |
| AU     | `https://au.xray.cloud.getxray.app` |

The owner selects a region; endpoints are not free text. `NUXT_XRAY_BASE_URL`, when configured,
overrides the selected regional URL. In mock mode, the resolved default points under the mock
service's `/xray` prefix. Integration clients consume the resolved URL and do not select live/mock
targets themselves.

## Connection and token lifecycle

1. A signed-in workspace owner enters the Xray client ID and secret and selects **Test & save**.
2. The app sends credentials to the selected Xray authentication endpoint. It writes the connection
   only after Xray accepts the credentials; a failed replacement leaves the prior connection intact.
3. Client ID, client secret, and cached JWT are encrypted at rest with AES-256-GCM and context-bound
   to the workspace and field. The session contains only user/workspace IDs.
4. The app reuses a JWT until it is within 60 seconds of the decoded `exp` time. Concurrent refreshes
   in one process share one in-flight authentication. A GraphQL HTTP 401 triggers one
   re-authentication and one request retry.
5. Settings show region and verification/configuration timestamps only. The client ID, secret, and
   JWT are never returned to the browser.

## Retry and error behavior

GraphQL HTTP 429 and 503 responses are retried up to three total GraphQL attempts. A valid
`Retry-After` value in delta-seconds or HTTP-date form is honored up to a 30-second maximum wait. If
the header is absent or invalid, exponential backoff starts at 250 ms and is capped at 30 seconds.
The 401 re-authentication retry shares the three-attempt request budget so retries cannot multiply
without bound. GraphQL `errors[]` are mapped to actionable sanitized errors; arbitrary upstream
messages and sensitive fields are not returned.

## Mock and tests

`pnpm mock` exposes deterministic Xray routes at `/xray/api/v2/authenticate` and
`/xray/api/v2/graphql`. The fake test credentials are `mock-xray-client-id` and
`mock-xray-client-secret`; they are test-only values, not real Xray credentials. The mock control
endpoint can configure invalid credentials, unauthorized responses, throttling, and temporary
unavailability for tests. Normal development and verification do not require Xray secrets.

For live contract testing, use only the dedicated sandbox and `SANDBOX_XRAY_CLIENT_ID` /
`SANDBOX_XRAY_CLIENT_SECRET` values from the local secret store. Never copy real credentials, JWTs,
or unsanitized responses into fixtures, logs, or documentation.
