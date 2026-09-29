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
  const router = createRouter()
    .get(
      '/health',
      defineEventHandler(() => ({ status: 'ok', service: 'mock-services' })),
    )
    .post(
      '/__control',
      defineEventHandler(async (event) => {
        const body = (await readBody(event)) as { mode?: unknown; resetRefreshCount?: unknown }
        if (typeof body.mode === 'string') mode = body.mode
        if (body.resetRefreshCount === true) refreshCount = 0
        return { mode, refreshCount }
      }),
    )
    .get(
      '/__control',
      defineEventHandler(() => ({ mode, refreshCount })),
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
