import { createServer } from 'node:http'
import {
  createApp,
  createRouter,
  defineEventHandler,
  getQuery,
  readBody,
  sendRedirect,
  setResponseStatus,
  toNodeListener,
} from 'h3'

/**
 * Mock services for Atlassian auth, Jira REST and Xray. Run with `pnpm mock`.
 * Supports deterministic Atlassian OAuth/Jira identity scenarios for tests.
 */
export function createMockApp() {
  let mode = 'single'
  let refreshCount = 0
  let apiTokenMyselfCount = 0
  let xrayMode = 'valid'
  let xrayAuthenticateCount = 0
  let xrayGraphqlCount = 0
  let xrayUnauthorizedRemaining = 0
  let xrayRateLimitRemaining = 0
  let xrayUnavailableRemaining = 0
  const router = createRouter()
    .get(
      '/health',
      defineEventHandler(() => ({ status: 'ok', service: 'mock-services' })),
    )
    .post(
      '/__control',
      defineEventHandler(async (event) => {
        const body = (await readBody(event)) as {
          mode?: unknown
          resetRefreshCount?: unknown
          resetApiTokenMyselfCount?: unknown
          xrayMode?: unknown
          xrayUnauthorizedRemaining?: unknown
          xrayRateLimitRemaining?: unknown
          xrayUnavailableRemaining?: unknown
          resetXrayCounts?: unknown
        }
        if (typeof body.mode === 'string') mode = body.mode
        if (body.resetRefreshCount === true) refreshCount = 0
        if (body.resetApiTokenMyselfCount === true) apiTokenMyselfCount = 0
        if (typeof body.xrayMode === 'string') xrayMode = body.xrayMode
        if (typeof body.xrayUnauthorizedRemaining === 'number') {
          xrayUnauthorizedRemaining = Math.max(0, Math.floor(body.xrayUnauthorizedRemaining))
        }
        if (typeof body.xrayRateLimitRemaining === 'number') {
          xrayRateLimitRemaining = Math.max(0, Math.floor(body.xrayRateLimitRemaining))
        }
        if (typeof body.xrayUnavailableRemaining === 'number') {
          xrayUnavailableRemaining = Math.max(0, Math.floor(body.xrayUnavailableRemaining))
        }
        if (body.resetXrayCounts === true) {
          xrayAuthenticateCount = 0
          xrayGraphqlCount = 0
        }
        return {
          mode,
          refreshCount,
          apiTokenMyselfCount,
          xrayMode,
          xrayAuthenticateCount,
          xrayGraphqlCount,
          xrayUnauthorizedRemaining,
          xrayRateLimitRemaining,
          xrayUnavailableRemaining,
        }
      }),
    )
    .get(
      '/__control',
      defineEventHandler(() => ({
        mode,
        refreshCount,
        apiTokenMyselfCount,
        xrayMode,
        xrayAuthenticateCount,
        xrayGraphqlCount,
        xrayUnauthorizedRemaining,
        xrayRateLimitRemaining,
        xrayUnavailableRemaining,
      })),
    )
    .post(
      '/xray/api/v2/authenticate',
      defineEventHandler(async (event) => {
        xrayAuthenticateCount += 1
        const body = (await readBody(event)) as Record<string, unknown>
        if (
          xrayMode === 'invalid-credentials' ||
          body.client_id !== 'mock-xray-client-id' ||
          body.client_secret !== 'mock-xray-client-secret'
        ) {
          setResponseStatus(event, 401)
          return { error: 'invalid_client' }
        }
        return `header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 600 })).toString('base64url')}.signature`
      }),
    )
    .post(
      '/xray/api/v2/graphql',
      defineEventHandler(async (event) => {
        xrayGraphqlCount += 1
        const authorization = event.node.req.headers.authorization
        if (!authorization?.startsWith('Bearer header.')) {
          setResponseStatus(event, 401)
          return { errors: [{ message: 'Unauthorized' }] }
        }
        if (xrayUnauthorizedRemaining > 0) {
          xrayUnauthorizedRemaining -= 1
          setResponseStatus(event, 401)
          return { errors: [{ message: 'Unauthorized' }] }
        }
        if (xrayRateLimitRemaining > 0) {
          xrayRateLimitRemaining -= 1
          event.node.res.setHeader('retry-after', '0')
          setResponseStatus(event, 429)
          return { errors: [{ message: 'Rate limited' }] }
        }
        if (xrayUnavailableRemaining > 0) {
          xrayUnavailableRemaining -= 1
          setResponseStatus(event, 503)
          return { errors: [{ message: 'Temporarily unavailable' }] }
        }
        const body = (await readBody(event)) as { query?: unknown; variables?: unknown }
        if (xrayMode === 'graphql-errors') {
          return { errors: [{ message: 'API key lacks permission for project DEMO' }] }
        }
        return { data: { query: body.query ?? null, variables: body.variables ?? null } }
      }),
    )
    .get(
      '/atlassian-auth/authorize',
      defineEventHandler((event) => {
        const query = getQuery(event)
        const callback = new URL(String(query.redirect_uri))
        if (mode === 'denied') {
          callback.searchParams.set('error', 'access_denied')
          callback.searchParams.set('state', String(query.state ?? ''))
        } else {
          callback.searchParams.set(
            'code',
            mode === 'invalid-code' ? 'invalid-test-code' : 'test-code',
          )
          callback.searchParams.set('state', String(query.state ?? ''))
        }
        return sendRedirect(event, callback.toString(), 302)
      }),
    )
    .post(
      '/atlassian-auth/oauth/token',
      defineEventHandler(async (event) => {
        const body = (await readBody(event)) as Record<string, unknown>
        if (body.grant_type === 'authorization_code') {
          if (body.code !== 'test-code') {
            setResponseStatus(event, 400)
            return { error: 'invalid_grant' }
          }
          return {
            access_token: mode === 'expired' ? 'mock-expired-access-token' : 'mock-access-token',
            refresh_token: mode === 'revoked' ? 'mock-revoked-refresh-token' : 'mock-refresh-token',
            expires_in: mode === 'expired' || mode === 'revoked' ? 30 : 3600,
            scope: 'read:jira-work write:jira-work read:jira-user read:me offline_access',
            token_type: 'Bearer',
          }
        }
        if (body.grant_type === 'refresh_token') {
          refreshCount += 1
          await new Promise((resolve) => setTimeout(resolve, 75))
          if (mode === 'revoked' || body.refresh_token === 'mock-revoked-refresh-token') {
            setResponseStatus(event, 400)
            return { error: 'invalid_grant' }
          }
          return {
            access_token: 'mock-rotated-access-token',
            refresh_token: 'mock-rotated-refresh-token',
            expires_in: 3600,
            scope: 'read:jira-work write:jira-work read:jira-user read:me offline_access',
            token_type: 'Bearer',
          }
        }
        setResponseStatus(event, 400)
        return { error: 'unsupported_grant_type' }
      }),
    )
    .get(
      '/atlassian-api/oauth/token/accessible-resources',
      defineEventHandler(() =>
        mode === 'multi'
          ? [
              {
                id: 'fake-cloud-one',
                url: 'https://one.example.atlassian.net',
                name: 'Example One',
              },
              {
                id: 'fake-cloud-two',
                url: 'https://two.example.atlassian.net',
                name: 'Example Two',
              },
            ]
          : [
              {
                id: 'fake-cloud-one',
                url: 'https://one.example.atlassian.net',
                name: 'Example One',
              },
            ],
      ),
    )
    .get(
      '/atlassian-api/me',
      defineEventHandler(() => ({
        account_id: 'fake-atlassian-account',
        name: 'Example QA',
        email: 'qa@example.com',
        picture: 'https://avatar.example.test/fake.png',
      })),
    )
    .get(
      '/atlassian-api/ex/jira/:cloudId/rest/api/3/myself',
      defineEventHandler((event) => ({
        accountId: 'fake-atlassian-account',
        cloudId: event.context.params?.cloudId,
        displayName: 'Example QA',
      })),
    )
    .get(
      '/jira-site/rest/api/3/myself',
      defineEventHandler((event) => {
        apiTokenMyselfCount += 1
        const authorization = event.node.req.headers.authorization
        const expected = `Basic ${Buffer.from('qa@example.com:mock-valid-api-token').toString('base64')}`
        if (authorization !== expected) {
          setResponseStatus(event, 401)
          return { errorMessages: ['Unauthorized'] }
        }
        return {
          accountId: 'fake-atlassian-account',
          displayName: 'Example QA',
          emailAddress: 'qa@example.com',
          self: 'https://one.atlassian.net/rest/api/3/user?accountId=fake-atlassian-account',
        }
      }),
    )
  const app = createApp()
  app.use(router)
  return app
}

const port = Number(process.env.MOCK_SERVICES_PORT ?? 4010)
const server = createServer(toNodeListener(createMockApp()))

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(
      `Port ${port} is already in use. Stop the other process or set MOCK_SERVICES_PORT (and NUXT_MOCK_SERVICES_URL) to a free port.`,
    )
  } else {
    console.error(error)
  }
  process.exit(1)
})

server.listen(port, () => {
  console.log(`mock-services listening on http://localhost:${port}`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)))
}
