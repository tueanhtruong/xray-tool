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

async function control(body: Record<string, unknown>) {
  await fetch(new URL('/__control', mockUrl), {
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
  return callback.headers.getSetCookie().find((cookie) => cookie.startsWith('nuxt-session='))?.split(';', 1)[0] ?? ''
}

describe('folder pull', () => {
  let server: RunningServer
  let mock: MockServicesHandle
  let cookie = ''

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
    cookie = await signIn(server)
    await control({ xrayMode: 'valid', xrayFolderMode: 'flat', xrayFolderFailurePath: '' })
    await fetch(`${server.url}/api/auth/xray`, {
      method: 'PUT',
      headers: { cookie, origin: server.url, 'content-type': 'application/json' },
      body: JSON.stringify({ region: 'EU', clientId: 'mock-xray-client-id', clientSecret: 'mock-xray-client-secret' }),
    })
    await fetch(`${server.url}/api/jira/projects?q=ONEDS`, { headers: { cookie } })
    await fetch(`${server.url}/api/project`, {
      method: 'PUT',
      headers: { cookie, origin: server.url, 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: '10001' }),
    })
    const session = await (await fetch(`${server.url}/api/auth/session`, { headers: { cookie } })).json() as { workspace: { id: string } }
    await queryRows(`DELETE FROM "Folder" WHERE "workspaceId"=$1`, [session.workspace.id])
    await new Promise((resolve) => setTimeout(resolve, 25))
  })

  afterAll(async () => {
    await server?.stop()
    await mock?.stop()
  })

  it('pulls nested folders, deletes stale rows, and leaves unchanged rows untouched', async () => {
    const response = await fetch(`${server.url}/api/pull/folders`, {
      method: 'POST', headers: { cookie, origin: server.url },
    })
    expect(response.status).toBe(200)
    const started = await response.json() as { state: string }
    expect(started.state).toBe('running')
    let status: { state: string; message?: string } | undefined
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20))
      status = await (await fetch(`${server.url}/api/pull/status`, { headers: { cookie } })).json() as typeof status
      if (status?.state !== 'running') break
    }
    expect(status).toMatchObject({ state: 'succeeded', message: 'Pulled 4 folders' })
    expect(server.logs().some((entry) => entry.msg === 'folder pull started')).toBe(true)
    expect(server.output()).toContain('"msg":"folder pull completed"')
    expect(server.output()).toContain('"created":4')
    expect(server.output()).toContain('"durationMs":')
    const rows = await queryRows<{ path: string; parentPath: string | null }>(
      'SELECT path, "parentPath" FROM "Folder" ORDER BY path',
    )
    expect(rows).toEqual([
      { path: '/Autocomplete', parentPath: '/' },
      { path: '/Autocomplete/Focus', parentPath: '/Autocomplete' },
      { path: '/Billing', parentPath: '/' },
      { path: '/Search', parentPath: '/' },
    ])
    const before = await queryRows<{ pulledAt: Date }>('SELECT "pulledAt" FROM "Folder" ORDER BY path')
    await new Promise((resolve) => setTimeout(resolve, 5))
    await fetch(`${server.url}/api/pull/folders`, { method: 'POST', headers: { cookie, origin: server.url } })
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20))
      status = await (await fetch(`${server.url}/api/pull/status`, { headers: { cookie } })).json() as typeof status
      if (status?.state !== 'running') break
    }
    const after = await queryRows<{ pulledAt: Date }>('SELECT "pulledAt" FROM "Folder" ORDER BY path')
    expect(after).toEqual(before)
    await control({ xrayFolderMode: 'empty' })
    await fetch(`${server.url}/api/pull/folders`, { method: 'POST', headers: { cookie, origin: server.url } })
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20))
      status = await (await fetch(`${server.url}/api/pull/status`, { headers: { cookie } })).json() as typeof status
      if (status?.state !== 'running') break
    }
    expect(await queryRows('SELECT id FROM "Folder"')).toHaveLength(0)
  })

  it('preserves the previous cache when a nested folder request fails', async () => {
    await control({ xrayFolderMode: 'flat', xrayFolderFailurePath: '' })
    await fetch(`${server.url}/api/pull/folders`, { method: 'POST', headers: { cookie, origin: server.url } })
    await new Promise((resolve) => setTimeout(resolve, 100))
    const before = await queryRows<{ path: string; pulledAt: Date }>('SELECT path, "pulledAt" FROM "Folder" ORDER BY path')
    await control({ xrayFolderMode: 'deep', xrayFolderFailurePath: '/Level1/Level2' })
    await fetch(`${server.url}/api/pull/folders`, { method: 'POST', headers: { cookie, origin: server.url } })
    await new Promise((resolve) => setTimeout(resolve, 100))
    const status = await (await fetch(`${server.url}/api/pull/status`, { headers: { cookie } })).json() as { state: string }
    expect(status.state).toBe('failed')
    expect(await queryRows<{ path: string; pulledAt: Date }>('SELECT path, "pulledAt" FROM "Folder" ORDER BY path')).toEqual(before)
    await control({ xrayFolderFailurePath: '' })
  })

  it('rejects an overlapping pull with 409 and does not allow status without a session', async () => {
    await control({ xrayFolderMode: 'large', xrayFolderFailurePath: '' })
    const first = await fetch(`${server.url}/api/pull/folders`, {
      method: 'POST', headers: { cookie, origin: server.url },
    })
    expect(first.status).toBe(200)
    const second = await fetch(`${server.url}/api/pull/folders`, {
      method: 'POST', headers: { cookie, origin: server.url },
    })
    expect(second.status).toBe(409)
    expect(await second.text()).toContain('A pull is already running')
    expect((await fetch(`${server.url}/api/pull/status`)).status).toBe(401)
  })
})
