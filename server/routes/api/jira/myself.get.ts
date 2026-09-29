import { getAppSession } from '../../../utils/session'
import {
  getWorkspaceJiraClient,
  JiraReauthenticationRequired,
} from '../../../integrations/jira/client'

export default defineEventHandler(async (event) => {
  const session = await getAppSession(event)
  if (!session) throw httpError(401, 'Sign in to continue.')
  try {
    const response = await getWorkspaceJiraClient(session.activeWorkspaceId, event).fetch(
      '/rest/api/3/myself',
    )
    if (!response.ok) throw httpError(502, 'Jira could not complete the request. Please try again.')
    return await response.json()
  } catch (error) {
    if (error instanceof JiraReauthenticationRequired) {
      await clearUserSession(event)
      setResponseStatus(event, 401)
      return { statusCode: 401, message: error.message }
    }
    throw error
  }
})
