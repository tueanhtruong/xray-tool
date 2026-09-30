import { createError } from 'h3'
import { getAppSession } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  const session = await getAppSession(event)
  if (!session) throw createError({ statusCode: 401, statusMessage: 'Sign in to continue.' })
  const workspace = await usePrisma().workspace.findFirst({
    where: { id: session.activeWorkspaceId, ownerId: session.userId },
    select: {
      id: true,
      name: true,
      siteUrl: true,
      jiraProjectKey: true,
      jiraProjectId: true,
      jiraProjectName: true,
      projectReadyAt: true,
      jiraConnection: { select: { id: true } },
      xrayConnection: { select: { id: true } },
    },
  })
  if (!workspace) throw createError({ statusCode: 401, statusMessage: 'Sign in to continue.' })
  return {
    workspace: {
      ...workspace,
      jiraConnected: Boolean(workspace.jiraConnection),
      xrayConnected: Boolean(workspace.xrayConnection),
      projectReady: Boolean(workspace.projectReadyAt && workspace.jiraProjectId),
      jiraConnection: undefined,
      xrayConnection: undefined,
    },
  }
})
