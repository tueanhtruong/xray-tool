import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import type { RunningServer } from '../support/built-server'
import { startBuiltServer } from '../support/built-server'
import { loadEnv, mockServicesUrl } from '../support/env'
import type { MockServicesHandle } from '../support/mock-services'
import { startMockServices } from '../support/mock-services'

loadEnv()

const mockUrl = mockServicesUrl()
const testConfig = {
  NUXT_DATABASE_URL: process.env.NUXT_DATABASE_URL_TEST,
  NUXT_INTEGRATION_TARGET: 'mock',
  NUXT_MOCK_SERVICES_URL: mockUrl,
  NUXT_ATLASSIAN_CLIENT_ID: 'mock-client-id',
  NUXT_ATLASSIAN_CLIENT_SECRET: 'mock-client-secret',
  NUXT_ATLASSIAN_REDIRECT_URI: '__SERVER_URL__/auth/jira/callback',
}

async function queryRows<T extends pg.QueryResultRow>(
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

function cookiePair(header: string | null): string | undefined {
  return header?.split(';', 1)[0]
}

async function redirectLocation(response: Response, baseUrl: string): Promise<string> {
  const location = response.headers.get('location')
  if (!location) {
    throw new Error(`Expected redirect location, got ${response.status}: ${await response.text()}`)
  }
  return new URL(location, baseUrl).toString()
}

async function startLogin(server: RunningServer) {
  const response = await fetch(`${server.url}/auth/jira/login`, { redirect: 'manual' })
  if (response.status >= 500)
    throw new Error(`Login failed: ${await response.text()}\n${server.output()}`)
  return { response, cookie: cookiePair(response.headers.get('set-cookie')) }
}

describe('Jira OAuth sign-in', () => {
  let server: RunningServer
  let mock: MockServicesHandle

  beforeAll(async () => {
    mock = await startMockServices(mockUrl)
    server = await startBuiltServer({
      ...testConfig,
    })
  })
  afterAll(async () => {
    await server?.stop()
    await mock?.stop()
  })

  it('shows login for public routes and rejects protected API calls while signed out', async () => {
    const page = await fetch(`${server.url}/login`)
    expect(page.status).toBe(200)
    const api = await fetch(`${server.url}/api/auth/session`)
    expect(api.status).toBe(401)
    const landing = await fetch(server.url, { redirect: 'manual' })
    expect(landing.status).toBe(200)
    const protectedPage = await fetch(`${server.url}/settings`, { redirect: 'manual' })
    expect(protectedPage.status).toBe(302)
    expect(protectedPage.headers.get('location')).toBe('/login?next=%2Fsettings')
  })

  it('requires OAuth settings at sign-in time and keeps them optional at startup', async () => {
    const missingConfigServer = await startBuiltServer({
      NUXT_DATABASE_URL: process.env.NUXT_DATABASE_URL_TEST,
      NUXT_INTEGRATION_TARGET: 'mock',
      NUXT_MOCK_SERVICES_URL: mockUrl,
      NUXT_ATLASSIAN_CLIENT_ID: '',
      NUXT_ATLASSIAN_CLIENT_SECRET: '',
      NUXT_ATLASSIAN_REDIRECT_URI: '',
    })
    try {
      const response = await fetch(`${missingConfigServer.url}/auth/jira/login`)
      expect(response.status).toBe(503)
      const body = await response.text()
      expect(body).toContain('NUXT_ATLASSIAN_CLIENT_ID')
      expect(body).toContain('NUXT_ATLASSIAN_REDIRECT_URI')
      expect(body).not.toContain('mock-client-secret')
    } finally {
      await missingConfigServer.stop()
    }
  })

  it('requires a session password before issuing signed OAuth state', async () => {
    const serverWithoutSessionPassword = await startBuiltServer({
      ...testConfig,
      NUXT_SESSION_PASSWORD: '',
    })
    try {
      const response = await fetch(`${serverWithoutSessionPassword.url}/auth/jira/login`)
      expect(response.status).toBe(503)
      expect(await response.text()).toContain('NUXT_SESSION_PASSWORD')
      expect(response.headers.get('set-cookie')).toBeNull()
    } finally {
      await serverWithoutSessionPassword.stop()
    }
  })

  it('rejects a state mismatch before any user or token is persisted', async () => {
    const before = Number(
      (await queryRows<{ count: string }>('SELECT count(*) FROM "User"'))[0]?.count,
    )
    const login = await startLogin(server)
    expect(login.cookie).toContain('jira_oauth_state=')
    const cookie = cookiePair(login.response.headers.get('set-cookie')) ?? ''
    const location = await redirectLocation(login.response, server.url)
    const authorizeResponse = await fetch(location, { redirect: 'manual' })
    const callback = new URL(await redirectLocation(authorizeResponse, server.url))
    callback.searchParams.set('state', 'incorrect-state')
    const rejected = await fetch(callback, { headers: { cookie }, redirect: 'manual' })
    expect(rejected.status).toBe(302)
    expect(rejected.headers.get('location')).toContain('verification-failed')
    expect(
      Number((await queryRows<{ count: string }>('SELECT count(*) FROM "User"'))[0]?.count),
    ).toBe(before)
  })

  it('creates an ID-only sealed session after a successful single-site sign-in', async () => {
    await fetch(new URL('/__control', mockUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'single' }),
    })
    const login = await startLogin(server).then(({ response }) => response)
    const stateCookie = cookiePair(login.headers.get('set-cookie')) ?? ''
    const authorization = await fetch(await redirectLocation(login, server.url), {
      redirect: 'manual',
    })
    const callbackUrl = await redirectLocation(authorization, server.url)
    const callback = await fetch(callbackUrl, {
      headers: { cookie: stateCookie },
      redirect: 'manual',
    })
    expect(callback.status).toBe(302)
    expect(callback.headers.get('location')).toBe('/repository')
    const cookies = callback.headers.getSetCookie()
    const sessionCookie = cookies.find((value) => value.startsWith('nuxt-session='))
    expect(sessionCookie).toBeDefined()
    expect(sessionCookie).toContain('HttpOnly')
    expect(sessionCookie).toContain('SameSite=Lax')
    const sessionValue = cookiePair(sessionCookie ?? null) ?? ''
    expect(sessionValue).not.toContain('mock-access-token')
    expect(sessionValue).not.toContain('mock-refresh-token')

    const session = await fetch(`${server.url}/api/auth/session`, {
      headers: { cookie: sessionValue },
    })
    expect(session.status).toBe(200)
    const body = await session.json()
    expect(body).toMatchObject({ workspace: { name: 'Example One' } })
    expect(JSON.stringify(body)).not.toMatch(/token|secret/i)
    const tokenRows = await queryRows<{ accessToken: string; refreshToken: string }>(
      'SELECT "accessToken", "refreshToken" FROM "JiraConnection" ORDER BY "createdAt" DESC LIMIT 1',
    )
    expect(tokenRows[0]?.accessToken).not.toContain('mock-access-token')
    expect(tokenRows[0]?.refreshToken).not.toContain('mock-refresh-token')
    expect(tokenRows[0]?.accessToken).toMatch(/^v1:/)
    expect(tokenRows[0]?.refreshToken).toMatch(/^v1:/)
  })

  it('requires a site choice for multiple sites and persists only the chosen site', async () => {
    await fetch(new URL('/__control', mockUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'multi' }),
    })
    const login = await startLogin(server).then(({ response }) => response)
    const stateCookie = cookiePair(login.headers.get('set-cookie')) ?? ''
    const authorization = await fetch(await redirectLocation(login, server.url), {
      redirect: 'manual',
    })
    const callback = await fetch(await redirectLocation(authorization, server.url), {
      headers: { cookie: stateCookie },
      redirect: 'manual',
    })
    expect(callback.headers.get('location')).toBe('/auth/jira/select-site')
    const pendingCookie = callback.headers
      .getSetCookie()
      .find((value) => value.startsWith('jira_oauth_pending='))
    expect(pendingCookie).toBeDefined()
    const pendingPair = cookiePair(pendingCookie ?? null) ?? ''
    const sitesResponse = await fetch(`${server.url}/api/auth/jira/sites`, {
      headers: { cookie: pendingPair },
    })
    const sites = await sitesResponse.json()
    expect(sites.sites).toHaveLength(2)
    expect(JSON.stringify(sites)).not.toMatch(/token|secret/i)
    const selected = await fetch(`${server.url}/api/auth/jira/select-site`, {
      method: 'POST',
      headers: { cookie: pendingPair, 'content-type': 'application/json', origin: server.url },
      body: JSON.stringify({ cloudId: 'fake-cloud-two' }),
      redirect: 'manual',
    })
    expect(selected.status).toBe(200)
    expect(await selected.json()).toEqual({ redirectTo: '/repository' })
    const workspaceCounts = await queryRows<{ cloudId: string; count: string }>(
      'SELECT "cloudId", count(*) FROM "Workspace" WHERE "cloudId" IN ($1, $2) GROUP BY "cloudId"',
      ['fake-cloud-two', 'fake-cloud-one'],
    )
    expect(workspaceCounts).toContainEqual({ cloudId: 'fake-cloud-two', count: '1' })
    expect(workspaceCounts).toContainEqual({ cloudId: 'fake-cloud-one', count: '1' })
  })

  it('sends user-denied consent back to login with an explanation', async () => {
    await fetch(new URL('/__control', mockUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'denied' }),
    })
    const login = await startLogin(server).then(({ response }) => response)
    const stateCookie = cookiePair(login.headers.get('set-cookie')) ?? ''
    const authorization = await fetch(await redirectLocation(login, server.url), {
      redirect: 'manual',
    })
    const callback = await fetch(await redirectLocation(authorization, server.url), {
      headers: { cookie: stateCookie },
      redirect: 'manual',
    })
    expect(callback.headers.get('location')).toContain('access-denied')
  })

  it('rejects a user-denial callback without a valid state cookie', async () => {
    const callback = await fetch(
      `${server.url}/auth/jira/callback?error=access_denied&state=forged-state`,
      { redirect: 'manual' },
    )
    expect(callback.headers.get('location')).toContain('verification-failed')
  })

  it('rejects an invalid authorization code without creating a user', async () => {
    await fetch(new URL('/__control', mockUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'invalid-code' }),
    })
    const before = Number(
      (await queryRows<{ count: string }>('SELECT count(*) FROM "User"'))[0]?.count,
    )
    const login = await startLogin(server)
    const stateCookie = cookiePair(login.response.headers.get('set-cookie')) ?? ''
    const authorization = await fetch(await redirectLocation(login.response, server.url), {
      redirect: 'manual',
    })
    const callback = await fetch(await redirectLocation(authorization, server.url), {
      headers: { cookie: stateCookie },
      redirect: 'manual',
    })
    expect(callback.headers.get('location')).toContain('message=oauth-failed')
    expect(
      Number((await queryRows<{ count: string }>('SELECT count(*) FROM "User"'))[0]?.count),
    ).toBe(before)
  })

  it('updates the existing account and selected-site workspace on repeat sign-in', async () => {
    await fetch(new URL('/__control', mockUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'single' }),
    })
    const before = await queryRows<{ users: string; workspaces: string }>(
      'SELECT (SELECT count(*) FROM "User") users, (SELECT count(*) FROM "Workspace" WHERE "cloudId" = $1) workspaces',
      ['fake-cloud-one'],
    )
    const login = await startLogin(server)
    const stateCookie = cookiePair(login.response.headers.get('set-cookie')) ?? ''
    const authorization = await fetch(await redirectLocation(login.response, server.url), {
      redirect: 'manual',
    })
    const callback = await fetch(await redirectLocation(authorization, server.url), {
      headers: { cookie: stateCookie },
      redirect: 'manual',
    })
    expect(callback.headers.get('location')).toBe('/repository')
    const after = await queryRows<{ users: string; workspaces: string }>(
      'SELECT (SELECT count(*) FROM "User") users, (SELECT count(*) FROM "Workspace" WHERE "cloudId" = $1) workspaces',
      ['fake-cloud-one'],
    )
    expect(after).toEqual(before)
  })

  it('rejects an untrusted Origin for the site-selection mutation', async () => {
    await fetch(new URL('/__control', mockUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'multi' }),
    })
    const login = await startLogin(server)
    const stateCookie = cookiePair(login.response.headers.get('set-cookie')) ?? ''
    const authorization = await fetch(await redirectLocation(login.response, server.url), {
      redirect: 'manual',
    })
    const callback = await fetch(await redirectLocation(authorization, server.url), {
      headers: { cookie: stateCookie },
      redirect: 'manual',
    })
    const pending = callback.headers
      .getSetCookie()
      .find((value) => value.startsWith('jira_oauth_pending='))
    const selected = await fetch(`${server.url}/api/auth/jira/select-site`, {
      method: 'POST',
      headers: {
        cookie: cookiePair(pending ?? null) ?? '',
        'content-type': 'application/json',
        origin: 'https://attacker.example',
      },
      body: JSON.stringify({ cloudId: 'fake-cloud-two' }),
    })
    expect(selected.status).toBe(403)
  })
})
