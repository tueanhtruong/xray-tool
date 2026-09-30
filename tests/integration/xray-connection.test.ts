import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import pg from 'pg'
import type { RunningServer } from '../support/built-server'
import { startBuiltServer } from '../support/built-server'
import { loadEnv, mockServicesUrl, TEST_ENCRYPTION_KEY } from '../support/env'
import type { MockServicesHandle } from '../support/mock-services'
import { startMockServices } from '../support/mock-services'
import { getWorkspaceXrayClient } from '../../server/integrations/xray/client'
import { usePrisma } from '../../server/utils/prisma'

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

async function signIn(server: RunningServer): Promise<string> {
  const start = await fetch(`${server.url}/auth/jira/login`, { redirect: 'manual' })
  const stateCookie = start.headers.get('set-cookie')?.split(';', 1)[0] ?? ''
  const authorization = await fetch(start.headers.get('location') ?? '', { redirect: 'manual' })
  const callback = await fetch(authorization.headers.get('location') ?? '', {
    headers: { cookie: stateCookie },
    redirect: 'manual',
  })
  return callback.headers.getSetCookie()
    .find((cookie) => cookie.startsWith('nuxt-session='))
    ?.split(';', 1)[0] ?? ''
}

async function configureXray(server: RunningServer, cookie: string, body = {
  region: 'EU',
  clientId: 'mock-xray-client-id',
  clientSecret: 'mock-xray-client-secret',
}) {
  return fetch(`${server.url}/api/auth/xray`, {
    method: 'PUT',
    headers: {
      cookie,
      origin: server.url,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

describe('Xray workspace connection', () => {
  let server: RunningServer
  let mock: MockServicesHandle
  let sessionCookie: string

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
    sessionCookie = await signIn(server)
    await mockControl({ xrayMode: 'valid', resetXrayCounts: true })
  })

  afterAll(async () => {
    await server?.stop()
    await mock?.stop()
  })

  it('verifies before persisting, stores ciphertext only, and returns safe status', async () => {
    const response = await configureXray(server, sessionCookie)
    expect(response.status, `${await response.clone().text()}\n${server.output()}`).toBe(200)
    expect(await response.json()).toMatchObject({ status: 'connected', region: 'EU' })

    const stored = await queryRows<{
      region: string
      clientId: string
      clientSecret: string
      jwt: string | null
      jwtExpiresAt: Date | null
    }>(
      'SELECT region, "clientId", "clientSecret", jwt, "jwtExpiresAt" FROM "XrayConnection"',
    )
    expect(stored).toHaveLength(1)
    expect(stored[0]?.region).toBe('EU')
    expect(stored[0]?.clientId).toMatch(/^v1:/)
    expect(stored[0]?.clientSecret).toMatch(/^v1:/)
    expect(stored[0]?.jwt).toMatch(/^v1:/)
    expect(stored[0]?.clientId).not.toContain('mock-xray-client-id')
    expect(stored[0]?.clientSecret).not.toContain('mock-xray-client-secret')

    const status = await fetch(`${server.url}/api/auth/xray`, { headers: { cookie: sessionCookie } })
    const statusText = await status.text()
    expect(status.status).toBe(200)
    expect(statusText).toContain('EU')
    expect(statusText).not.toContain('mock-xray-client-id')
    expect(statusText).not.toContain('mock-xray-client-secret')
    expect(statusText).not.toContain(stored[0]?.jwt)
    expect(sessionCookie).not.toContain('mock-xray-client-secret')
    expect(server.output()).not.toContain('mock-xray-client-secret')

    const counts = await (await fetch(new URL('/__control', mockUrl))).json() as {
      xrayAuthenticateCount: number
    }
    expect(counts.xrayAuthenticateCount).toBe(1)
  })

  it('does not persist invalid initial credentials and preserves an existing connection', async () => {
    const before = await queryRows<{ clientId: string; clientSecret: string; region: string }>(
      'SELECT "clientId", "clientSecret", region FROM "XrayConnection"',
    )
    await mockControl({ xrayMode: 'invalid-credentials' })
    const rejected = await configureXray(server, sessionCookie, {
      region: 'AU',
      clientId: 'mock-xray-client-id',
      clientSecret: 'invalid-secret',
    })
    expect(rejected.status).toBe(401)
    expect(await rejected.text()).toContain(
      'Xray rejected these API keys. Create a key in Jira > Apps > Xray > API Keys.',
    )
    const after = await queryRows<{ clientId: string; clientSecret: string; region: string }>(
      'SELECT "clientId", "clientSecret", region FROM "XrayConnection"',
    )
    expect(after).toEqual(before)
    expect(server.output()).not.toContain('invalid-secret')
    await mockControl({ xrayMode: 'valid' })
  })

  it('requires same-origin writes and does not disclose status without a session', async () => {
    const unauthenticated = await fetch(`${server.url}/api/auth/xray`)
    expect(unauthenticated.status).toBe(401)
    const wrongOrigin = await fetch(`${server.url}/api/auth/xray`, {
      method: 'PUT',
      headers: { cookie: sessionCookie, origin: 'https://attacker.example', 'content-type': 'application/json' },
      body: JSON.stringify({ region: 'GLOBAL', clientId: 'x', clientSecret: 'y' }),
    })
    expect(wrongOrigin.status).toBe(403)
  })

  it('reuses and refreshes JWTs and bounds GraphQL 401/429/503 retries', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({
      databaseUrl: process.env.NUXT_DATABASE_URL_TEST,
      encryptionKey: TEST_ENCRYPTION_KEY,
      integrationTarget: 'mock',
      mockServicesUrl: mockUrl,
      xrayBaseUrl: '',
    }))
    vi.stubGlobal('usePrisma', usePrisma)
    const rows = await queryRows<{ workspaceId: string }>(
      'SELECT "workspaceId" FROM "XrayConnection" LIMIT 1',
    )
    const workspaceId = rows[0]?.workspaceId
    expect(workspaceId).toBeTruthy()
    const client = getWorkspaceXrayClient(workspaceId ?? '')

    await mockControl({ xrayMode: 'valid', resetXrayCounts: true })
    const repeated = await Promise.all(
      Array.from({ length: 5 }, () => client.graphql<{ query: string }>('query { repeated }')),
    )
    expect(repeated).toHaveLength(5)
    let counts = await (await fetch(new URL('/__control', mockUrl))).json() as {
      xrayAuthenticateCount: number
      xrayGraphqlCount: number
    }
    expect(counts).toMatchObject({ xrayAuthenticateCount: 0, xrayGraphqlCount: 5 })

    await queryRows(
      'UPDATE "XrayConnection" SET "jwtExpiresAt" = now() + interval \'10 seconds\' WHERE "workspaceId" = $1',
      [workspaceId],
    )
    await Promise.all([
      client.graphql('query { refreshOne }'),
      client.graphql('query { refreshTwo }'),
      client.graphql('query { refreshThree }'),
    ])
    counts = await (await fetch(new URL('/__control', mockUrl))).json() as typeof counts
    expect(counts.xrayAuthenticateCount).toBe(1)

    await mockControl({ xrayUnauthorizedRemaining: 1 })
    await expect(client.graphql('query { unauthorizedRecovery }')).resolves.toBeDefined()
    counts = await (await fetch(new URL('/__control', mockUrl))).json() as typeof counts
    expect(counts.xrayAuthenticateCount).toBe(2)

    await mockControl({ xrayRateLimitRemaining: 1 })
    await expect(client.graphql('query { rateLimitRetry }')).resolves.toBeDefined()
    await mockControl({ xrayUnavailableRemaining: 1 })
    await expect(client.graphql('query { unavailableRetry }')).resolves.toBeDefined()

    await mockControl({ xrayMode: 'graphql-errors' })
    await expect(client.graphql('query { permissionDenied }'))
      .rejects.toThrow('Xray API key lacks permission for project DEMO.')
    vi.unstubAllGlobals()
  })
})
