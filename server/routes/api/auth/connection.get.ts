import { getAppSession } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  const session = await getAppSession(event)
  if (!session) throw httpError(401, 'Sign in to continue.')
  const workspace = await usePrisma().workspace.findFirst({
    where: { id: session.activeWorkspaceId, ownerId: session.userId },
    select: {
      siteUrl: true,
      jiraConnection: {
        select: { authMethod: true, apiEmail: true, tokenSavedAt: true },
      },
    },
  })
  if (!workspace?.jiraConnection) throw httpError(404, 'No Jira connection is configured.')
  return {
    siteUrl: workspace.siteUrl,
    authMethod: workspace.jiraConnection.authMethod,
    email: workspace.jiraConnection.apiEmail,
    tokenSavedAt: workspace.jiraConnection.tokenSavedAt,
  }
})
