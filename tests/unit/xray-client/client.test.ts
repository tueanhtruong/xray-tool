import { beforeEach, describe, expect, it, vi } from 'vitest'
import { encryptSecret } from '~~/server/utils/crypto'
import { getWorkspaceXrayClient } from '~~/server/integrations/xray/client'

const workspaceId = 'workspace-xray-test'
const secretKey = Buffer.alloc(32, 23).toString('base64')
const contexts = {
  clientId: `XrayConnection:clientId:${workspaceId}`,
  clientSecret: `XrayConnection:clientSecret:${workspaceId}`,
  jwt: `XrayConnection:jwt:${workspaceId}`,
}

function jwt(exp = Math.floor(Date.now() / 1000) + 600): string {
  return `header.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.signature`
}

function okGraphql(data: unknown = { value: 'ok' }): Response {
  return new Response(JSON.stringify({ data }), { status: 200 })
}

describe('workspace Xray client', () => {
  let connection: {
    workspaceId: string
    region: 'GLOBAL'
    clientId: string
    clientSecret: string
    jwt: string | null
    jwtExpiresAt: Date | null
  }
  let fetchMock: ReturnType<typeof vi.fn>
  let authenticateCount: number
  let graphqlCount: number

  beforeEach(() => {
    vi.stubGlobal('useRuntimeConfig', () => ({
      integrationTarget: 'mock',
      mockServicesUrl: 'http://mock.test',
      xrayBaseUrl: '',
      encryptionKey: secretKey,
    }))
    vi.stubGlobal('usePrisma', () => ({
      xrayConnection: {
        findUnique: vi.fn(async () => ({ ...connection })),
        updateMany: vi.fn(async ({ where, data }: {
          where: { workspaceId: string; jwt?: string | null }
          data: Partial<typeof connection>
        }) => {
          if (where.workspaceId !== workspaceId || (where.jwt !== undefined && where.jwt !== connection.jwt)) {
            return { count: 0 }
          }
          connection = { ...connection, ...data }
          return { count: 1 }
        }),
      },
    }))
    connection = {
      workspaceId,
      region: 'GLOBAL',
      clientId: encryptSecret('client-id', { context: contexts.clientId }),
      clientSecret: encryptSecret('client-secret', { context: contexts.clientSecret }),
      jwt: encryptSecret(jwt(), { context: contexts.jwt }),
      jwtExpiresAt: new Date(Date.now() + 600_000),
    }
    authenticateCount = 0
    graphqlCount = 0
    fetchMock = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/api/v2/authenticate')) {
        authenticateCount += 1
        await new Promise((resolve) => setTimeout(resolve, 5))
        return new Response(JSON.stringify(jwt()), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      graphqlCount += 1
      if (init?.headers && new Headers(init.headers).get('authorization') !== `Bearer ${jwt()}`) {
        return new Response(JSON.stringify({ errors: [{ message: 'Unauthorized' }] }), { status: 401 })
      }
      return okGraphql({ value: 'ok' })
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  it('reuses a valid cached JWT for repeated GraphQL calls', async () => {
    const client = getWorkspaceXrayClient(workspaceId)
    for (let index = 0; index < 5; index += 1) {
      await expect(client.graphql<{ value: string }>('query { value }')).resolves.toEqual({ value: 'ok' })
    }
    expect(authenticateCount).toBe(0)
    expect(graphqlCount).toBe(5)
  })

  it('authenticates once for concurrent near-expiry requests', async () => {
    connection.jwtExpiresAt = new Date(Date.now() + 10_000)
    const client = getWorkspaceXrayClient(workspaceId)
    await Promise.all([
      client.graphql('query { a }'),
      client.graphql('query { b }'),
      client.graphql('query { c }'),
    ])
    expect(authenticateCount).toBe(1)
    expect(graphqlCount).toBe(3)
  })

  it('re-authenticates once on 401 and retries without looping', async () => {
    let unauthorized = 1
    fetchMock.mockImplementation(async (input: URL | RequestInfo) => {
      const url = String(input)
      if (url.endsWith('/api/v2/authenticate')) {
        authenticateCount += 1
        return new Response(JSON.stringify(jwt()), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      graphqlCount += 1
      if (unauthorized > 0) {
        unauthorized -= 1
        return new Response(JSON.stringify({ errors: [{ message: 'Unauthorized' }] }), { status: 401 })
      }
      return okGraphql({ recovered: true })
    })
    const client = getWorkspaceXrayClient(workspaceId)
    await expect(client.graphql('query { recovered }')).resolves.toEqual({ recovered: true })
    expect(authenticateCount).toBe(1)
    expect(graphqlCount).toBe(2)
  })

  it('honors 429 Retry-After and stops transient retries after three attempts', async () => {
    fetchMock.mockImplementation(async (input: URL | RequestInfo) => {
      if (String(input).endsWith('/api/v2/authenticate')) return new Response(jwt(), { status: 200 })
      graphqlCount += 1
      if (graphqlCount < 3) {
        return new Response('{}', { status: 429, headers: { 'retry-after': '0' } })
      }
      return okGraphql({ retried: true })
    })
    const client = getWorkspaceXrayClient(workspaceId)
    await expect(client.graphql('query { retried }')).resolves.toEqual({ retried: true })
    expect(graphqlCount).toBe(3)

    fetchMock.mockImplementation(async (input: URL | RequestInfo) => {
      if (String(input).endsWith('/api/v2/authenticate')) return new Response(jwt(), { status: 200 })
      graphqlCount += 1
      return new Response('{}', { status: 503 })
    })
    graphqlCount = 0
    await expect(client.graphql('query { fail }')).rejects.toThrow(/Xray GraphQL request failed/)
    expect(graphqlCount).toBe(3)
  })

  it('maps unsafe GraphQL upstream messages to a safe actionable error', async () => {
    fetchMock.mockImplementation(async (input: URL | RequestInfo) => {
      if (String(input).endsWith('/api/v2/authenticate')) return new Response(jwt(), { status: 200 })
      return new Response(JSON.stringify({ errors: [{ message: 'upstream leaked-secret-value' }] }), { status: 200 })
    })
    const client = getWorkspaceXrayClient(workspaceId)
    await expect(client.graphql('query { fail }')).rejects.toThrow(/Check the API key permissions/)
    await expect(client.graphql('query { fail }')).rejects.not.toThrow(/leaked-secret-value/)
  })
})
