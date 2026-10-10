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
  const authorize = await fetch(start.headers.get('location') ?? '', { redirect: 'manual' })
  const callback = await fetch(authorize.headers.get('location') ?? '', {
    headers: { cookie: stateCookie },
    redirect: 'manual',
  })
  return (
    callback.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith('nuxt-session='))
      ?.split(';', 1)[0] ?? ''
  )
}

async function waitForPull(server: RunningServer, cookie: string, projectId: string) {
  let status:
    | {
        state: string
        message?: string
        fetched: number
        total: number | null
        folders: number | null
      }
    | undefined
  for (let attempt = 0; attempt < 100; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20))
    status = (await (
      await fetch(`${server.url}/api/pull/status?project=${projectId}`, { headers: { cookie } })
    ).json()) as typeof status
    if (status?.state !== 'running') return status
  }
  throw new Error(`Pull did not complete: ${JSON.stringify(status)}`)
}

describe('full test pull', () => {
  let server: RunningServer
  let mock: MockServicesHandle
  let cookie = ''
  let workspaceId = ''
  let projectId = ''

  beforeAll(async () => {
    mock = await startMockServices(mockUrl)
    await control({
      xrayMode: 'valid',
      xrayFolderMode: 'flat',
      xrayTestMode: 'five',
      xrayTestRevision: 0,
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
    cookie = await signIn(server)
    await fetch(`${server.url}/api/auth/xray`, {
      method: 'PUT',
      headers: { cookie, origin: server.url, 'content-type': 'application/json' },
      body: JSON.stringify({
        region: 'EU',
        clientId: 'mock-xray-client-id',
        clientSecret: 'mock-xray-client-secret',
      }),
    })
    const selected = await fetch(`${server.url}/api/project`, {
      method: 'PUT',
      headers: { cookie, origin: server.url, 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: '10001' }),
    })
    projectId = ((await selected.json()) as { projectId: string }).projectId
    const session = (await (
      await fetch(`${server.url}/api/auth/session`, { headers: { cookie } })
    ).json()) as { workspace: { id: string } }
    workspaceId = session.workspace.id
    await queryRows(`DELETE FROM "TestCase" WHERE "projectId"=$1`, [projectId])
    await queryRows(`DELETE FROM "Folder" WHERE "projectId"=$1`, [projectId])
  })

  afterAll(async () => {
    await server?.stop()
    await mock?.stop()
  })

  it('pulls a lightweight paginated test index without fetching or storing details', async () => {
    const previousSnapshots = await queryRows<{ count: string }>(
      `SELECT count(*)::text AS count FROM "TestCaseSnapshot" s JOIN "TestCase" tc ON tc.id=s."testCaseId" WHERE tc."projectId"=$1`,
      [projectId],
    )
    const started = await fetch(`${server.url}/api/pull?project=${projectId}`, {
      method: 'POST',
      headers: { cookie, origin: server.url },
    })
    expect(started.status).toBe(200)
    expect(await waitForPull(server, cookie, projectId)).toMatchObject({
      state: 'succeeded',
      fetched: 5,
      total: 5,
      folders: 4,
    })
    const rows = await queryRows<{
      key: string
      summary: string
      testType: string | null
      snapshots: string
    }>(
      `SELECT tc.key, tc.summary, tc."testType", count(s.id)::text AS snapshots
       FROM "TestCase" tc LEFT JOIN "TestCaseSnapshot" s ON s."testCaseId"=tc.id
       WHERE tc."projectId"=$1 GROUP BY tc.id ORDER BY tc.key`,
      [projectId],
    )
    expect(rows).toHaveLength(5)
    expect(rows[0]).toMatchObject({ key: 'ONEDS-14043', summary: 'Repository test 1' })
    expect(rows.every((row) => row.snapshots === '0' || row.snapshots === '1')).toBe(true)
    const nextSnapshots = await queryRows<{ count: string }>(
      `SELECT count(*)::text AS count FROM "TestCaseSnapshot" s JOIN "TestCase" tc ON tc.id=s."testCaseId" WHERE tc."projectId"=$1`,
      [projectId],
    )
    expect(nextSnapshots).toEqual(previousSnapshots)
    const testType = await queryRows<{ testType: string | null }>(
      `SELECT "testType" FROM "TestCase" WHERE "projectId"=$1 AND key='ONEDS-14043'`,
      [projectId],
    )
    expect(testType[0]?.testType).toBeNull()
    const mockCounts = (await (await fetch(new URL('/__control', mockUrl))).json()) as {
      xrayDetailQueryCount: number
    }
    expect(mockCounts.xrayDetailQueryCount).toBe(0)
    const listing = (await (
      await fetch(`${server.url}/api/tests?project=${projectId}`, { headers: { cookie } })
    ).json()) as { values: Array<Record<string, unknown>> }
    expect(listing.values[0]).toEqual(
      expect.objectContaining({
        key: 'ONEDS-14043',
        summary: 'Repository test 1',
        folderPath: '/Autocomplete',
      }),
    )
    expect(listing.values[0]).not.toHaveProperty('testType')
    expect(listing.values[0]).not.toHaveProperty('snapshot')
  })

  it('preserves the prior index after a later page fails', async () => {
    await control({ xrayTestMode: 'large', xrayTestFailureStart: -1 })
    const full = await fetch(`${server.url}/api/pull?project=${projectId}`, {
      method: 'POST',
      headers: { cookie, origin: server.url },
    })
    expect(full.status).toBe(200)
    expect(await waitForPull(server, cookie, projectId)).toMatchObject({
      state: 'succeeded',
      fetched: 1000,
      total: 1000,
    })
    const before = await queryRows<{ count: string }>(
      'SELECT count(*)::text AS count FROM "TestCase" WHERE "projectId"=$1',
      [projectId],
    )
    const beforeRows = await queryRows<{ issueId: string; key: string; summary: string }>(
      `SELECT "issueId", key, summary FROM "TestCase" WHERE "projectId"=$1 ORDER BY "issueId"`,
      [projectId],
    )
    await control({ xrayTestFailureStart: 200 })
    const failedStart = await fetch(`${server.url}/api/pull?project=${projectId}`, {
      method: 'POST',
      headers: { cookie, origin: server.url },
    })
    expect(failedStart.status).toBe(200)
    expect(await waitForPull(server, cookie, projectId)).toMatchObject({ state: 'failed' })
    const after = await queryRows<{ count: string }>(
      'SELECT count(*)::text AS count FROM "TestCase" WHERE "projectId"=$1',
      [projectId],
    )
    const afterRows = await queryRows<{ issueId: string; key: string; summary: string }>(
      `SELECT "issueId", key, summary FROM "TestCase" WHERE "projectId"=$1 ORDER BY "issueId"`,
      [projectId],
    )
    expect(after).toEqual(before)
    expect(afterRows).toEqual(beforeRows)
    await control({ xrayTestMode: 'five', xrayTestFailureStart: -1 })
  })

  it('retains remotely deleted tests with drafts and marks them deleted', async () => {
    const testCaseId = 'draft-deleted-test'
    await queryRows(
      `INSERT INTO "TestCase" (id, "projectId", "issueId", key, "testType", origin, "updatedAt")
       VALUES ($1, $2, 'gone-issue', 'ONEDS-GONE', 'Cucumber', 'REMOTE', now())`,
      [testCaseId, projectId],
    )
    await queryRows(
      `INSERT INTO "TestCaseSnapshot" (id, "testCaseId", summary, fingerprint)
       VALUES ('gone-snapshot', $1, 'local base', 'base-fingerprint')`,
      [testCaseId],
    )
    await queryRows(
      `INSERT INTO "TestCaseDraft" (id, "userId", "testCaseId", summary, "updatedAt") VALUES ('gone-draft', (SELECT "ownerId" FROM "Workspace" WHERE id=$1), $2, 'local draft', now())`,
      [workspaceId, testCaseId],
    )
    await control({ xrayTestMode: 'five', xrayTestFailureStart: -1 })
    await fetch(`${server.url}/api/pull?project=${projectId}`, {
      method: 'POST',
      headers: { cookie, origin: server.url },
    })
    expect(await waitForPull(server, cookie, projectId)).toMatchObject({ state: 'succeeded' })
    const retained = await queryRows<{ remoteDeletedAt: Date | null; draftId: string | null }>(
      `SELECT tc."remoteDeletedAt", d.id AS "draftId" FROM "TestCase" tc LEFT JOIN "TestCaseDraft" d ON d."testCaseId"=tc.id WHERE tc.id=$1`,
      [testCaseId],
    )
    expect(retained[0]?.remoteDeletedAt).toBeTruthy()
    expect(retained[0]?.draftId).toBe('gone-draft')
  })

  it('does not overwrite a lazily-created snapshot during a later index pull', async () => {
    const testCaseId = (
      await queryRows<{ id: string }>(
        `SELECT id FROM "TestCase" WHERE "projectId"=$1 AND "issueId"='20000'`,
        [projectId],
      )
    )[0]?.id
    expect(testCaseId).toBeTruthy()
    await queryRows(`DELETE FROM "TestCaseSnapshot" WHERE "testCaseId"=$1`, [testCaseId])
    await queryRows(
      `INSERT INTO "TestCaseSnapshot" (id, "testCaseId", summary, fingerprint)
       VALUES ('persisted-lazy-snapshot', $1, 'Snapshot baseline', 'baseline-fingerprint')`,
      [testCaseId],
    )
    await fetch(`${server.url}/api/pull?project=${projectId}`, {
      method: 'POST',
      headers: { cookie, origin: server.url },
    })
    expect(await waitForPull(server, cookie, projectId)).toMatchObject({ state: 'succeeded' })
    const snapshot = await queryRows<{ summary: string; fingerprint: string }>(
      `SELECT summary, fingerprint FROM "TestCaseSnapshot" WHERE "testCaseId"=$1`,
      [testCaseId],
    )
    expect(snapshot).toEqual([
      { summary: 'Snapshot baseline', fingerprint: 'baseline-fingerprint' },
    ])
  })

  it('removes stale un-drafted index records and preserves stale drafted records with their snapshots', async () => {
    const stale = await queryRows<{ id: string }>(
      `SELECT id FROM "TestCase" WHERE "projectId"=$1 AND "issueId"='20001'`,
      [projectId],
    )
    const staleId = stale[0]?.id
    expect(staleId).toBeTruthy()
    await queryRows(
      `INSERT INTO "TestCaseSnapshot" (id, "testCaseId", summary, fingerprint) VALUES ('stale-index-snapshot', $1, 'Stale baseline', 'stale-fingerprint')`,
      [staleId],
    )
    await queryRows(
      `INSERT INTO "TestCaseDraft" (id, "userId", "testCaseId", summary, "updatedAt") VALUES ('stale-index-draft', (SELECT "ownerId" FROM "Workspace" WHERE id=$1), $2, 'Local draft', now())`,
      [workspaceId, staleId],
    )
    await control({ xrayTestMode: 'empty', xrayTestFailureStart: -1 })
    await fetch(`${server.url}/api/pull?project=${projectId}`, {
      method: 'POST',
      headers: { cookie, origin: server.url },
    })
    expect(await waitForPull(server, cookie, projectId)).toMatchObject({
      state: 'succeeded',
      fetched: 0,
    })
    const preserved = await queryRows<{
      remoteDeletedAt: Date | null
      snapshotId: string | null
      draftId: string | null
    }>(
      `SELECT tc."remoteDeletedAt", s.id AS "snapshotId", d.id AS "draftId" FROM "TestCase" tc LEFT JOIN "TestCaseSnapshot" s ON s."testCaseId"=tc.id LEFT JOIN "TestCaseDraft" d ON d."testCaseId"=tc.id WHERE tc.id=$1`,
      [staleId],
    )
    expect(preserved[0]).toMatchObject({
      snapshotId: 'stale-index-snapshot',
      draftId: 'stale-index-draft',
    })
    expect(preserved[0]?.remoteDeletedAt).toBeTruthy()
    await control({ xrayTestMode: 'five', xrayTestFailureStart: -1 })
  })

  it('rejects a second full pull while the first is active', async () => {
    await control({ xrayTestMode: 'large', xrayTestFailureStart: -1 })
    const first = await fetch(`${server.url}/api/pull?project=${projectId}`, {
      method: 'POST',
      headers: { cookie, origin: server.url },
    })
    expect(first.status).toBe(200)
    const second = await fetch(`${server.url}/api/pull?project=${projectId}`, {
      method: 'POST',
      headers: { cookie, origin: server.url },
    })
    expect(second.status).toBe(409)
    expect(await second.text()).toContain('A pull is already running')
    await waitForPull(server, cookie, projectId)
    await control({ xrayTestMode: 'five', xrayTestFailureStart: -1 })
  })
})
