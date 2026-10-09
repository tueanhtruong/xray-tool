import { getQuery, getRouterParam } from 'h3'
import { readUserTestDraft } from '../../../services/drafts'
import { requireReadyWorkspace, NOT_READY_REPOSITORY_MESSAGE } from '../../../services/test-details'
import { getAppSession } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  const session = await getAppSession(event)
  if (!session) throw httpError(401, 'Sign in to continue.')
  const project = getQuery(event).project
  const workspace = await requireReadyWorkspace(session, typeof project === 'string' ? project : undefined, NOT_READY_REPOSITORY_MESSAGE)
  const testCaseId = getRouterParam(event, 'testCaseId')
  if (!testCaseId || testCaseId.length > 64) throw httpError(400, 'Choose a valid test case.')
  return readUserTestDraft(session.userId, workspace.id, workspace.projectId, testCaseId)
})
