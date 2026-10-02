import { listWorkspaceProjects } from '../../../services/project-selection'
import { getAppSession } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  const session = await getAppSession(event)
  if (!session) throw httpError(401, 'Sign in to continue.')
  const workspace = await usePrisma().workspace.findFirst({
    where: { id: session.activeWorkspaceId, ownerId: session.userId },
    select: { id: true },
  })
  if (!workspace) throw httpError(404, 'Workspace not found.')
  const projects = await listWorkspaceProjects(workspace.id)
  return { ready: projects.length > 0, projects: projects.map(({ id }) => id) }
})
