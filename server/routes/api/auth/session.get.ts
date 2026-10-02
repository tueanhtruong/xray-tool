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
      jiraConnection: { select: { id: true } },
      xrayConnection: { select: { id: true } },
      projectAccess: {
        include: { project: true },
        orderBy: { project: { jiraProjectKey: 'asc' } },
      },
    },
  })
  if (!workspace) throw createError({ statusCode: 401, statusMessage: 'Sign in to continue.' })
  return {
    userId: session.userId,
    workspace: {
      id: workspace.id,
      name: workspace.name,
      siteUrl: workspace.siteUrl,
      jiraConnected: Boolean(workspace.jiraConnection),
      xrayConnected: Boolean(workspace.xrayConnection),
      projects: workspace.projectAccess.map(({ project }) => ({
        id: project.id,
        jiraProjectId: project.jiraProjectId,
        jiraProjectKey: project.jiraProjectKey,
        jiraProjectName: project.jiraProjectName,
        projectReadyAt: project.projectReadyAt,
        foldersPulledAt: project.foldersPulledAt,
      })),
      legacyProject: workspace.projectAccess.length === 1 ? workspace.projectAccess[0]!.project.id : null,
      jiraConnection: undefined,
      xrayConnection: undefined,
    },
  }
})
