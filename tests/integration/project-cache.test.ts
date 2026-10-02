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

async function oauthCookie(server: RunningServer): Promise<string> {
  const start = await fetch(`${server.url}/auth/jira/login`, { redirect: 'manual' })
  const state = start.headers.get('set-cookie')?.split(';', 1)[0] ?? ''
  const authorize = await fetch(start.headers.get('location') ?? '', { redirect: 'manual' })
  const callback = await fetch(authorize.headers.get('location') ?? '', {
    headers: { cookie: state },
    redirect: 'manual',
  })
  return (
    callback.headers
      .getSetCookie()
      .find((value) => value.startsWith('nuxt-session='))
      ?.split(';', 1)[0] ?? ''
  )
}

async function configure(server: RunningServer, cookie: string) {
  await fetch(`${server.url}/api/auth/xray`, {
    method: 'PUT',
    headers: { cookie, origin: server.url, 'content-type': 'application/json' },
    body: JSON.stringify({
      region: 'EU',
      clientId: 'mock-xray-client-id',
      clientSecret: 'mock-xray-client-secret',
    }),
  })
}

describe('tenant-scoped shared project cache', () => {
  let mock: MockServicesHandle
  let server: RunningServer
  let cookie = ''
  let workspaceId = ''
  let projectId = ''

  beforeAll(async () => {
    mock = await startMockServices(mockUrl)
    await queryRows(`DELETE FROM "Workspace" WHERE id='cache-second-workspace'`)
    await queryRows(
      `DELETE FROM "WorkspaceProject" WHERE "workspaceId" IN (SELECT id FROM "Workspace" WHERE "ownerId" IN (SELECT id FROM "User" WHERE "accountId" IN ('fake-atlassian-account','fake-api-token-account')))`,
    )
    await queryRows(
      `DELETE FROM "Project" WHERE id IN ('tenant-collision-project','tab-project-b')`,
    )
    await queryRows(`DELETE FROM "TestCase" WHERE id IN ('tab-test-b','private-cache-draft')`)
    await fetch(new URL('/__control', mockUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: 'single',
        xrayMode: 'valid',
        xrayFolderMode: 'flat',
        xrayTestMode: 'five',
      }),
    })
    server = await startBuiltServer({
      NUXT_DATABASE_URL: process.env.NUXT_DATABASE_URL_TEST,
      NUXT_INTEGRATION_TARGET: 'mock',
      NUXT_MOCK_SERVICES_URL: mockUrl,
      NUXT_ATLASSIAN_CLIENT_ID: 'mock-client-id',
      NUXT_ATLASSIAN_CLIENT_SECRET: 'mock-client-secret',
      NUXT_ATLASSIAN_REDIRECT_URI: '__SERVER_URL__/auth/jira/callback',
    })
    cookie = await oauthCookie(server)
    const session = (await (
      await fetch(`${server.url}/api/auth/session`, { headers: { cookie } })
    ).json()) as { workspace: { id: string } }
    workspaceId = session.workspace.id
    await queryRows(`DELETE FROM "WorkspaceProject" WHERE "workspaceId"=$1`, [workspaceId])
    await configure(server, cookie)
    const selected = await fetch(`${server.url}/api/project`, {
      method: 'PUT',
      headers: { cookie, origin: server.url, 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: '10001' }),
    })
    projectId = ((await selected.json()) as { projectId: string }).projectId
  })

  afterAll(async () => {
    await server?.stop()
    await mock?.stop()
  })

  it('shares tenant/project index through independently verified workspace associations', async () => {
    const owner = (
      await queryRows<{ ownerId: string }>('SELECT "ownerId" FROM "Workspace" WHERE id=$1', [
        workspaceId,
      ])
    )[0]!
    await queryRows(`DELETE FROM "Project" WHERE id='tenant-collision-project'`)
    const seeded = await fetch(`${server.url}/api/pull?project=${projectId}`, {
      method: 'POST',
      headers: { cookie, origin: server.url },
    })
    expect(seeded.status).toBe(200)
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const status = (await (
        await fetch(`${server.url}/api/pull/status?project=${projectId}`, { headers: { cookie } })
      ).json()) as { state: string }
      if (status.state !== 'running') break
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    await queryRows(
      `INSERT INTO "Workspace" (id, "ownerId", "cloudId", "siteOrigin", "siteUrl", name, "createdAt", "updatedAt") VALUES ('cache-second-workspace', $1, NULL, 'https://second.atlassian.net', 'https://second.atlassian.net', 'Second workspace', now(), now())`,
      [owner.ownerId],
    )
    await queryRows(
      `INSERT INTO "JiraConnection" (id, "workspaceId", "authMethod", scopes, "createdAt", "updatedAt") VALUES ('cache-second-jira', 'cache-second-workspace', 'OAUTH', ARRAY[]::text[], now(), now())`,
    )
    await queryRows(
      `INSERT INTO "XrayConnection" (id, "workspaceId", region, "clientId", "clientSecret", "verifiedAt", "createdAt", "updatedAt") SELECT 'cache-second-xray', 'cache-second-workspace', region, "clientId", "clientSecret", now(), now(), now() FROM "XrayConnection" WHERE "workspaceId"=$1`,
      [workspaceId],
    )
    const associate = await fetch(`${server.url}/api/project`, {
      method: 'PUT',
      headers: { cookie, origin: server.url, 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: '10001' }),
    })
    expect(associate.status).toBe(200)
    await queryRows(
      `INSERT INTO "WorkspaceProject" (id, "workspaceId", "projectId") VALUES ('cache-second-access', 'cache-second-workspace', $1) ON CONFLICT ("workspaceId", "projectId") DO NOTHING`,
      [projectId],
    )
    const first = await fetch(`${server.url}/api/tests?project=${projectId}`, {
      headers: { cookie },
    })
    expect(first.status).toBe(200)
    expect(((await first.json()) as { values: unknown[] }).values).toBeDefined()

    const unknown = await fetch(`${server.url}/api/tests?project=unassociated`, {
      headers: { cookie },
    })
    expect(unknown.status).toBe(404)

    const sameNumericDifferentTenant = await queryRows<{ id: string }>(
      `INSERT INTO "Project" (id, "tenantIdentityKind", "tenantIdentity", "jiraProjectId", "jiraProjectKey", "jiraProjectName", "testIssueTypeId", "testIssueTypeName", "projectStatuses", "updatedAt") VALUES ('tenant-collision-project', 'CLOUD_ID', 'fake-cloud-two', '10001', 'OTHER', 'Other', '100', 'Test', '[]', now()) RETURNING id`,
    )
    expect(sameNumericDifferentTenant).toHaveLength(1)
    expect(
      await queryRows(
        `SELECT count(DISTINCT "tenantIdentityKind"::text || ':' || "tenantIdentity")::int AS count FROM "Project" WHERE "jiraProjectId"='10001'`,
      ),
    ).toEqual([{ count: 2 }])
    await queryRows(
      `INSERT INTO "TestCase" (id,"projectId","issueId",key,origin,"updatedAt") VALUES ('tenant-collision-test','tenant-collision-project','collision-issue','OTHER-1','REMOTE',now())`,
    )
    await queryRows(
      `INSERT INTO "Folder" (id,"projectId",path,name) VALUES ('tenant-collision-folder','tenant-collision-project','/private','Private')`,
    )
    const foreignCache = await fetch(`${server.url}/api/tests?project=tenant-collision-project`, {
      headers: { cookie },
    })
    expect(foreignCache.status).toBe(404)
    const unauthorized = await Promise.all([
      fetch(`${server.url}/api/folders?project=tenant-collision-project`, { headers: { cookie } }),
      fetch(`${server.url}/api/tests?project=tenant-collision-project`, { headers: { cookie } }),
      fetch(`${server.url}/api/tests/tenant-collision-test?project=tenant-collision-project`, {
        headers: { cookie },
      }),
      fetch(`${server.url}/api/tests/by-key/OTHER-1?project=tenant-collision-project`, {
        headers: { cookie },
      }),
      fetch(`${server.url}/api/pull/status?project=tenant-collision-project`, {
        headers: { cookie },
      }),
      fetch(`${server.url}/api/pull?project=tenant-collision-project`, {
        method: 'POST',
        headers: { cookie, origin: server.url },
      }),
      fetch(`${server.url}/api/pull/folders?project=tenant-collision-project`, {
        method: 'POST',
        headers: { cookie, origin: server.url },
      }),
      fetch(`${server.url}/api/tests/selection?project=tenant-collision-project`, {
        method: 'POST',
        headers: { cookie, origin: server.url, 'content-type': 'application/json' },
        body: JSON.stringify({ ids: ['tenant-collision-test'] }),
      }),
    ])
    expect(unauthorized.map((response) => response.status)).toEqual(Array(8).fill(404))
    await queryRows(`DELETE FROM "Project" WHERE id='tenant-collision-project'`)
  })

  it('keeps two tabs on independent project context and isolates draft visibility by user', async () => {
    await queryRows(`DELETE FROM "Project" WHERE id='tab-project-b'`)
    const seeded = await fetch(`${server.url}/api/pull?project=${projectId}`, {
      method: 'POST',
      headers: { cookie, origin: server.url },
    })
    expect(seeded.status).toBe(200)
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const status = (await (
        await fetch(`${server.url}/api/pull/status?project=${projectId}`, { headers: { cookie } })
      ).json()) as { state: string }
      if (status.state !== 'running') break
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    const testCase = (
      await queryRows<{ id: string; key: string }>(
        `SELECT id,key FROM "TestCase" WHERE "projectId"=$1 AND origin='REMOTE' ORDER BY key LIMIT 1`,
        [projectId],
      )
    )[0]
    expect(testCase).toBeTruthy()
    const otherProject = await queryRows<{ id: string }>(
      `INSERT INTO "Project" (id, "tenantIdentityKind", "tenantIdentity", "jiraProjectId", "jiraProjectKey", "jiraProjectName", "testIssueTypeId", "testIssueTypeName", "projectStatuses", "updatedAt") VALUES ('tab-project-b', 'CLOUD_ID', 'fake-cloud-three', '10001', 'DEMO', 'Demo Project', '100', 'Test', '[]', now()) RETURNING id`,
    )
    const projectB = otherProject[0]!.id
    await queryRows(
      `INSERT INTO "TestCase" (id, "projectId", "issueId", key, "testType", "updatedAt") VALUES ('tab-test-b', $1, 'tab-issue-b', 'DEMO-1', 'Cucumber', now())`,
      [projectB],
    )
    await queryRows(
      `INSERT INTO "WorkspaceProject" (id, "workspaceId", "projectId") VALUES ('tab-project-b-access', $1, $2)`,
      [workspaceId, projectB],
    )
    const tabA = await fetch(`${server.url}/api/tests?project=${projectId}`, {
      headers: { cookie },
    })
    const tabB = await fetch(`${server.url}/api/tests?project=${projectB}`, { headers: { cookie } })
    expect(tabA.status).toBe(200)
    expect(((await tabA.json()) as { total: number }).total).toBeGreaterThan(0)
    expect(tabB.status).toBe(200)
    expect(((await tabB.json()) as { total: number }).total).toBe(1)

    const userId = (
      await queryRows<{ ownerId: string }>(`SELECT "ownerId" FROM "Workspace" WHERE id=$1`, [
        workspaceId,
      ])
    )[0]!.ownerId
    await queryRows(
      `INSERT INTO "TestCaseDraft" (id, "userId", "testCaseId", summary, "updatedAt") VALUES ('private-cache-draft', $1, $2, 'private', now())`,
      [userId, testCase!.id],
    )
    const live = (await (
      await fetch(`${server.url}/api/tests?project=${projectId}`, { headers: { cookie } })
    ).json()) as { values: Array<{ id: string }> }
    expect(live.values.some((test) => test.id === testCase!.id)).toBe(true)
    await queryRows(`DELETE FROM "TestCaseDraft" WHERE id='private-cache-draft'`)
    await queryRows(`DELETE FROM "WorkspaceProject" WHERE id='tab-project-b-access'`)
    await queryRows(`DELETE FROM "Project" WHERE id='tab-project-b'`)
  })

  it('keeps imported tests private and returns only the requesting user’s project drafts', async () => {
    const userId = (
      await queryRows<{ ownerId: string }>('SELECT "ownerId" FROM "Workspace" WHERE id=$1', [
        workspaceId,
      ])
    )[0]!.ownerId
    const otherUser = `cache-other-user-${Date.now()}`
    await queryRows(
      `INSERT INTO "User" (id,"accountId","createdAt","updatedAt") VALUES ($1,$2,now(),now())`,
      [otherUser, `${otherUser}@account`],
    )
    const testCase = (
      await queryRows<{ id: string }>(
        `SELECT id FROM "TestCase" WHERE "projectId"=$1 AND origin='REMOTE' ORDER BY key LIMIT 1`,
        [projectId],
      )
    )[0]!
    await queryRows(
      `INSERT INTO "TestCaseDraft" (id,"userId","testCaseId",summary,"updatedAt") VALUES ('owner-only-draft',$1,$2,'Mine',now()) ON CONFLICT ("userId","testCaseId") DO NOTHING`,
      [userId, testCase.id],
    )
    await queryRows(
      `INSERT INTO "TestCaseDraft" (id,"userId","testCaseId",summary,"updatedAt") VALUES ('other-user-draft',$1,$2,'Other',now()) ON CONFLICT ("userId","testCaseId") DO NOTHING`,
      [otherUser, testCase.id],
    )
    await queryRows(
      `INSERT INTO "TestCase" (id,"ownerId","issueId",key,summary,origin,"updatedAt") VALUES ('private-import',$1,NULL,'LOCAL-1','Private import','IMPORT',now()) ON CONFLICT (id) DO NOTHING`,
      [userId],
    )

    const drafts = (await (
      await fetch(`${server.url}/api/projects/${projectId}/drafts`, { headers: { cookie } })
    ).json()) as { values: Array<{ draftId: string; summary: string | null }>; count: number }
    expect(drafts.count).toBeGreaterThanOrEqual(1)
    expect(drafts.values.some((draft) => draft.draftId === 'owner-only-draft')).toBe(true)
    expect(drafts.values.some((draft) => draft.draftId === 'other-user-draft')).toBe(false)

    const remoteIndex = (await (
      await fetch(`${server.url}/api/tests?project=${projectId}`, { headers: { cookie } })
    ).json()) as { values: Array<{ id: string }> }
    expect(remoteIndex.values.some((row) => row.id === 'private-import')).toBe(false)
    await queryRows(`DELETE FROM "TestCase" WHERE id='private-import'`)
    await queryRows(
      `DELETE FROM "TestCaseDraft" WHERE id IN ('owner-only-draft','other-user-draft')`,
    )
    await queryRows(`DELETE FROM "User" WHERE id=$1`, [otherUser])
  })
})
