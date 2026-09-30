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

async function signIn(server: RunningServer): Promise<string> {
  const start = await fetch(`${server.url}/auth/jira/login`, { redirect: 'manual' })
  const state = start.headers.get('set-cookie')?.split(';', 1)[0] ?? ''
  const authorize = await fetch(start.headers.get('location') ?? '', { redirect: 'manual' })
  const callback = await fetch(authorize.headers.get('location') ?? '', { headers: { cookie: state }, redirect: 'manual' })
  return callback.headers.getSetCookie().find((cookie) => cookie.startsWith('nuxt-session='))?.split(';', 1)[0] ?? ''
}

describe('cached test query API', () => {
  let server: RunningServer
  let mock: MockServicesHandle
  let cookie = ''
  let workspaceId = ''

  beforeAll(async () => {
    mock = await startMockServices(mockUrl)
    await fetch(new URL('/__control', mockUrl), {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ xrayMode: 'valid', xrayFolderMode: 'flat', xrayTestMode: 'five', xrayTestFailureStart: -1 }),
    })
    server = await startBuiltServer({
      NUXT_DATABASE_URL: process.env.NUXT_DATABASE_URL_TEST,
      NUXT_INTEGRATION_TARGET: 'mock',
      NUXT_MOCK_SERVICES_URL: mockUrl,
      NUXT_ATLASSIAN_CLIENT_ID: 'mock-client-id',
      NUXT_ATLASSIAN_CLIENT_SECRET: 'mock-client-secret',
      NUXT_ATLASSIAN_REDIRECT_URI: '__SERVER_URL__/auth/jira/callback',
    })
    cookie = await signIn(server)
    await fetch(`${server.url}/api/auth/xray`, {
      method: 'PUT', headers: { cookie, origin: server.url, 'content-type': 'application/json' },
      body: JSON.stringify({ region: 'EU', clientId: 'mock-xray-client-id', clientSecret: 'mock-xray-client-secret' }),
    })
    await fetch(`${server.url}/api/project`, {
      method: 'PUT', headers: { cookie, origin: server.url, 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: '10001' }),
    })
    const response = await fetch(`${server.url}/api/auth/session`, { headers: { cookie } })
    workspaceId = ((await response.json()) as { workspace: { id: string } }).workspace.id
    await queryRows(`DELETE FROM "TestCase" WHERE "workspaceId"=$1`, [workspaceId])
    await queryRows(`DELETE FROM "Folder" WHERE "workspaceId"=$1`, [workspaceId])
    await queryRows(`
      INSERT INTO "TestCase" (id, "workspaceId", "jiraProjectId", "issueId", key, "testType", "folderPath", "updatedAt")
      VALUES
        ('query-root', $1, '10001', 'query-issue-root', 'ONEDS-ROOT', 'Cucumber', '/Autocomplete', now()),
        ('query-child', $1, '10001', '20003', 'ONEDS-14046', 'Manual', '/Autocomplete/Focus', now()),
        ('query-other', $1, '10001', 'query-issue-other', 'ONEDS-OTHER', 'Generic', '/Billing', now())
    `, [workspaceId])
    await queryRows(`UPDATE "TestCase" SET summary = 'Root search case' WHERE id = 'query-root'`)
    await queryRows(`UPDATE "TestCase" SET summary = 'Child search case' WHERE id = 'query-child'`)
    await queryRows(`UPDATE "TestCase" SET summary = 'Other case' WHERE id = 'query-other'`)
    await queryRows(`
      INSERT INTO "TestCaseSnapshot" (id, "testCaseId", summary, labels, status, gherkin, fingerprint)
      VALUES
        ('query-snap-root', 'query-root', 'Root search case', ARRAY['review'], 'Ready', 'Scenario: root', 'f1'),
        ('query-snap-child', 'query-child', 'Child search case', ARRAY['api'], 'To Do', NULL, 'f2'),
        ('query-snap-other', 'query-other', 'Other case', ARRAY['review'], 'Ready', NULL, 'f3')
    `)
  })

  afterAll(async () => {
    await server?.stop()
    await mock?.stop()
  })

  it('searches by key/name and folder descendants with bounded stable pagination', async () => {
    const exact = await (await fetch(`${server.url}/api/tests?folder=%2FAutocomplete&q=ONEDS-ROOT&limit=100`, { headers: { cookie } })).json() as {
      values: Array<{ key: string; readOnly: boolean }>; total: number; nextOffset: number | null
    }
    expect(exact.values.map((test) => test.key)).toContain('ONEDS-ROOT')
    const descendants = await (await fetch(`${server.url}/api/tests?folder=%2FAutocomplete&includeDescendants=true&q=Child`, { headers: { cookie } })).json() as {
      values: Array<{ key: string }>; total: number
    }
    expect(descendants.values.some((test) => test.key === 'ONEDS-14046')).toBe(true)
    const search = await (await fetch(`${server.url}/api/tests?q=Other`, { headers: { cookie } })).json() as { total: number; values: Array<{ key: string }> }
    expect(search).toMatchObject({ total: 1 })
    expect(search.values[0]?.key).toBe('ONEDS-OTHER')
    expect((await fetch(`${server.url}/api/tests?limit=1000`, { headers: { cookie } })).status).toBe(400)
    await controlApi({ xrayTestMode: 'five', resetXrayCounts: true })
    const detail = await fetch(`${server.url}/api/tests/query-child`, { headers: { cookie } })
    expect(detail.status).toBe(200)
    const detailBody = await detail.json() as { key: string; readOnly: boolean; testType: string; labels: string[] }
    expect(detailBody).toMatchObject({ key: 'ONEDS-14046', readOnly: true, testType: 'Manual', labels: ['api'] })
    const controlState = await (await fetch(new URL('/__control', mockUrl))).json() as { xrayDetailQueryCount: number }
    expect(controlState.xrayDetailQueryCount).toBe(1)
    const repeat = await fetch(`${server.url}/api/tests/query-child`, { headers: { cookie } })
    expect(repeat.status).toBe(200)
    const repeatedCounts = await (await fetch(new URL('/__control', mockUrl))).json() as { xrayDetailQueryCount: number }
    expect(repeatedCounts.xrayDetailQueryCount).toBe(2)
    const malformed = await fetch(`${server.url}/api/tests/%3Cinvalid%3E`, { headers: { cookie } })
    expect(malformed.status).toBe(404)
  })

  it('creates and compares editor-selection snapshots without overwriting drafted baselines', async () => {
    await queryRows(`INSERT INTO "TestCase" (id, "workspaceId", "jiraProjectId", "issueId", key, summary, origin, "updatedAt") VALUES ('selection-new', $1, '10001', '20000', 'ONEDS-14043', 'Repository test 1', 'REMOTE', now())`, [workspaceId])
    await controlApi({ xrayTestRevision: 0, resetXrayCounts: true })
    const first = await fetch(`${server.url}/api/tests/selection`, {
      method: 'POST', headers: { cookie, origin: server.url, 'content-type': 'application/json' },
      body: JSON.stringify({ ids: ['selection-new'] }),
    })
    expect(first.status).toBe(200)
    const counts = await (await fetch(new URL('/__control', mockUrl))).json() as { xrayDetailQueryCount: number }
    expect(counts.xrayDetailQueryCount).toBe(1)
    expect(await queryRows<{ summary: string; fingerprint: string }>(`SELECT summary, fingerprint FROM "TestCaseSnapshot" WHERE "testCaseId"='selection-new'`)).toMatchObject([
      { summary: 'Repository test 1', fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) },
    ])

    await queryRows(`INSERT INTO "TestCaseDraft" (id, "testCaseId", summary, "updatedAt") VALUES ('selection-draft', 'selection-new', 'Local draft', now())`)
    const original = await queryRows<{ summary: string; fingerprint: string }>(`SELECT summary, fingerprint FROM "TestCaseSnapshot" WHERE "testCaseId"='selection-new'`)
    await controlApi({ xrayTestRevision: 1 })
    const changedWithDraft = await fetch(`${server.url}/api/tests/selection`, {
      method: 'POST', headers: { cookie, origin: server.url, 'content-type': 'application/json' },
      body: JSON.stringify({ ids: ['selection-new'] }),
    })
    expect(changedWithDraft.status).toBe(200)
    expect(await queryRows(`SELECT summary, fingerprint FROM "TestCaseSnapshot" WHERE "testCaseId"='selection-new'`)).toEqual(original)

    await queryRows(`DELETE FROM "TestCaseDraft" WHERE "testCaseId"='selection-new'`)
    const changedWithoutDraft = await fetch(`${server.url}/api/tests/selection`, {
      method: 'POST', headers: { cookie, origin: server.url, 'content-type': 'application/json' },
      body: JSON.stringify({ ids: ['selection-new'] }),
    })
    expect(changedWithoutDraft.status).toBe(200)
    expect(await queryRows<{ summary: string }>(`SELECT summary FROM "TestCaseSnapshot" WHERE "testCaseId"='selection-new'`)).toEqual([{ summary: 'Repository test 1 revision 1' }])
  })

  it('rejects unauthenticated queries and keeps workspace-scoped results', async () => {
    expect((await fetch(`${server.url}/api/tests`)).status).toBe(401)
    const result = await (await fetch(`${server.url}/api/tests`, { headers: { cookie } })).json() as { values: Array<{ key: string; id: string; issueId: string }> }
    expect(result.values.every((testCase) => testCase.id && testCase.issueId && !('workspaceId' in testCase))).toBe(true)
  })

  it('returns a 100-test page from a 1,000-test cache within the performance target', async () => {
    const cases = Array.from({ length: 1000 }, (_, index) => ({
      id: `perf-case-${index}`,
      workspaceId,
      jiraProjectId: '10001',
      issueId: `perf-issue-${index}`,
      key: `PERF-${String(index).padStart(4, '0')}`,
      testType: 'Cucumber',
      folderPath: '/Autocomplete',
    }))
    await usePrismaCreateMany(cases)
    const start = performance.now()
    const response = await fetch(`${server.url}/api/tests?limit=100`, { headers: { cookie } })
    const elapsed = performance.now() - start
    expect(response.status).toBe(200)
    const body = await response.json() as { values: Array<Record<string, unknown>>; total: number; nextOffset: number | null }
    expect(body.values).toHaveLength(100)
    expect(body.total).toBeGreaterThanOrEqual(1000)
    expect(body.nextOffset).toBe(100)
    expect(body.values[0]).not.toHaveProperty('snapshot')
    expect(elapsed).toBeLessThan(300)
    await queryRows('DELETE FROM "TestCase" WHERE id LIKE \'perf-case-%\'')
  })
})

async function controlApi(body: Record<string, unknown>) {
  await fetch(new URL('/__control', mockUrl), {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
}

async function usePrismaCreateMany(cases: Array<{
  id: string
  workspaceId: string
  jiraProjectId: string
  issueId: string
  key: string
  testType: string
  folderPath: string
}>): Promise<void> {
  await queryRows(
    `INSERT INTO "TestCase" (id, "workspaceId", "jiraProjectId", "issueId", key, "testType", "folderPath", origin, "updatedAt")
     SELECT id, "workspaceId", "jiraProjectId", "issueId", key, "testType", "folderPath", 'REMOTE', now()
     FROM jsonb_to_recordset($1::jsonb) AS x(id text, "workspaceId" text, "jiraProjectId" text, "issueId" text, key text, "testType" text, "folderPath" text)`,
    [JSON.stringify(cases)],
  )
}
