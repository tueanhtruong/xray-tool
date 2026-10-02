import { getQuery, getRouterParam } from 'h3'
import {
  fetchFreshTestDetails,
  NOT_READY_REPOSITORY_MESSAGE,
  requireReadyWorkspace,
} from '../../../services/test-details'
import { getAppSession } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  const session = await getAppSession(event)
  if (!session) throw httpError(401, 'Sign in to continue.')
  const projectId = getQuery(event).project
  const workspace = await requireReadyWorkspace(session, typeof projectId === 'string' ? projectId : undefined, NOT_READY_REPOSITORY_MESSAGE)
  const testCaseId = getRouterParam(event, 'testCaseId')
  if (!testCaseId || testCaseId.length > 64) throw httpError(400, 'Choose a valid test case.')
  const testCase = await usePrisma().testCase.findFirst({
    where: { id: testCaseId, projectId: workspace.projectId, origin: 'REMOTE', remoteDeletedAt: null },
    select: { id: true, issueId: true, key: true, summary: true, folderPath: true, remoteDeletedAt: true },
  })
  if (!testCase) throw httpError(404, 'Test case not found in the active project index.')
  if (!testCase.issueId) throw httpError(404, 'Test case not found in the active project index.')
  return fetchFreshTestDetails(workspace.id, testCase, workspace.jiraProjectId)
})
