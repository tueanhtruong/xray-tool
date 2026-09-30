import { config } from 'dotenv'

config({ quiet: true })

const clientId = process.env.SANDBOX_XRAY_CLIENT_ID
const clientSecret = process.env.SANDBOX_XRAY_CLIENT_SECRET
const projectId = process.env.SANDBOX_XRAY_PROJECT_ID
const baseUrl = (process.env.SANDBOX_XRAY_BASE_URL || 'https://xray.cloud.getxray.app').replace(/\/$/, '')

if (!clientId || !clientSecret || !projectId || !/^\d+$/.test(projectId)) {
  throw new Error('Set SANDBOX_XRAY_CLIENT_ID, SANDBOX_XRAY_CLIENT_SECRET, and numeric SANDBOX_XRAY_PROJECT_ID to run the Xray contract check.')
}

const authResponse = await fetch(`${baseUrl}/api/v2/authenticate`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
  signal: AbortSignal.timeout(15_000),
})
if (!authResponse.ok) throw new Error(`Xray sandbox authentication failed with HTTP ${authResponse.status}.`)
const authText = await authResponse.text()
let token
try {
  const parsed = JSON.parse(authText)
  token = typeof parsed === 'string' ? parsed : parsed.token
} catch {
  token = authText
}
if (typeof token !== 'string' || token.length < 20) throw new Error('Xray sandbox returned an invalid authentication token.')

async function graphql(query, variables) {
  const response = await fetch(`${baseUrl}/api/v2/graphql`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(15_000),
  })
  const body = await response.json().catch(() => undefined)
  if (!response.ok || body?.errors?.length || !body?.data) {
    throw new Error(`Xray sandbox GraphQL contract request failed with HTTP ${response.status}.`)
  }
  return body.data
}

const folderData = await graphql(`
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
const pending = [...root.folders]
while (pending.length) {
  const folder = pending.shift()
  if (!folder || typeof folder.name !== 'string' || typeof folder.path !== 'string' || !Array.isArray(folder.folders)) {
    throw new Error('Xray sandbox folder contract returned an invalid nested folder entry.')
  }
  if (folder.testsCount !== null && folder.testsCount !== undefined && !Number.isInteger(folder.testsCount)) {
    throw new Error('Xray sandbox folder contract returned an invalid testsCount.')
  }
  folderCount += 1
  pending.push(...folder.folders)
}

const testData = await graphql(`
  query VerifyTestIndex($projectId: String!, $limit: Int!, $start: Int!) {
    getTests(projectId: $projectId, limit: $limit, start: $start) {
      total start limit
      results {
        issueId folder { path }
        jira(fields: ["key", "summary"])
      }
    }
  }
`, { projectId, limit: 1, start: 0 })
const page = testData.getTests
if (!page || !Number.isInteger(page.total) || page.start !== 0 || page.limit !== 1 || !Array.isArray(page.results)) {
  throw new Error('Xray sandbox test contract returned an invalid first page.')
}
if (page.results.length > 0) {
  const test = page.results[0]
  const jira = test?.jira
  if (!test?.issueId || typeof jira?.key !== 'string' || typeof jira.summary !== 'string') {
    throw new Error('Xray sandbox test-index contract returned a result missing required issue/key/name fields.')
  }
  const detailsData = await graphql(`
    query VerifyTestDetails($jql: String!, $limit: Int!) {
      getTests(jql: $jql, limit: $limit) {
        results {
          issueId testType { name kind } gherkin folder { path } lastModified
          jira(fields: ["key", "summary", "labels", "status", "updated"])
        }
      }
    }
  `, { jql: `key = "${jira.key}"`, limit: 1 })
  const detail = detailsData.getTests?.results?.[0]
  if (detail?.issueId !== test.issueId || !detail?.testType?.name || detail.jira?.key !== jira.key) {
    throw new Error('Xray sandbox test-detail contract returned an invalid detail record.')
  }
}

console.log(`Xray sandbox contract verified: ${folderCount} folders, getTests total=${page.total}, limit=${page.limit}.`)
