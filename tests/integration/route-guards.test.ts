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

const pairs = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(';', 1)[0])
    .filter((value): value is string => Boolean(value))

/** Runs the OAuth redirect chain up to the callback and returns the callback response. */
async function oauthCallback(
  server: RunningServer,
  options: { next?: string; extraCookie?: string } = {},
) {
  const query = options.next === undefined ? '' : `?next=${encodeURIComponent(options.next)}`
  const start = await fetch(`${server.url}/auth/jira/login${query}`, { redirect: 'manual' })
  const cookie = [...pairs(start), options.extraCookie].filter(Boolean).join('; ')
  const authorize = await fetch(start.headers.get('location') ?? '', { redirect: 'manual' })
  const callback = await fetch(authorize.headers.get('location') ?? '', {
    headers: { cookie },
    redirect: 'manual',
  })
  return { start, callback }
}

const sessionOf = (response: Response) =>
  response.headers.getSetCookie().find((c) => c.startsWith('nuxt-session='))?.split(';', 1)[0] ?? ''

describe('route guards, return paths, and key lookup', () => {
  let server: RunningServer
  let mock: MockServicesHandle
  let cookie = ''
  let workspaceId = ''
  let projectId = ''

  beforeAll(async () => {
    mock = await startMockServices(mockUrl)
    await control({
      mode: 'single',
      xrayMode: 'valid',
      xrayFolderMode: 'flat',
      xrayTestMode: 'five',
      xrayTestFailureStart: -1,
      resetXrayCounts: true,
    })
    server = await startBuiltServer({
      NUXT_DATABASE_URL: process.env.NUXT_DATABASE_URL_TEST,
      NUXT_INTEGRATION_TARGET: 'mock',
      NUXT_MOCK_SERVICES_URL: mockUrl,
      NUXT_ATLASSIAN_CLIENT_ID: 'mock-client-id',
      NUXT_ATLASSIAN_CLIENT_SECRET: 'mock-client-secret',
      NUXT_ATLASSIAN_REDIRECT_URI: '__SERVER_URL__/auth/jira/callback',
    })
    const { callback } = await oauthCallback(server)
    cookie = sessionOf(callback)
    await fetch(`${server.url}/api/auth/xray`, {
      method: 'PUT',
      headers: { cookie, origin: server.url, 'content-type': 'application/json' },
      body: JSON.stringify({ region: 'EU', clientId: 'mock-xray-client-id', clientSecret: 'mock-xray-client-secret' }),
    })
    const selected = await fetch(`${server.url}/api/project`, {
      method: 'PUT',
      headers: { cookie, origin: server.url, 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: '10001' }),
    })
    projectId = ((await selected.json()) as { projectId: string }).projectId
    const session = await fetch(`${server.url}/api/auth/session`, { headers: { cookie } })
    workspaceId = ((await session.json()) as { workspace: { id: string } }).workspace.id
    await queryRows(`DELETE FROM "TestCase" WHERE "projectId"=$1`, [projectId])
    await queryRows(
      `INSERT INTO "TestCase" (id, "projectId", "issueId", key, summary, "folderPath", origin, "updatedAt")
       VALUES ('guard-1', $1, '20000', 'ONEDS-14043', 'Repository test 1', '/Autocomplete', 'REMOTE', now())`,
      [projectId],
    )
  })

  afterAll(async () => {
    // Leave no ready workspace behind for files that expect a fresh one.
    if (workspaceId) await queryRows('DELETE FROM "Workspace" WHERE id = $1', [workspaceId])
    await server?.stop()
    await mock?.stop()
  })

  describe('pages', () => {
    it('serves public pages without a session', async () => {
      for (const path of ['/', '/login']) {
        const response = await fetch(`${server.url}${path}`, { redirect: 'manual' })
        expect(response.status, path).toBe(200)
      }
    })

    it('redirects protected pages to login with an encoded next path', async () => {
      const cases: Array<[string, string]> = [
        ['/settings', '/login?next=%2Fsettings'],
        ['/repository', '/login?next=%2Frepository'],
        ['/repository?folder=/Autocomplete', '/login?next=%2Frepository%3Ffolder%3D%2FAutocomplete'],
        ['/tests/ONEDS-14043', '/login?next=%2Ftests%2FONEDS-14043'],
      ]
      for (const [path, location] of cases) {
        const response = await fetch(`${server.url}${path}`, { redirect: 'manual' })
        expect(response.status, path).toBe(302)
        expect(response.headers.get('location'), path).toBe(location)
      }
    })

    it('serves protected pages to a signed-in owner of a ready workspace', async () => {
      for (const path of ['/settings', `/repository?project=${projectId}`, `/tests/ONEDS-14043?project=${projectId}`]) {
        const response = await fetch(`${server.url}${path}`, { headers: { cookie }, redirect: 'manual' })
        expect(response.status, path).toBe(200)
      }
    })

    it('requires explicit project choice for legacy repository routes', async () => {
      const response = await fetch(`${server.url}/repository?project=unknown`, { headers: { cookie }, redirect: 'manual' })
      expect(response.status).toBe(302)
      expect(response.headers.get('location')).toBe(`/repository?project=${projectId}`)
    })

    it('bounces a signed-in user from /login to a safe destination', async () => {
      const cases: Array<[string, string]> = [
      ['/login', '/repository'],
      ['/login?next=%2Ftests%2FONEDS-14043', '/tests/ONEDS-14043'],
      ['/login?next=https%3A%2F%2Fevil.example%2Fx', '/repository'],
      ['/login?next=%2F%2Fevil.example', '/repository'],
      ]
      for (const [path, location] of cases) {
        const response = await fetch(`${server.url}${path}`, { headers: { cookie }, redirect: 'manual' })
        expect(response.status, path).toBe(302)
        expect(response.headers.get('location'), path).toBe(location)
      }
    })
  })

  describe('return path through sign-in', () => {
    it('defaults to /repository', async () => {
      const { callback } = await oauthCallback(server)
      expect(callback.headers.get('location')).toBe('/repository')
    })

    it('carries next through OAuth in a signed HttpOnly cookie and uses it once', async () => {
      const { start, callback } = await oauthCallback(server, { next: '/repository?folder=/Autocomplete' })
      const nextCookie = start.headers.getSetCookie().find((c) => c.startsWith('login_next='))
      expect(nextCookie).toBeDefined()
      expect(nextCookie).toMatch(/HttpOnly/i)
      expect(callback.headers.get('location')).toBe('/repository?folder=/Autocomplete')
      expect(callback.headers.getSetCookie().some((c) => c.startsWith('login_next=;'))).toBe(true)
    })

    it('ignores unsafe next values at the OAuth start', async () => {
      for (const next of ['https://evil.example/x', '//evil.example/x', '/\\evil.example']) {
        const { start, callback } = await oauthCallback(server, { next })
        expect(start.headers.getSetCookie().some((c) => c.startsWith('login_next='))).toBe(false)
        expect(callback.headers.get('location'), next).toBe('/repository')
      }
    })

    it('falls back to the default when the next cookie signature is invalid', async () => {
      const { callback } = await oauthCallback(server, { extraCookie: 'login_next=/tests/X-1.forgedsignature' })
      expect(callback.headers.get('location')).toBe('/repository')
    })

    it('keeps next across multi-site selection', async () => {
      await control({ mode: 'multi' })
      try {
        const { start, callback } = await oauthCallback(server, { next: '/tests/ONEDS-14043' })
        expect(callback.headers.get('location')).toBe('/auth/jira/select-site')
        const cookies = [
          ...pairs(start).filter((c) => c.startsWith('login_next=')),
          ...pairs(callback).filter((c) => c.startsWith('jira_oauth_pending=')),
        ].join('; ')
        const selected = await fetch(`${server.url}/api/auth/jira/select-site`, {
          method: 'POST',
          headers: { cookie: cookies, origin: server.url, 'content-type': 'application/json' },
          body: JSON.stringify({ cloudId: 'fake-cloud-two' }),
        })
        expect(selected.status).toBe(200)
        expect(await selected.json()).toEqual({ redirectTo: '/tests/ONEDS-14043' })
      } finally {
        await control({ mode: 'single' })
      }
    })
  })

  describe('GET /api/tests/by-key/:key', () => {
    it('returns fresh details for a cached key without persisting them', async () => {
      await control({ xrayTestMode: 'five', xrayTestRevision: 0, resetXrayCounts: true })
      const before = await queryRows('SELECT id FROM "TestCaseSnapshot" WHERE "testCaseId" = $1', ['guard-1'])
      const response = await fetch(`${server.url}/api/tests/by-key/ONEDS-14043?project=${projectId}`, { headers: { cookie } })
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({
        key: 'ONEDS-14043',
        summary: 'Repository test 1',
        labels: expect.any(Array),
        status: expect.any(String),
        readOnly: expect.any(Boolean),
      })
      const counts = (await (await fetch(new URL('/__control', mockUrl))).json()) as { xrayDetailQueryCount: number }
      expect(counts.xrayDetailQueryCount).toBe(1)
      expect(await queryRows('SELECT id FROM "TestCaseSnapshot" WHERE "testCaseId" = $1', ['guard-1'])).toEqual(before)
    })

    it('returns 404 for unknown and malformed keys', async () => {
      for (const key of ['NOPE-1', 'bad key', '%3Cscript%3E', 'ONEDS-']) {
        const response = await fetch(`${server.url}/api/tests/by-key/${key}?project=${projectId}`, { headers: { cookie } })
        expect(response.status, key).toBe(404)
      }
    })

    it('does not return tests from an unassociated tenant project', async () => {
      await queryRows(
        `INSERT INTO "Project" (id, "tenantIdentityKind", "tenantIdentity", "jiraProjectId", "jiraProjectKey", "jiraProjectName", "testIssueTypeId", "testIssueTypeName", "projectStatuses", "updatedAt")
         VALUES ('guard-other-project', 'SITE_ORIGIN', 'https://other-guard.atlassian.net', '10001', 'OTHER', 'Other', '100', 'Test', '[]', now())`,
      )
      await queryRows(
        `INSERT INTO "TestCase" (id, "projectId", "issueId", key, origin, "updatedAt")
         VALUES ('guard-foreign', 'guard-other-project', '29999', 'OTHER-1', 'REMOTE', now())`,
      )
      try {
        const response = await fetch(`${server.url}/api/tests/by-key/OTHER-1?project=guard-other-project`, { headers: { cookie } })
        expect(response.status).toBe(404)
      } finally {
        await queryRows(`DELETE FROM "Project" WHERE id = 'guard-other-project'`)
      }
    })

    it('requires a session and a ready workspace', async () => {
      expect((await fetch(`${server.url}/api/tests/by-key/ONEDS-14043?project=${projectId}`)).status).toBe(401)
      const response = await fetch(`${server.url}/api/tests/by-key/ONEDS-14043?project=unassociated`, { headers: { cookie } })
      expect(response.status).toBe(404)
    })
  })
})
