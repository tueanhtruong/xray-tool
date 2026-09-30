import { ProjectSelectionError, requireWorkspaceProject } from '../../../services/project-selection'
import { getAppSession } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  const session = await getAppSession(event)
  if (!session) throw httpError(401, 'Sign in to continue.')
  const workspace = await usePrisma().workspace.findFirst({
    where: { id: session.activeWorkspaceId, ownerId: session.userId },
    select: { id: true },
  })
  if (!workspace) throw httpError(404, 'Workspace not found.')
  try {
    await requireWorkspaceProject(workspace.id)
    return { ready: true }
  } catch (error) {
    if (error instanceof ProjectSelectionError) throw httpError(error.statusCode, error.message)
    throw error
  }
})
