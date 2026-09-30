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
  return fetch(new URL('/__control', mockUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function oauthSignIn(server: RunningServer): Promise<string> {
  const start = await fetch(`${server.url}/auth/jira/login`, { redirect: 'manual' })
  const stateCookie = start.headers.get('set-cookie')?.split(';', 1)[0] ?? ''
  const authorization = await fetch(start.headers.get('location') ?? '', { redirect: 'manual' })
  const callback = await fetch(authorization.headers.get('location') ?? '', {
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

async function configureXray(server: RunningServer, cookie: string) {
  return fetch(`${server.url}/api/auth/xray`, {
    method: 'PUT',
    headers: { cookie, origin: server.url, 'content-type': 'application/json' },
    body: JSON.stringify({
      region: 'EU',
      clientId: 'mock-xray-client-id',
      clientSecret: 'mock-xray-client-secret',
    }),
  })
}

describe('Jira/Xray project selection', () => {
  let server: RunningServer
  let mock: MockServicesHandle
  let cookie: string

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
    await control({ mode: 'single', projectMode: 'valid', xrayMode: 'valid' })
    cookie = await oauthSignIn(server)
    const xray = await configureXray(server, cookie)
    if (xray.status !== 200) throw new Error(`Xray setup failed: ${await xray.text()}`)
  })

  afterAll(async () => {
    await server?.stop()
    await mock?.stop()
  })

  it('searches bounded pages using the active workspace and rejects unauthenticated requests', async () => {
    const unauthenticated = await fetch(`${server.url}/api/jira/projects?query=ONEDS`)
    expect(unauthenticated.status).toBe(401)

    const page = await fetch(`${server.url}/api/jira/projects?query=&startAt=0&maxResults=1`, {
      headers: { cookie },
    })
    expect(page.status).toBe(200)
    expect(await page.json()).toMatchObject({
      values: [{ id: '10001', key: 'ONEDS', name: 'One Design System' }],
      startAt: 0,
      maxResults: 1,
      total: 3,
      isLast: false,
    })

    const next = await fetch(`${server.url}/api/jira/projects?query=&startAt=1&maxResults=1`, {
      headers: { cookie },
    })
    expect((await next.json()).values).toEqual([{ id: '10002', key: 'DEMO', name: 'Demo Project' }])
    const invalid = await fetch(`${server.url}/api/jira/projects?startAt=-1`, {
      headers: { cookie },
    })
    expect(invalid.status).toBe(400)
  })

  it('searches projects for an API-token workspace through the same Jira project API', async () => {
    const response = await fetch(`${server.url}/api/auth/jira/api-token`, {
      method: 'POST',
      headers: { origin: server.url, 'content-type': 'application/json' },
      body: JSON.stringify({
        siteUrl: 'https://one.atlassian.net',
        email: 'qa@example.com',
        apiToken: 'mock-valid-api-token',
      }),
      redirect: 'manual',
    })
    expect(response.status).toBe(303)
    const apiTokenCookie =
      response.headers
        .getSetCookie()
        .find((entry) => entry.startsWith('nuxt-session='))
        ?.split(';', 1)[0] ?? ''
    const projects = await fetch(`${server.url}/api/jira/projects?query=ONEDS`, {
      headers: { cookie: apiTokenCookie },
    })
    expect(projects.status).toBe(200)
    expect(await projects.json()).toMatchObject({
      values: [{ id: '10001', key: 'ONEDS', name: 'One Design System' }],
    })
  })

  it('stores a ready project only after Jira and Xray checks and preserves it on failures', async () => {
    const select = async (projectId: string, confirmChange = false) =>
      fetch(`${server.url}/api/project`, {
        method: 'PUT',
        headers: { cookie, origin: server.url, 'content-type': 'application/json' },
        body: JSON.stringify({ projectId, confirmChange }),
      })

    const noTest = await control({ projectMode: 'no-test' })
    expect(noTest.status).toBe(200)
    const missingTest = await select('10001')
    expect(missingTest.status).toBe(422)
    expect(await missingTest.text()).toContain('Xray is not enabled for project ONEDS')
    await control({ projectMode: 'valid' })

    const denied = await select('999')
    expect(denied.status).toBe(403)
    expect(await denied.text()).toContain(
      "Xray cannot access project ABC. Check the API key's project permissions",
    )

    const session = await fetch(`${server.url}/api/auth/session`, { headers: { cookie } })
    const sessionBody = (await session.json()) as { workspace: { id: string } }
    const workspaceId = sessionBody.workspace.id
    await queryRows(
      'INSERT INTO "Folder" (id, "workspaceId", "jiraProjectId", path, name) VALUES ($1, $2, $3, $4, $5)',
      ['folder-before-first-selection', workspaceId, '777', '/unrelated', 'unrelated'],
    )

    const selected = await select('10001')
    expect(selected.status, await selected.clone().text()).toBe(200)
    expect(await selected.json()).toEqual({ status: 'ready' })

    const saved = await queryRows<{
      jiraProjectKey: string
      jiraProjectId: string
      testIssueTypeName: string
      projectStatuses: Array<{ id: string; name: string }>
      projectReadyAt: Date
    }>(
      'SELECT "jiraProjectKey", "jiraProjectId", "testIssueTypeName", "projectStatuses", "projectReadyAt" FROM "Workspace" WHERE "jiraProjectKey" = \'ONEDS\'',
    )
    expect(saved[0]).toMatchObject({
      jiraProjectKey: 'ONEDS',
      jiraProjectId: '10001',
      testIssueTypeName: 'Test',
      projectStatuses: [
        { id: '1', name: 'To Do' },
        { id: '2', name: 'Ready' },
      ],
    })
    expect(saved[0]?.projectReadyAt).toBeTruthy()

    expect(
      await queryRows('SELECT id FROM "Folder" WHERE id = $1', ['folder-before-first-selection']),
    ).toHaveLength(1)
    const workspaceRows = await queryRows<{ ownerId: string }>(
      'SELECT "ownerId" FROM "Workspace" WHERE id = $1',
      [workspaceId],
    )
    const workspace = workspaceRows[0]
    expect(workspace).toBeTruthy()

    // A draft in this workspace blocks replacement and preserves both the cache and selection.
    await queryRows(
      'INSERT INTO "Folder" (id, "workspaceId", "jiraProjectId", path, name) VALUES ($1, $2, $3, $4, $5)',
      ['folder-old-project', workspaceId, '10001', '/old', 'old'],
    )
    await queryRows(
      'INSERT INTO "TestCase" (id, "workspaceId", "jiraProjectId", "issueId", key, "testType", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, now())',
      ['test-old-project', workspaceId, '10001', 'issue-old', 'ONEDS-1', 'Cucumber'],
    )
    await queryRows(
      'INSERT INTO "TestCaseSnapshot" (id, "testCaseId", summary, labels, status, fingerprint) VALUES ($1, $2, $3, $4, $5, $6)',
      ['snapshot-old-project', 'test-old-project', 'Old summary', [], 'Ready', 'old-fingerprint'],
    )
    await queryRows(
      'INSERT INTO "TestCaseDraft" (id, "testCaseId", summary, "updatedAt") VALUES ($1, $2, $3, now())',
      ['draft-old-project', 'test-old-project', 'Changed summary'],
    )
    const blocked = await select('10002', true)
    expect(blocked.status).toBe(409)
    expect(await blocked.text()).toContain('Sync or discard unsynced drafts')
    expect(
      await queryRows('SELECT id FROM "Folder" WHERE id = $1', ['folder-old-project']),
    ).toHaveLength(1)
    expect(
      await queryRows('SELECT "jiraProjectId" FROM "Workspace" WHERE id = $1', [workspaceId]),
    ).toEqual([{ jiraProjectId: '10001' }])

    // Drafts and caches in another workspace are isolated from this switch.
    const otherWorkspaceId = 'workspace-other-project'
    await queryRows(
      'INSERT INTO "Workspace" (id, "ownerId", "siteOrigin", "siteUrl", name, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, now(), now())',
      [
        otherWorkspaceId,
        workspace!.ownerId,
        'https://other.atlassian.net',
        'https://other.atlassian.net',
        'Other workspace',
      ],
    )
    await queryRows(
      'INSERT INTO "Folder" (id, "workspaceId", "jiraProjectId", path, name) VALUES ($1, $2, $3, $4, $5)',
      ['folder-other-project', otherWorkspaceId, '10001', '/other', 'other'],
    )
    await queryRows(
      'INSERT INTO "TestCase" (id, "workspaceId", "jiraProjectId", "issueId", key, "testType", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, now())',
      ['test-other-project', otherWorkspaceId, '10001', 'issue-other', 'ONEDS-2', 'Cucumber'],
    )
    await queryRows(
      'INSERT INTO "TestCaseDraft" (id, "testCaseId", summary, "updatedAt") VALUES ($1, $2, $3, now())',
      ['draft-other-project', 'test-other-project', 'Other changed summary'],
    )
    await queryRows('DELETE FROM "TestCaseDraft" WHERE id = $1', ['draft-old-project'])
    const switched = await select('10002', true)
    expect(switched.status, await switched.clone().text()).toBe(200)
    expect(
      await queryRows('SELECT id FROM "Folder" WHERE id = $1', ['folder-old-project']),
    ).toHaveLength(0)
    expect(
      await queryRows('SELECT id FROM "TestCase" WHERE id = $1', ['test-old-project']),
    ).toHaveLength(0)
    expect(
      await queryRows('SELECT id FROM "Folder" WHERE id = $1', ['folder-other-project']),
    ).toHaveLength(1)
    expect(
      await queryRows('SELECT id FROM "TestCaseDraft" WHERE id = $1', ['draft-other-project']),
    ).toHaveLength(1)

    // A readiness failure preserves cache for the currently selected project.
    await queryRows(
      'INSERT INTO "Folder" (id, "workspaceId", "jiraProjectId", path, name) VALUES ($1, $2, $3, $4, $5)',
      ['folder-current-project', workspaceId, '10002', '/current', 'current'],
    )
    const failedProbeSwitch = await select('999', true)
    expect(failedProbeSwitch.status).toBe(403)
    expect(
      await queryRows('SELECT id FROM "Folder" WHERE id = $1', ['folder-current-project']),
    ).toHaveLength(1)

    // Force the final workspace update to fail after cleanup; the transaction must roll back.
    await queryRows(`CREATE FUNCTION reject_project_switch() RETURNS trigger AS $$
      BEGIN
        IF NEW."jiraProjectId" = '10001' THEN RAISE EXCEPTION 'forced update failure'; END IF;
        RETURN NEW;
      END;
    $$ LANGUAGE plpgsql`)
    await queryRows(
      'CREATE TRIGGER reject_project_switch BEFORE UPDATE ON "Workspace" FOR EACH ROW EXECUTE FUNCTION reject_project_switch()',
    )
    let failedPersistence: Response
    try {
      failedPersistence = await select('10001', true)
    } finally {
      await queryRows('DROP TRIGGER reject_project_switch ON "Workspace"')
      await queryRows('DROP FUNCTION reject_project_switch()')
    }
    expect(failedPersistence!.status).toBe(500)
    expect(
      await queryRows('SELECT "jiraProjectId" FROM "Workspace" WHERE id = $1', [workspaceId]),
    ).toEqual([{ jiraProjectId: '10002' }])
    expect(
      await queryRows('SELECT id FROM "Folder" WHERE id = $1', ['folder-current-project']),
    ).toHaveLength(1)

    // Return the shared fixture workspace to its original project for later tests.
    const restored = await select('10001', true)
    expect(restored.status, await restored.clone().text()).toBe(200)
    await queryRows('DELETE FROM "Workspace" WHERE id = $1', [otherWorkspaceId])
    await queryRows('DELETE FROM "Folder" WHERE id = $1', ['folder-current-project'])
    await queryRows('DELETE FROM "Folder" WHERE id = $1', ['folder-before-first-selection'])

    const unconfirmed = await select('10002')
    expect(unconfirmed.status).toBe(409)
    const failedSwitch = await select('999', true)
    expect(failedSwitch.status).toBe(403)
    const stillSelected = await queryRows<{ jiraProjectKey: string }>(
      'SELECT "jiraProjectKey" FROM "Workspace" WHERE "jiraProjectKey" = \'ONEDS\'',
    )
    expect(stillSelected).toHaveLength(1)
  })

  it('keeps unready workspaces out of project repository pages and APIs', async () => {
    const rows = await queryRows<{ id: string }>(
      'SELECT id FROM "Workspace" WHERE "jiraProjectKey" = \'ONEDS\' LIMIT 1',
    )
    const unreadyWorkspaceId = rows[0]?.id
    expect(unreadyWorkspaceId).toBeTruthy()
    await queryRows('UPDATE "Workspace" SET "projectReadyAt" = NULL WHERE id = $1', [
      unreadyWorkspaceId,
    ])
    const page = await fetch(`${server.url}/repository`, {
      headers: { cookie },
      redirect: 'manual',
    })
    expect(page.status).toBe(302)
    expect(page.headers.get('location')).toBe('/')
    const api = await fetch(`${server.url}/api/repository/ready`, { headers: { cookie } })
    expect(api.status).toBe(409)

    await queryRows('UPDATE "Workspace" SET "projectReadyAt" = now() WHERE id = $1', [
      unreadyWorkspaceId,
    ])
  })
})
