import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadEnv, mockServicesUrl } from '../support/env'
import type { MockServicesHandle } from '../support/mock-services'
import { isMockHealthy, startMockServices } from '../support/mock-services'

loadEnv()

const baseUrl = mockServicesUrl()

describe('mock services', () => {
  let mock: MockServicesHandle

  // With NUXT_INTEGRATION_TARGET=mock the global setup already started (or reused)
  // the mock; otherwise this starts one for the duration of the file.
  beforeAll(async () => {
    mock = await startMockServices(baseUrl)
  })
  afterAll(() => mock?.stop())

  it('GET /health returns 200 with status ok', async () => {
    const res = await fetch(new URL('/health', baseUrl))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok', service: 'mock-services' })
  })

  it('returns 404 for an unimplemented route', async () => {
    const res = await fetch(new URL('/xray/anything', baseUrl))
    expect(res.status).toBe(404)
  })

  it('provides deterministic Xray authentication, GraphQL, and controlled failure modes', async () => {
    const control = new URL('/__control', baseUrl)
    const reset = await fetch(control, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ xrayMode: 'valid', resetXrayCounts: true }),
    })
    expect(reset.status).toBe(200)

    const authUrl = new URL('/xray/api/v2/authenticate', baseUrl)
    const authenticate = () => fetch(authUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id: 'mock-xray-client-id',
        client_secret: 'mock-xray-client-secret',
      }),
    })
    const auth = await authenticate()
    expect(auth.status).toBe(200)
    const jwt = await auth.text()
    expect(jwt.split('.')).toHaveLength(3)

    const graphqlUrl = new URL('/xray/api/v2/graphql', baseUrl)
    const graphql = (authorization: string) => fetch(graphqlUrl, {
      method: 'POST',
      headers: { authorization, 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'query { example }', variables: { value: 1 } }),
    })
    const result = await graphql(`Bearer ${jwt}`)
    expect(await result.json()).toEqual({
      data: { query: 'query { example }', variables: { value: 1 } },
    })

    await fetch(control, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ xrayMode: 'invalid-credentials' }),
    })
    expect((await authenticate()).status).toBe(401)

    await fetch(control, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        xrayMode: 'valid',
        xrayUnauthorizedRemaining: 1,
        xrayRateLimitRemaining: 1,
        xrayUnavailableRemaining: 1,
      }),
    })
    expect((await graphql(`Bearer ${jwt}`)).status).toBe(401)
    expect((await graphql(`Bearer ${jwt}`)).headers.get('retry-after')).toBe('0')
    expect((await graphql(`Bearer ${jwt}`)).status).toBe(503)
    const counts = await (await fetch(control)).json() as {
      xrayAuthenticateCount: number
      xrayGraphqlCount: number
    }
    expect(counts).toMatchObject({ xrayAuthenticateCount: 2, xrayGraphqlCount: 4 })
  })

  it('provides deterministic Atlassian OAuth and multi-site scenarios', async () => {
    const control = new URL('/__control', baseUrl)
    const update = await fetch(control, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'multi', resetRefreshCount: true }),
    })
    expect(update.status).toBe(200)

    const auth = new URL('/atlassian-auth/authorize', baseUrl)
    auth.search = new URLSearchParams({
      redirect_uri: 'http://localhost:3000/auth/jira/callback',
      state: 'fake-state',
    }).toString()
    const authorize = await fetch(auth, { redirect: 'manual' })
    expect(authorize.status).toBe(302)
    const callback = new URL(authorize.headers.get('location') ?? '')
    expect(callback.searchParams.get('state')).toBe('fake-state')
    expect(callback.searchParams.get('code')).toBe('test-code')

    const sites = await fetch(new URL('/atlassian-api/oauth/token/accessible-resources', baseUrl))
    expect(await sites.json()).toHaveLength(2)

    const tokenResponse = await fetch(new URL('/atlassian-auth/oauth/token', baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ grant_type: 'authorization_code', code: 'test-code' }),
    })
    expect(tokenResponse.status).toBe(200)
    expect(await tokenResponse.json()).toMatchObject({
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
    })

    const current = await fetch(control)
    expect(await current.json()).toMatchObject({ mode: 'multi', refreshCount: 0 })
    await fetch(new URL('/atlassian-auth/oauth/token', baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: 'mock-refresh-token',
      }),
    })
    expect(await (await fetch(control)).json()).toMatchObject({ refreshCount: 1 })
    await fetch(control, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'single' }),
    })
  })

  it('reuses an already-running mock and does not stop it', async () => {
    const second = await startMockServices(baseUrl)
    expect(second.started).toBe(false)
    await second.stop()
    expect(await isMockHealthy(baseUrl)).toBe(true)
  })
})
