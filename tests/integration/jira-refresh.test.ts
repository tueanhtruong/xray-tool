import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import type { RunningServer } from '../support/built-server'
import { startBuiltServer } from '../support/built-server'
import { loadEnv, mockServicesUrl } from '../support/env'
import type { MockServicesHandle } from '../support/mock-services'
import { startMockServices } from '../support/mock-services'

loadEnv()

const mockUrl = mockServicesUrl()

async function dbQuery<T extends pg.QueryResultRow>(
  query: string,
  params: unknown[] = [],
): Promise<T[]> {
  const client = new pg.Client({ connectionString: process.env.NUXT_DATABASE_URL_TEST })
  await client.connect()
  try {
    return (await client.query<T>(query, params)).rows
  } finally {
    await client.end()
  }
}

async function control(mode: string, resetRefreshCount = false) {
  return fetch(new URL('/__control', mockUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode, resetRefreshCount }),
  })
}

async function login(server: RunningServer): Promise<string> {
  const start = await fetch(`${server.url}/auth/jira/login`, { redirect: 'manual' })
  const stateCookie = start.headers.get('set-cookie')?.split(';', 1)[0] ?? ''
  const authorization = await fetch(start.headers.get('location') ?? '', { redirect: 'manual' })
  const callback = await fetch(authorization.headers.get('location') ?? '', {
    headers: { cookie: stateCookie },
    redirect: 'manual',
  })
  const cookie = callback.headers.getSetCookie().find((entry) => entry.startsWith('nuxt-session='))
  return cookie?.split(';', 1)[0] ?? ''
}

describe('workspace Jira token refresh', () => {
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
  })
  afterAll(async () => {
    await server?.stop()
    await mock?.stop()
  })

  it('single-flights concurrent refreshes and persists rotated encrypted credentials', async () => {
    await control('single', true)
    const sessionCookie = await login(server)
    const workspace = await dbQuery<{ id: string }>(
      'SELECT id FROM "Workspace" WHERE "cloudId" = $1 LIMIT 1',
      ['fake-cloud-one'],
    )
    const workspaceId = workspace[0]?.id
    expect(workspaceId).toBeTruthy()
    await dbQuery(
      'UPDATE "JiraConnection" SET "expiresAt" = now() + interval \'30 seconds\' WHERE "workspaceId" = $1',
      [workspaceId],
    )
    const expiry = await dbQuery<{ expiresAt: Date }>(
      'SELECT "expiresAt" FROM "JiraConnection" WHERE "workspaceId" = $1',
      [workspaceId],
    )
    expect(new Date(expiry[0]?.expiresAt ?? 0).getTime() - Date.now()).toBeLessThan(60_000)

    const requests = await Promise.all(
      Array.from({ length: 5 }, () =>
        fetch(`${server.url}/api/jira/myself`, { headers: { cookie: sessionCookie } }),
      ),
    )
    const requestBodies = await Promise.all(requests.map((response) => response.clone().text()))
    expect(
      requests.map((response) => response.status),
      requestBodies.join('\n'),
    ).toEqual([200, 200, 200, 200, 200])
    const status = await fetch(new URL('/__control', mockUrl))
    expect((await status.json()).refreshCount, requestBodies.join('\n')).toBe(1)

    const tokens = await dbQuery<{ accessToken: string; refreshToken: string }>(
      'SELECT "accessToken", "refreshToken" FROM "JiraConnection" WHERE "workspaceId" = $1',
      [workspaceId],
    )
    expect(tokens[0]?.accessToken).toMatch(/^v1:/)
    expect(tokens[0]?.refreshToken).toMatch(/^v1:/)
    expect(tokens[0]?.accessToken).not.toContain('mock-rotated-access-token')
    expect(tokens[0]?.refreshToken).not.toContain('mock-rotated-refresh-token')
  })

  it('clears the session and requires sign-in again when refresh is revoked', async () => {
    await control('revoked', true)
    const sessionCookie = await login(server)
    const workspace = await dbQuery<{ id: string }>(
      'SELECT id FROM "Workspace" WHERE "cloudId" = $1 LIMIT 1',
      ['fake-cloud-one'],
    )
    const workspaceId = workspace[0]?.id
    await dbQuery(
      'UPDATE "JiraConnection" SET "expiresAt" = now() + interval \'30 seconds\', "invalidatedAt" = NULL WHERE "workspaceId" = $1',
      [workspaceId],
    )
    const response = await fetch(`${server.url}/api/jira/myself`, {
      headers: { cookie: sessionCookie },
    })
    expect(response.status).toBe(401)
    const cookies = response.headers.getSetCookie()
    expect(
      cookies.some((value) => value.startsWith('nuxt-session=')),
      JSON.stringify(cookies),
    ).toBe(true)
    const nextPage = await fetch(server.url, { redirect: 'manual' })
    expect(nextPage.status).toBe(302)
    expect(nextPage.headers.get('location')).toBe('/login')
  })
})
