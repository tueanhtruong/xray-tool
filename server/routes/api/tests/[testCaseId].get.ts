import { getRouterParam } from 'h3'
import { getXrayTestDetailsByKey } from '../../../integrations/xray/client'
import { getAppSession } from '../../../utils/session'

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export default defineEventHandler(async (event) => {
  const session = await getAppSession(event)
  if (!session) throw httpError(401, 'Sign in to continue.')
  const workspace = await usePrisma().workspace.findFirst({
    where: { id: session.activeWorkspaceId, ownerId: session.userId },
    select: { id: true, jiraProjectId: true, projectReadyAt: true },
  })
  if (!workspace) throw httpError(404, 'Workspace not found.')
  if (!workspace.projectReadyAt || !workspace.jiraProjectId) throw httpError(409, 'Select and verify a Jira/Xray project before opening the test repository.')
  const testCaseId = getRouterParam(event, 'testCaseId')
  if (!testCaseId || testCaseId.length > 64) throw httpError(400, 'Choose a valid test case.')
  const testCase = await usePrisma().testCase.findFirst({
    where: { id: testCaseId, workspaceId: workspace.id, jiraProjectId: workspace.jiraProjectId, origin: 'REMOTE' },
    select: { id: true, issueId: true, key: true, summary: true, folderPath: true, remoteDeletedAt: true },
  })
  if (!testCase) throw httpError(404, 'Test case not found in the active project index.')

  const remote = await getXrayTestDetailsByKey(workspace.id, testCase.key)
  if (remote.issueId !== testCase.issueId) throw httpError(404, 'The indexed test no longer matches the requested Xray issue.')
  const jira = asRecord(remote.jira)
  const status = asRecord(jira.status)
  const labels = Array.isArray(jira.labels) ? jira.labels.filter((label): label is string => typeof label === 'string') : []
  return {
    ...testCase,
    summary: typeof jira.summary === 'string' ? jira.summary : '',
    labels,
    status: typeof status.name === 'string' ? status.name : '',
    testType: remote.testType?.name ?? 'Unknown',
    gherkin: remote.gherkin,
    readOnly: remote.testType?.name.toLowerCase() !== 'cucumber',
  }
})
