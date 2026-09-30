import { getAppSession } from '../../../utils/session'
import { getWorkspaceXrayConnectionStatus } from '../../../services/xray-connection'

export default defineEventHandler(async (event) => {
  const session = await getAppSession(event)
  if (!session) throw httpError(401, 'Sign in to continue.')
  const workspace = await usePrisma().workspace.findFirst({
    where: { id: session.activeWorkspaceId, ownerId: session.userId },
    select: { id: true },
  })
  if (!workspace) throw httpError(404, 'Workspace not found.')
  const connection = await getWorkspaceXrayConnectionStatus(workspace.id)
  return connection ? { configured: true, ...connection } : { configured: false }
})
