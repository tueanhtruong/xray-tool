import { createServer } from 'node:http'
import {
  createApp,
  createRouter,
  defineEventHandler,
  getQuery,
  readBody,
  sendRedirect,
  setResponseStatus,
  toNodeListener,
} from 'h3'

/**
 * Mock services for Atlassian auth, Jira REST and Xray. Run with `pnpm mock`.
 * Supports deterministic Atlassian OAuth/Jira identity scenarios for tests.
 */
export function createMockApp() {
  let mode = 'single'
  let refreshCount = 0
  let apiTokenMyselfCount = 0
  let xrayMode = 'valid'
  let xrayAuthenticateCount = 0
  let xrayGraphqlCount = 0
  let xrayIndexQueryCount = 0
  let xrayDetailQueryCount = 0
  let xrayUnauthorizedRemaining = 0
  let xrayRateLimitRemaining = 0
  let xrayUnavailableRemaining = 0
  let xrayFolderMode = 'empty'
  let xrayFolderFailurePath = ''
  let xrayTestMode = 'five'
  let xrayTestRevision = 0
  let xrayTestFailureStart = -1
  let xrayDelayMs = 0
  let projectSearchCount = 0
  let writeRequestCount = 0
  let projectMode = 'valid'
  const router = createRouter()
    .get(
      '/health',
      defineEventHandler(() => ({ status: 'ok', service: 'mock-services' })),
    )
    .post(
      '/__control',
      defineEventHandler(async (event) => {
        const body = (await readBody(event)) as {
          mode?: unknown
          resetRefreshCount?: unknown
          resetApiTokenMyselfCount?: unknown
          xrayMode?: unknown
          xrayUnauthorizedRemaining?: unknown
          xrayRateLimitRemaining?: unknown
          xrayUnavailableRemaining?: unknown
          xrayFolderMode?: unknown
          xrayFolderFailurePath?: unknown
          xrayTestMode?: unknown
          xrayTestRevision?: unknown
          xrayTestFailureStart?: unknown
          xrayDelayMs?: unknown
          resetXrayCounts?: unknown
          projectMode?: unknown
          resetProjectSearchCount?: unknown
          resetWriteRequestCount?: unknown
        }
        if (typeof body.mode === 'string') mode = body.mode
        if (body.resetRefreshCount === true) refreshCount = 0
        if (body.resetApiTokenMyselfCount === true) apiTokenMyselfCount = 0
        if (typeof body.xrayMode === 'string') xrayMode = body.xrayMode
        if (typeof body.projectMode === 'string') projectMode = body.projectMode
        if (body.resetProjectSearchCount === true) projectSearchCount = 0
        if (body.resetWriteRequestCount === true) writeRequestCount = 0
        if (typeof body.xrayUnauthorizedRemaining === 'number') {
          xrayUnauthorizedRemaining = Math.max(0, Math.floor(body.xrayUnauthorizedRemaining))
        }
        if (typeof body.xrayRateLimitRemaining === 'number') {
          xrayRateLimitRemaining = Math.max(0, Math.floor(body.xrayRateLimitRemaining))
        }
        if (typeof body.xrayUnavailableRemaining === 'number') {
          xrayUnavailableRemaining = Math.max(0, Math.floor(body.xrayUnavailableRemaining))
        }
        if (typeof body.xrayFolderMode === 'string') xrayFolderMode = body.xrayFolderMode
        if (typeof body.xrayFolderFailurePath === 'string')
          xrayFolderFailurePath = body.xrayFolderFailurePath
        if (typeof body.xrayTestMode === 'string') xrayTestMode = body.xrayTestMode
        if (typeof body.xrayTestRevision === 'number')
          xrayTestRevision = Math.max(0, Math.floor(body.xrayTestRevision))
        if (typeof body.xrayTestFailureStart === 'number')
          xrayTestFailureStart = Math.floor(body.xrayTestFailureStart)
        if (typeof body.xrayDelayMs === 'number')
          xrayDelayMs = Math.max(0, Math.min(10_000, Math.floor(body.xrayDelayMs)))
        if (body.resetXrayCounts === true) {
          xrayAuthenticateCount = 0
          xrayGraphqlCount = 0
          xrayIndexQueryCount = 0
          xrayDetailQueryCount = 0
        }
        return {
          mode,
          refreshCount,
          apiTokenMyselfCount,
          xrayMode,
          xrayAuthenticateCount,
          xrayGraphqlCount,
          xrayIndexQueryCount,
          xrayDetailQueryCount,
          xrayUnauthorizedRemaining,
          xrayRateLimitRemaining,
          xrayUnavailableRemaining,
          xrayFolderMode,
          xrayFolderFailurePath,
          xrayTestMode,
          xrayTestRevision,
          xrayTestFailureStart,
          xrayDelayMs,
          projectMode,
          projectSearchCount,
          writeRequestCount,
        }
      }),
    )
    .get(
      '/__control',
      defineEventHandler(() => ({
        mode,
        refreshCount,
        apiTokenMyselfCount,
        xrayMode,
        xrayAuthenticateCount,
        xrayGraphqlCount,
        xrayIndexQueryCount,
        xrayDetailQueryCount,
        xrayUnauthorizedRemaining,
        xrayRateLimitRemaining,
        xrayUnavailableRemaining,
        xrayFolderMode,
        xrayFolderFailurePath,
        xrayTestMode,
        xrayTestRevision,
        xrayTestFailureStart,
        xrayDelayMs,
        projectMode,
        projectSearchCount,
        writeRequestCount,
      })),
    )
    .post(
      '/xray/api/v2/authenticate',
      defineEventHandler(async (event) => {
        xrayAuthenticateCount += 1
        const body = (await readBody(event)) as Record<string, unknown>
        if (
          xrayMode === 'invalid-credentials' ||
          body.client_id !== 'mock-xray-client-id' ||
          body.client_secret !== 'mock-xray-client-secret'
        ) {
          setResponseStatus(event, 401)
          return { error: 'invalid_client' }
        }
        return `header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 600 })).toString('base64url')}.signature`
      }),
    )
    .post(
      '/xray/api/v2/graphql',
      defineEventHandler(async (event) => {
        xrayGraphqlCount += 1
        const authorization = event.node.req.headers.authorization
        if (!authorization?.startsWith('Bearer header.')) {
          setResponseStatus(event, 401)
          return { errors: [{ message: 'Unauthorized' }] }
        }
        if (xrayUnauthorizedRemaining > 0) {
          xrayUnauthorizedRemaining -= 1
          setResponseStatus(event, 401)
          return { errors: [{ message: 'Unauthorized' }] }
        }
        if (xrayRateLimitRemaining > 0) {
          xrayRateLimitRemaining -= 1
          event.node.res.setHeader('retry-after', '0')
          setResponseStatus(event, 429)
          return { errors: [{ message: 'Rate limited' }] }
        }
        if (xrayUnavailableRemaining > 0) {
          xrayUnavailableRemaining -= 1
          setResponseStatus(event, 503)
          return { errors: [{ message: 'Temporarily unavailable' }] }
        }
        const body = (await readBody(event)) as { query?: unknown; variables?: unknown }
        if (xrayMode === 'graphql-errors') {
          return { errors: [{ message: 'API key lacks permission for project DEMO' }] }
        }
        const variables = body.variables as
          | { projectId?: unknown; path?: unknown; start?: unknown; limit?: unknown; jql?: unknown }
          | undefined
        if (variables?.projectId === '999' || xrayMode === 'project-denied') {
          return { errors: [{ message: 'API key lacks permission for this project' }] }
        }
        if (body.query && String(body.query).includes('GetFolder')) {
          if (xrayDelayMs) await new Promise((resolve) => setTimeout(resolve, xrayDelayMs))
          if (xrayMode === 'project-unavailable') {
            setResponseStatus(event, 503)
            return { errors: [{ message: 'Temporarily unavailable' }] }
          }
          const path = String(variables?.path ?? '/')
          if (xrayFolderFailurePath && (path === xrayFolderFailurePath || path === '/')) {
            return { errors: [{ message: 'Folder traversal failed in mock' }] }
          }
          const folderMap = mockFolders(xrayFolderMode)
          return { data: { getFolder: folderMap.get(path) ?? null } }
        }
        if (body.query && String(body.query).includes('GetTestDetails')) {
          xrayDetailQueryCount += 1
          if (xrayDelayMs) await new Promise((resolve) => setTimeout(resolve, xrayDelayMs))
          const jql = String(variables?.jql ?? '')
          const keys = [...jql.matchAll(/"([A-Z][A-Z0-9_]*-\d+)"/g)].map((match) => match[1])
          const tests = mockTests(xrayTestMode, xrayTestRevision).filter((item) =>
            keys.includes(item.jira.key),
          )
          return { data: { getTests: { results: tests.slice(0, Number(variables?.limit ?? 1)) } } }
        }
        if (body.query && String(body.query).includes('GetTestIndex')) {
          xrayIndexQueryCount += 1
          if (xrayDelayMs) await new Promise((resolve) => setTimeout(resolve, xrayDelayMs))
          const start = Number(variables?.start ?? 0)
          const limit = Number(variables?.limit ?? 100)
          if (xrayTestFailureStart >= 0 && start >= xrayTestFailureStart) {
            return { errors: [{ message: 'Test page failed in mock' }] }
          }
          const tests = mockTests(xrayTestMode, xrayTestRevision).map(
            ({ issueId, folder, jira }) => ({
              issueId,
              folder,
              jira: { key: jira.key, summary: jira.summary },
            }),
          )
          return {
            data: {
              getTests: {
                total: tests.length,
                start,
                limit,
                results: tests.slice(start, start + limit),
              },
            },
          }
        }
        return { data: { query: body.query ?? null, variables: body.variables ?? null } }
      }),
    )
    .get(
      '/atlassian-auth/authorize',
      defineEventHandler((event) => {
        const query = getQuery(event)
        const callback = new URL(String(query.redirect_uri))
        if (mode === 'denied') {
          callback.searchParams.set('error', 'access_denied')
          callback.searchParams.set('state', String(query.state ?? ''))
        } else {
          callback.searchParams.set(
            'code',
            mode === 'invalid-code' ? 'invalid-test-code' : 'test-code',
          )
          callback.searchParams.set('state', String(query.state ?? ''))
        }
        return sendRedirect(event, callback.toString(), 302)
      }),
    )
    .post(
      '/atlassian-auth/oauth/token',
      defineEventHandler(async (event) => {
        const body = (await readBody(event)) as Record<string, unknown>
        if (body.grant_type === 'authorization_code') {
          if (body.code !== 'test-code') {
            setResponseStatus(event, 400)
            return { error: 'invalid_grant' }
          }
          return {
            access_token: mode === 'expired' ? 'mock-expired-access-token' : 'mock-access-token',
            refresh_token: mode === 'revoked' ? 'mock-revoked-refresh-token' : 'mock-refresh-token',
            expires_in: mode === 'expired' || mode === 'revoked' ? 30 : 3600,
            scope: 'read:jira-work write:jira-work read:jira-user read:me offline_access',
            token_type: 'Bearer',
          }
        }
        if (body.grant_type === 'refresh_token') {
          refreshCount += 1
          await new Promise((resolve) => setTimeout(resolve, 75))
          if (mode === 'revoked' || body.refresh_token === 'mock-revoked-refresh-token') {
            setResponseStatus(event, 400)
            return { error: 'invalid_grant' }
          }
          return {
            access_token: 'mock-rotated-access-token',
            refresh_token: 'mock-rotated-refresh-token',
            expires_in: 3600,
            scope: 'read:jira-work write:jira-work read:jira-user read:me offline_access',
            token_type: 'Bearer',
          }
        }
        setResponseStatus(event, 400)
        return { error: 'unsupported_grant_type' }
      }),
    )
    .get(
      '/atlassian-api/oauth/token/accessible-resources',
      defineEventHandler(() =>
        mode === 'multi'
          ? [
              {
                id: 'fake-cloud-one',
                url: 'https://one.example.atlassian.net',
                name: 'Example One',
              },
              {
                id: 'fake-cloud-two',
                url: 'https://two.example.atlassian.net',
                name: 'Example Two',
              },
            ]
          : [
              {
                id: 'fake-cloud-one',
                url: 'https://one.example.atlassian.net',
                name: 'Example One',
              },
            ],
      ),
    )
    .get(
      '/atlassian-api/me',
      defineEventHandler(() => ({
        account_id: 'fake-atlassian-account',
        name: 'Example QA',
        email: 'qa@example.com',
        picture: 'https://avatar.example.test/fake.png',
      })),
    )
    .get(
      '/atlassian-api/ex/jira/:cloudId/rest/api/3/project/search',
      defineEventHandler((event) => {
        projectSearchCount += 1
        const query = getQuery(event)
        const projects = [
          { id: '10001', key: 'ONEDS', name: 'One Design System' },
          { id: '10002', key: 'DEMO', name: 'Demo Project' },
          { id: '999', key: 'ABC', name: 'Restricted Project' },
        ].filter((project) => {
          if (projectMode === 'no-test' && project.key === 'ONEDS') return true
          return `${project.key} ${project.name}`
            .toLowerCase()
            .includes(String(query.query ?? '').toLowerCase())
        })
        const startAt = Number(query.startAt ?? 0)
        const maxResults = Number(query.maxResults ?? 20)
        const values = projects.slice(startAt, startAt + maxResults)
        return {
          startAt,
          maxResults,
          total: projects.length,
          isLast: startAt + values.length >= projects.length,
          values,
        }
      }),
    )
    .get(
      '/atlassian-api/ex/jira/:cloudId/rest/api/3/project/:projectId',
      defineEventHandler((event) => {
        const projectId = event.context.params?.projectId ?? ''
        const project = [
          { id: '10001', key: 'ONEDS', name: 'One Design System' },
          { id: '10002', key: 'DEMO', name: 'Demo Project' },
          { id: '999', key: 'ABC', name: 'Restricted Project' },
        ].find((candidate) => candidate.id === projectId)
        if (!project) {
          setResponseStatus(event, 404)
          return { errorMessages: ['Project not found'] }
        }
        return {
          ...project,
          issueTypes:
            projectMode === 'no-test' && project.key === 'ONEDS'
              ? [{ id: '10000', name: 'Story' }]
              : [
                  { id: '10000', name: 'Story' },
                  { id: '10001', name: 'Test' },
                ],
        }
      }),
    )
    .get(
      '/atlassian-api/ex/jira/:cloudId/rest/api/3/issuetype/project',
      defineEventHandler((event) => {
        const query = getQuery(event)
        return projectMode === 'no-test' && query.projectId === '10001'
          ? [{ id: '10000', name: 'Story' }]
          : [
              { id: '10000', name: 'Story' },
              { id: '10001', name: 'Test' },
            ]
      }),
    )
    .get(
      '/atlassian-api/ex/jira/:cloudId/rest/api/3/project/:projectId/statuses',
      defineEventHandler(() => [
        {
          id: '10001',
          name: 'Test',
          statuses: [
            { id: '1', name: 'To Do' },
            { id: '2', name: 'Ready' },
          ],
        },
      ]),
    )
    .get(
      '/atlassian-api/ex/jira/:cloudId/rest/api/3/myself',
      defineEventHandler((event) => ({
        accountId: 'fake-atlassian-account',
        cloudId: event.context.params?.cloudId,
        displayName: 'Example QA',
      })),
    )
    .get(
      '/jira-site/rest/api/3/project/search',
      defineEventHandler((event) => {
        projectSearchCount += 1
        const query = getQuery(event)
        const projects = [
          { id: '10001', key: 'ONEDS', name: 'One Design System' },
          { id: '10002', key: 'DEMO', name: 'Demo Project' },
          { id: '999', key: 'ABC', name: 'Restricted Project' },
        ].filter((project) =>
          `${project.key} ${project.name}`
            .toLowerCase()
            .includes(String(query.query ?? '').toLowerCase()),
        )
        const startAt = Number(query.startAt ?? 0)
        const maxResults = Number(query.maxResults ?? 20)
        const values = projects.slice(startAt, startAt + maxResults)
        return {
          startAt,
          maxResults,
          total: projects.length,
          isLast: startAt + values.length >= projects.length,
          values,
        }
      }),
    )
    .get(
      '/jira-site/rest/api/3/project/:projectId',
      defineEventHandler((event) => {
        const projectId = event.context.params?.projectId ?? ''
        const project = [
          { id: '10001', key: 'ONEDS', name: 'One Design System' },
          { id: '10002', key: 'DEMO', name: 'Demo Project' },
          { id: '999', key: 'ABC', name: 'Restricted Project' },
        ].find((candidate) => candidate.id === projectId)
        if (!project) {
          setResponseStatus(event, 404)
          return { errorMessages: ['Project not found'] }
        }
        return {
          ...project,
          issueTypes:
            projectMode === 'no-test' && project.key === 'ONEDS'
              ? [{ id: '10000', name: 'Story' }]
              : [
                  { id: '10000', name: 'Story' },
                  { id: '10001', name: 'Test' },
                ],
        }
      }),
    )
    .get(
      '/jira-site/rest/api/3/issuetype/project',
      defineEventHandler((event) => {
        const query = getQuery(event)
        return projectMode === 'no-test' && query.projectId === '10001'
          ? [{ id: '10000', name: 'Story' }]
          : [
              { id: '10000', name: 'Story' },
              { id: '10001', name: 'Test' },
            ]
      }),
    )
    .get(
      '/jira-site/rest/api/3/project/:projectId/statuses',
      defineEventHandler(() => [
        {
          id: '10001',
          name: 'Test',
          statuses: [
            { id: '1', name: 'To Do' },
            { id: '2', name: 'Ready' },
          ],
        },
      ]),
    )
    .get(
      '/jira-site/rest/api/3/myself',
      defineEventHandler((event) => {
        apiTokenMyselfCount += 1
        const authorization = event.node.req.headers.authorization
        const expected = `Basic ${Buffer.from('qa@example.com:mock-valid-api-token').toString('base64')}`
        if (authorization !== expected) {
          setResponseStatus(event, 401)
          return { errorMessages: ['Unauthorized'] }
        }
        return {
          accountId: 'fake-atlassian-account',
          displayName: 'Example QA',
          emailAddress: 'qa@example.com',
          self: 'https://one.atlassian.net/rest/api/3/user?accountId=fake-atlassian-account',
        }
      }),
    )
  const app = createApp()
  // Counts requests that would modify remote data: non-GET Jira REST calls and Xray GraphQL
  // mutations. OAuth token exchange and Xray authentication are not writes and are not counted.
  app.use(
    defineEventHandler(async (event) => {
      const method = event.method
      const path = event.path.split('?')[0] ?? ''
      if (path.includes('/rest/api/') && method !== 'GET' && method !== 'HEAD') {
        writeRequestCount += 1
      } else if (path === '/xray/api/v2/graphql' && method === 'POST') {
        const body = (await readBody(event).catch(() => undefined)) as
          { query?: unknown } | undefined
        if (typeof body?.query === 'string' && /^\s*mutation\b/.test(body.query))
          writeRequestCount += 1
      }
    }),
  )
  app.use(router)
  return app
}

function mockFolders(mode: string): Map<
  string,
  {
    name: string
    path: string
    testsCount: number
    preconditionsCount: number
    issuesCount: number
    folders: Array<{
      name: string
      path: string
      testsCount: number
      preconditionsCount: number
      issuesCount: number
      folders: unknown[]
    }>
  }
> {
  const tree = new Map<
    string,
    {
      name: string
      path: string
      testsCount: number
      preconditionsCount: number
      issuesCount: number
      folders: Array<{
        name: string
        path: string
        testsCount: number
        preconditionsCount: number
        issuesCount: number
        folders: unknown[]
      }>
    }
  >()
  if (mode === 'flat') {
    tree.set('/', {
      name: '',
      path: '/',
      testsCount: 0,
      preconditionsCount: 0,
      issuesCount: 0,
      folders: [
        {
          name: 'Autocomplete',
          path: '/Autocomplete',
          testsCount: 3,
          preconditionsCount: 0,
          issuesCount: 3,
          folders: [
            {
              name: 'Focus',
              path: '/Autocomplete/Focus',
              testsCount: 1,
              preconditionsCount: 0,
              issuesCount: 1,
              folders: [],
            },
          ],
        },
        {
          name: 'Billing',
          path: '/Billing',
          testsCount: 2,
          preconditionsCount: 0,
          issuesCount: 2,
          folders: [],
        },
        {
          name: 'Search',
          path: '/Search',
          testsCount: 0,
          preconditionsCount: 0,
          issuesCount: 0,
          folders: [],
        },
      ],
    })
  } else if (mode === 'deep') {
    const roots: Array<{
      name: string
      path: string
      testsCount: number
      preconditionsCount: number
      issuesCount: number
      folders: unknown[]
    }> = []
    let children = roots
    let path = ''
    for (let depth = 1; depth <= 6; depth += 1) {
      path += `/Level${depth}`
      const entry = {
        name: `Level${depth}`,
        path,
        testsCount: depth,
        preconditionsCount: 0,
        issuesCount: depth,
        folders: [] as unknown[],
      }
      children.push(entry)
      children = entry.folders as typeof roots
    }
    tree.set('/', {
      name: '',
      path: '/',
      testsCount: 0,
      preconditionsCount: 0,
      issuesCount: 0,
      folders: roots,
    })
  } else if (mode === 'large') {
    tree.set('/', {
      name: '',
      path: '/',
      testsCount: 0,
      preconditionsCount: 0,
      issuesCount: 500,
      folders: Array.from({ length: 500 }, (_, index) => ({
        name: `Folder-${String(index + 1).padStart(3, '0')}`,
        path: `/Folder-${String(index + 1).padStart(3, '0')}`,
        testsCount: 0,
        preconditionsCount: 0,
        issuesCount: 0,
        folders: [],
      })),
    })
  } else {
    tree.set('/', {
      name: '',
      path: '/',
      testsCount: 0,
      preconditionsCount: 0,
      issuesCount: 0,
      folders: [],
    })
  }
  return tree
}

function mockTests(mode: string, revision = 0) {
  const count = mode === 'empty' ? 0 : mode === 'large' ? 1000 : 5
  return Array.from({ length: count }, (_, index) => {
    const key = `ONEDS-${14043 + index}`
    const manual = index === 3
    const generic = index === 4
    return {
      issueId: String(20000 + index),
      testType: {
        name: manual ? 'Manual' : generic ? 'Generic' : 'Cucumber',
        kind: manual ? 'Steps' : generic ? 'Unstructured' : 'Gherkin',
      },
      gherkin:
        manual || generic
          ? null
          : index === 1
            ? 'Scenario Outline: Search\n Given a query <term>\n Examples:\n | term |\n | one |'
            : `Scenario: ${key}\n Given a repository test`,
      folder: { path: index % 2 === 0 ? '/Autocomplete' : '/Autocomplete/Focus' },
      lastModified: '2026-09-30T00:00:00.000Z',
      jira: {
        key,
        summary:
          index === 2
            ? '<img src=x onerror=alert(1)>'
            : `Repository test ${index + 1}${revision ? ` revision ${revision}` : ''}`,
        updated: '2026-09-30T00:00:00.000Z',
      },
    }
  })
}

const port = Number(process.env.MOCK_SERVICES_PORT ?? 4010)
const server = createServer(toNodeListener(createMockApp()))

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(
      `Port ${port} is already in use. Stop the other process or set MOCK_SERVICES_PORT (and NUXT_MOCK_SERVICES_URL) to a free port.`,
    )
  } else {
    console.error(error)
  }
  process.exit(1)
})

server.listen(port, () => {
  console.log(`mock-services listening on http://localhost:${port}`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)))
}
