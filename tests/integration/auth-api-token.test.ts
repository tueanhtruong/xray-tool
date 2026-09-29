import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import type { RunningServer } from '../support/built-server'
import { startBuiltServer } from '../support/built-server'
import { loadEnv, mockServicesUrl } from '../support/env'
import type { MockServicesHandle } from '../support/mock-services'
import { startMockServices } from '../support/mock-services'

loadEnv()

const mockUrl = mockServicesUrl()

async function queryRows<T extends pg.QueryResultRow>(query: string, params: unknown[] = []) {
  const client = new pg.Client({ connectionString: process.env.NUXT_DATABASE_URL_TEST })
  await client.connect()
  try {
    return (await client.query<T>(query, params)).rows
  } finally {
    await client.end()
  }
}

async function mockControl(body: Record<string, unknown>) {
  return fetch(new URL('/__control', mockUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function mockStatus() {
  const response = await fetch(new URL('/__control', mockUrl))
  return response.json() as Promise<{ apiTokenMyselfCount: number }>
}

async function signIn(server: RunningServer, body: Record<string, unknown>) {
  return fetch(`${server.url}/api/auth/jira/api-token`, {
    method: 'POST',
    headers: {
      origin: server.url,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    redirect: 'manual',
  })
}

async function oauthSignIn(server: RunningServer): Promise<string> {
  const start = await fetch(`${server.url}/auth/jira/login`, { redirect: 'manual' })
  const state = start.headers.get('set-cookie')?.split(';', 1)[0] ?? ''
  const authorization = await fetch(start.headers.get('location') ?? '', { redirect: 'manual' })
  const callback = await fetch(authorization.headers.get('location') ?? '', {
    headers: { cookie: state },
    redirect: 'manual',
  })
  return callback.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith('nuxt-session='))
    ?.split(';', 1)[0] ?? ''
}

async function expectJiraMyselfContract(server: RunningServer, sessionCookie: string) {
  const response = await fetch(`${server.url}/api/jira/myself`, {
    headers: { cookie: sessionCookie },
  })
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ accountId: 'fake-atlassian-account' })
}

describe('Jira API-token sign-in', () => {
  let server: RunningServer
  let mock: MockServicesHandle

  beforeAll(async () => {
    mock = await startMockServices(mockUrl)
    server = await startBuiltServer({
      NUXT_DATABASE_URL: process.env.NUXT_DATABASE_URL_TEST,
      NUXT_INTEGRATION_TARGET: 'mock',
      NUXT_MOCK_SERVICES_URL: mockUrl,
      NUXT_ATLASSIAN_CLIENT_ID: 'mock-client-id',
      NUXT_ATLASSIAN_CLIENT_SECRET: 'mock-client-secret',
      NUXT_ATLASSIAN_REDIRECT_URI: '__SERVER_URL__/auth/jira/callback',
    })
    await mockControl({ resetApiTokenMyselfCount: true })
  })

  afterAll(async () => {
    await server?.stop()
    await mock?.stop()
  })

  it('rejects unsafe site URLs before any outbound request', async () => {
    const invalidUrls = [
      'http://acme.atlassian.net',
      'https://169.254.169.254',
      'https://acme.atlassian.net.evil.io',
      'https://user:pw@acme.atlassian.net',
      'https://acme.atlassian.net:443',
      'https://acme.atlassian.net/path',
    ]
    for (const siteUrl of invalidUrls) {
      const response = await signIn(server, {
        siteUrl,
        email: 'qa@example.com',
        apiToken: 'mock-valid-api-token',
      })
      expect(response.status).toBe(400)
    }
    expect((await mockStatus()).apiTokenMyselfCount).toBe(0)
  })

  it('rejects invalid credentials without creating users, workspaces, or connections', async () => {
    const before = await queryRows<{ users: string; workspaces: string; connections: string }>(
      'SELECT (SELECT count(*) FROM "User") users, (SELECT count(*) FROM "Workspace") workspaces, (SELECT count(*) FROM "JiraConnection") connections',
    )
    const response = await signIn(server, {
      siteUrl: 'https://one.atlassian.net',
      email: 'qa@example.com',
      apiToken: 'wrong-token',
    })
    expect(response.status, `${await response.clone().text()}\n${server.output()}`).toBe(401)
    expect(await response.text()).toContain(
      'Jira rejected these credentials. Check the email and create a new API token at id.atlassian.com.',
    )
    const after = await queryRows<{ users: string; workspaces: string; connections: string }>(
      'SELECT (SELECT count(*) FROM "User") users, (SELECT count(*) FROM "Workspace") workspaces, (SELECT count(*) FROM "JiraConnection") connections',
    )
    expect(after).toEqual(before)
  })

  it('connects, encrypts the token, uses the shared Jira client, replaces, and disconnects', async () => {
    const response = await signIn(server, {
      siteUrl: 'https://one.atlassian.net',
      email: 'qa@example.com',
      apiToken: 'mock-valid-api-token',
    })
    expect(response.status, `${await response.clone().text()}\n${server.output()}`).toBe(303)
    const sessionCookie = response.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith('nuxt-session='))
      ?.split(';', 1)[0]
    expect(sessionCookie).toBeTruthy()
    expect(sessionCookie).not.toContain('mock-valid-api-token')

    const settings = await fetch(`${server.url}/api/auth/connection`, {
      headers: { cookie: sessionCookie ?? '' },
    })
    const settingsBody = await settings.text()
    expect(settings.status).toBe(200)
    expect(settingsBody).toContain('API_TOKEN')
    expect(settingsBody).toContain('qa@example.com')
    expect(settingsBody).not.toContain('mock-valid-api-token')

    const stored = await queryRows<{ apiToken: string; cloudId: string | null; siteOrigin: string }>(
      'SELECT c."apiToken", w."cloudId", w."siteOrigin" FROM "JiraConnection" c JOIN "Workspace" w ON w.id = c."workspaceId" WHERE c."authMethod" = \'API_TOKEN\'',
    )
    expect(stored[0]?.apiToken).toMatch(/^v1:/)
    expect(stored[0]?.apiToken).not.toContain('mock-valid-api-token')
    expect(stored[0]?.cloudId).toBeNull()
    expect(stored[0]?.siteOrigin).toBe('https://one.atlassian.net')

    const myself = await fetch(`${server.url}/api/jira/myself`, {
      headers: { cookie: sessionCookie ?? '' },
    })
    expect(myself.status).toBe(200)
    expect(await myself.text()).toContain('fake-atlassian-account')

    const replacement = await fetch(`${server.url}/api/auth/jira/api-token`, {
      method: 'PUT',
      headers: {
        cookie: sessionCookie ?? '',
        origin: server.url,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ apiToken: 'mock-valid-api-token' }),
    })
    expect(replacement.status).toBe(200)

    const disconnect = await fetch(`${server.url}/api/auth/connection`, {
      method: 'DELETE',
      headers: { cookie: sessionCookie ?? '', origin: server.url },
    })
    expect(disconnect.status).toBe(200)
    expect(
      await queryRows('SELECT id FROM "JiraConnection" WHERE "authMethod" = \'API_TOKEN\''),
    ).toHaveLength(0)

    const reconnect = await signIn(server, {
      siteUrl: 'https://one.atlassian.net',
      email: 'qa@example.com',
      apiToken: 'mock-valid-api-token',
    })
    expect(reconnect.status).toBe(303)
  })

  it('runs the same Jira-client contract for OAuth and API-token workspaces', async () => {
    await mockControl({ mode: 'single' })
    const oauthSession = await oauthSignIn(server)
    await expectJiraMyselfContract(server, oauthSession)

    const conflictingApiToken = await signIn(server, {
      siteUrl: 'https://one.example.atlassian.net',
      email: 'qa@example.com',
      apiToken: 'mock-valid-api-token',
    })
    expect(conflictingApiToken.status).toBe(409)
    expect(await conflictingApiToken.text()).toContain(
      'Sign in with Atlassian to open its settings, disconnect it, then connect with an API token.',
    )

    const apiTokenResponse = await signIn(server, {
      siteUrl: 'https://api-token-site.atlassian.net',
      email: 'qa@example.com',
      apiToken: 'mock-valid-api-token',
    })
    const apiTokenSession = apiTokenResponse.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith('nuxt-session='))
      ?.split(';', 1)[0] ?? ''
    await expectJiraMyselfContract(server, apiTokenSession)
  })

  it('limits API-token attempts before making excess Jira requests', async () => {
    await queryRows('DELETE FROM "ApiTokenSignInAttempt" RETURNING id')
    await mockControl({ resetApiTokenMyselfCount: true })
    const responses = []
    for (let index = 0; index < 11; index += 1) {
      responses.push(
        await signIn(server, {
          siteUrl: 'https://one.atlassian.net',
          email: 'qa@example.com',
          apiToken: 'wrong-token',
        }),
      )
    }
    expect(responses.map((response) => response.status)).toEqual([
      401, 401, 401, 401, 401, 401, 401, 401, 401, 401, 429,
    ])
    expect((await mockStatus()).apiTokenMyselfCount).toBe(10)
  })
})
