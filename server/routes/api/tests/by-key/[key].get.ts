import { getRouterParam } from 'h3'
import {
  fetchFreshTestDetails,
  JIRA_KEY_PATTERN,
  NOT_READY_REPOSITORY_MESSAGE,
  requireReadyWorkspace,
} from '../../../../services/test-details'
import { getAppSession } from '../../../../utils/session'

/** Fresh Xray details for a cached test looked up by its key. Nothing is persisted. */
export default defineEventHandler(async (event) => {
  const session = await getAppSession(event)
  if (!session) throw httpError(401, 'Sign in to continue.')
  const workspace = await requireReadyWorkspace(session, NOT_READY_REPOSITORY_MESSAGE)
  const key = getRouterParam(event, 'key')?.toUpperCase()
  if (!key || !JIRA_KEY_PATTERN.test(key)) throw httpError(404, 'Test not found.')
  const testCase = await usePrisma().testCase.findFirst({
    where: { key, workspaceId: workspace.id, jiraProjectId: workspace.jiraProjectId, origin: 'REMOTE' },
    select: { id: true, issueId: true, key: true, summary: true, folderPath: true, remoteDeletedAt: true },
  })
  if (!testCase) throw httpError(404, 'Test not found.')
  return fetchFreshTestDetails(workspace.id, testCase)
})
