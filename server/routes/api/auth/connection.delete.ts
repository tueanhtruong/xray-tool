import { getHeader, getRequestURL } from 'h3'
import { clearAppSession, getAppSession } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  const session = await getAppSession(event)
  if (!session) throw httpError(401, 'Sign in to continue.')
  const origin = getHeader(event, 'origin')
  if (!origin || new URL(origin).origin !== getRequestURL(event).origin) {
    throw httpError(403, 'Disconnect request could not be verified.')
  }
  const workspace = await usePrisma().workspace.findFirst({
    where: { id: session.activeWorkspaceId, ownerId: session.userId },
    select: { id: true },
  })
  if (!workspace) throw httpError(404, 'Jira workspace not found.')
  await usePrisma().$transaction(async (tx) => {
    await tx.jiraConnection.deleteMany({ where: { workspaceId: workspace.id } })
    await tx.workspace.update({ where: { id: workspace.id }, data: { cloudId: null } })
  })
  await clearAppSession(event)
  return { status: 'disconnected' }
})
