import { config } from 'dotenv'

config({ quiet: true })

const clientId = process.env.SANDBOX_XRAY_CLIENT_ID
const clientSecret = process.env.SANDBOX_XRAY_CLIENT_SECRET
const clientId2 = process.env.SANDBOX_XRAY_CLIENT_ID_2
const clientSecret2 = process.env.SANDBOX_XRAY_CLIENT_SECRET_2
const projectId = process.env.SANDBOX_XRAY_PROJECT_ID
const baseUrl = (process.env.SANDBOX_XRAY_BASE_URL || 'https://xray.cloud.getxray.app').replace(/\/$/, '')

if (!clientId || !clientSecret || !projectId || !/^\d+$/.test(projectId)) {
  throw new Error('Set SANDBOX_XRAY_CLIENT_ID, SANDBOX_XRAY_CLIENT_SECRET, and numeric SANDBOX_XRAY_PROJECT_ID to run the Xray contract check.')
}

if (Boolean(clientId2) !== Boolean(clientSecret2)) {
  throw new Error('Set both SANDBOX_XRAY_CLIENT_ID_2 and SANDBOX_XRAY_CLIENT_SECRET_2 to compare a second credential.')
}

async function authenticate(id, secret, label) {
  const response = await fetch(`${baseUrl}/api/v2/authenticate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: id, client_secret: secret }),
    signal: AbortSignal.timeout(45_000),
  })
  if (!response.ok) throw new Error(`Xray sandbox ${label} authentication failed with HTTP ${response.status}.`)
  const text = await response.text()
  let token
  try {
    const parsed = JSON.parse(text)
    token = typeof parsed === 'string' ? parsed : parsed.token
  } catch {
    token = text
  }
  if (typeof token !== 'string' || token.length < 20) {
    throw new Error(`Xray sandbox ${label} returned an invalid authentication token.`)
  }
  return token
}

async function graphql(token, query, variables) {
  const response = await fetch(`${baseUrl}/api/v2/graphql`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(45_000),
  })
  const body = await response.json().catch(() => undefined)
  if (!response.ok || body?.errors?.length || !body?.data) {
    throw new Error(`Xray sandbox GraphQL contract request failed with HTTP ${response.status}.`)
  }
  return body.data
}

async function readFolderTree(token) {
  const folderData = await graphql(token, `
  query VerifyFolderTree($projectId: String!, $path: String!) {
    getFolder(projectId: $projectId, path: $path) {
      name path testsCount preconditionsCount issuesCount folders
    }
  }
`, { projectId, path: '/' })
  const root = folderData.getFolder
  if (!root || root.path !== '/' || !Array.isArray(root.folders)) {
    throw new Error('Xray sandbox folder contract did not return a root folder with a nested folders array.')
  }
  let folderCount = 0
  const foldersByPath = new Map()
  const pending = [...root.folders]
  while (pending.length) {
    const folder = pending.shift()
    if (!folder || typeof folder.name !== 'string' || typeof folder.path !== 'string' || !Array.isArray(folder.folders)) {
      throw new Error('Xray sandbox folder contract returned an invalid nested folder entry.')
    }
    if (folder.testsCount !== null && folder.testsCount !== undefined && !Number.isInteger(folder.testsCount)) {
      throw new Error('Xray sandbox folder contract returned an invalid testsCount.')
    }
    foldersByPath.set(folder.path, {
      name: folder.name,
      path: folder.path,
      testsCount: folder.testsCount ?? 0,
      children: folder.folders.map((child) => child.path).sort(),
    })
    folderCount += 1
    pending.push(...folder.folders)
  }
  return {
    foldersByPath: new Map([...foldersByPath.entries()].sort(([left], [right]) => left.localeCompare(right))),
    folderCount,
  }
}

async function readTestIndex(token) {
  const tests = []
  let start = 0
  let total = null
  do {
    const testData = await graphql(token, `
  query VerifyTestIndex($projectId: String!, $limit: Int!, $start: Int!) {
    getTests(projectId: $projectId, limit: $limit, start: $start) {
      total start limit
      results {
        issueId folder { path }
        jira(fields: ["key", "summary"])
      }
    }
  }
`, { projectId, limit: 100, start })
    const page = testData.getTests
    if (!page || !Number.isInteger(page.total) || page.start !== start || page.limit !== 100 || !Array.isArray(page.results)) {
      throw new Error('Xray sandbox test contract returned an invalid paginated test index.')
    }
    if (total !== null && total !== page.total) throw new Error('Xray sandbox test index total changed during pagination.')
    total = page.total
    for (const test of page.results) {
      const jira = test?.jira
      if (!test?.issueId || typeof jira?.key !== 'string' || typeof jira.summary !== 'string') {
        throw new Error('Xray sandbox test-index contract returned a result missing required issue/key/name fields.')
      }
      tests.push({ issueId: test.issueId, key: jira.key, summary: jira.summary, folderPath: test.folder?.path ?? null })
    }
    if (page.results.length === 0 && start < total) throw new Error('Xray sandbox test index pagination ended early.')
    start += page.results.length
  } while (start < total)
  tests.sort((a, b) => a.issueId.localeCompare(b.issueId))
  if (new Set(tests.map((test) => test.issueId)).size !== tests.length) {
    throw new Error('Xray sandbox test index contains duplicate issue identities.')
  }
  return { total, tests }
}

async function readFolderTestIndex(token, path) {
  const tests = []
  let start = 0
  let total = null
  do {
    const data = await graphql(token, `
      query VerifyFolderTestIndex($projectId: String!, $folder: FolderSearchInput, $limit: Int!, $start: Int!) {
        getTests(projectId: $projectId, folder: $folder, limit: $limit, start: $start) {
          total start limit
          results {
            issueId
            folder { path }
            jira(fields: ["key", "summary"])
          }
        }
      }
    `, { projectId, folder: { path, includeDescendants: true }, limit: 100, start })
    const page = data.getTests
    if (!page || !Number.isInteger(page.total) || page.start !== start || page.limit !== 100 || !Array.isArray(page.results)) {
      throw new Error('Xray sandbox folder test query returned an invalid paginated response.')
    }
    if (total !== null && total !== page.total) throw new Error('Xray sandbox folder test count changed during pagination.')
    total = page.total
    for (const test of page.results) {
      const jira = test?.jira
      if (!test?.issueId || typeof jira?.key !== 'string' || typeof jira.summary !== 'string') {
        throw new Error('Xray sandbox folder test query returned a result missing required issue/key/name fields.')
      }
      tests.push({ issueId: test.issueId, key: jira.key, summary: jira.summary, folderPath: test.folder?.path ?? null })
    }
    if (page.results.length === 0 && start < total) throw new Error('Xray sandbox folder test pagination ended early.')
    start += page.results.length
  } while (start < total)
  tests.sort((a, b) => a.issueId.localeCompare(b.issueId))
  return { total, tests }
}

async function verifyTestDetails(token, test) {
  if (!test) return
  const detailsData = await graphql(token, `
    query VerifyTestDetails($jql: String!, $limit: Int!) {
      getTests(jql: $jql, limit: $limit) {
        results {
          issueId testType { name kind } gherkin folder { path } lastModified
          jira(fields: ["key", "summary", "labels", "status", "updated"])
        }
      }
    }
  `, { jql: `key = "${test.key}"`, limit: 1 })
  const detail = detailsData.getTests?.results?.[0]
  if (detail?.issueId !== test.issueId || !detail?.testType?.name || detail.jira?.key !== test.key) {
    throw new Error('Xray sandbox test-detail contract returned an invalid detail record.')
  }
}

const token = await authenticate(clientId, clientSecret, 'primary')
const folderArgsData = await graphql(token, `
  query VerifyGetTestsArguments {
    __type(name: "Query") {
      fields(includeDeprecated: true) {
        name
        args {
          name
          type {
            kind
            name
            ofType {
              kind
              name
              ofType { kind name }
            }
          }
        }
      }
    }
  }
`)
const getTestsField = folderArgsData.__type?.fields?.find((field) => field.name === 'getTests')
if (!getTestsField || !Array.isArray(getTestsField.args)) {
  throw new Error('Xray sandbox schema introspection did not expose getTests arguments.')
}
const supportsFolderFilter = getTestsField.args.some((arg) => /folder|path/i.test(arg.name))

const folderTree = await readFolderTree(token)
const testIndex = await readTestIndex(token)
await verifyTestDetails(token, testIndex.tests[0])

const candidateFolder = [...folderTree.foldersByPath.values()]
  .filter((folder) => folder.testsCount > 0)
  .sort((a, b) => a.path.localeCompare(b.path))[0]
let folderQueryVerified = false
if (candidateFolder) {
  const subtree = await readFolderTestIndex(token, candidateFolder.path)
  const prefix = `${candidateFolder.path === '/' ? '' : candidateFolder.path}/`
  const expected = testIndex.tests.filter((test) =>
    test.folderPath === candidateFolder.path || test.folderPath?.startsWith(prefix),
  )
  const expectedIds = expected.map((test) => test.issueId).sort()
  const actualIds = subtree.tests.map((test) => test.issueId).sort()
  folderQueryVerified = subtree.total === expected.length &&
    JSON.stringify(actualIds) === JSON.stringify(expectedIds)
  if (!folderQueryVerified) {
    throw new Error('Xray sandbox folder query did not match the full-project index for the selected folder subtree.')
  }
  console.log(`Xray folder query verified for ${candidateFolder.path}: ${subtree.total} tests including descendants.`)
} else {
  console.log('Xray folder query not exercised: sandbox project has no non-empty folder.')
}

if (clientId2 && clientSecret2) {
  const secondToken = await authenticate(clientId2, clientSecret2, 'secondary')
  const [secondFolders, secondIndex] = await Promise.all([
    readFolderTree(secondToken),
    readTestIndex(secondToken),
  ])
  const foldersMatch = JSON.stringify([...folderTree.foldersByPath.entries()]) ===
    JSON.stringify([...secondFolders.foldersByPath.entries()])
  const testsMatch = JSON.stringify(testIndex.tests) === JSON.stringify(secondIndex.tests)
  if (!foldersMatch || !testsMatch || testIndex.total !== secondIndex.total) {
    throw new Error('Xray sandbox credentials returned different project folders or test indexes; shared-cache equivalence is not verified.')
  }
  console.log(`Xray sandbox shared-cache equivalence verified across two credentials: ${folderTree.folderCount} folders, ${testIndex.total} tests.`)
} else {
  console.log('Xray sandbox shared-cache equivalence not checked; configure SANDBOX_XRAY_CLIENT_ID_2 and SANDBOX_XRAY_CLIENT_SECRET_2 to compare a second credential.')
}

console.log(`Xray sandbox contract verified: ${folderTree.folderCount} folders, getTests total=${testIndex.total}, paginated limit=100.`)
console.log(`Xray getTests arguments: ${getTestsField.args.map((arg) => `${arg.name}:${arg.type?.ofType?.name ?? arg.type?.name ?? arg.type?.kind}`).sort().join(', ')}.`)
console.log(`Xray getTests folder filter: ${supportsFolderFilter ? 'available' : 'not available'}.`)
console.log(`Xray folder subtree reconciliation: ${folderQueryVerified ? 'query matches full index; moved/deleted reconciliation still requires a complete membership contract' : 'not verified; use full-project refresh only'}.`)
