import { getHeader, getRequestURL } from 'h3'
import { getAppSession } from '../../utils/session'
import { getPullJob, PullJobError, releasePullReservation, reservePull, startFullPull } from '../../services/pull-jobs'

export default defineEventHandler(async (event) => {
  const session = await getAppSession(event)
  if (!session) throw httpError(401, 'Sign in to continue.')
  const workspace = await usePrisma().workspace.findFirst({
    where: { id: session.activeWorkspaceId, ownerId: session.userId },
    select: { id: true, projectReadyAt: true, jiraProjectId: true },
  })
  if (!workspace) throw httpError(404, 'Workspace not found.')
  if (!workspace.projectReadyAt || !workspace.jiraProjectId) {
    throw httpError(409, 'Select and verify a Jira/Xray project before pulling tests.')
  }
  if (getPullJob(workspace.id)?.state === 'running') throw httpError(409, 'A pull is already running')
  const origin = getHeader(event, 'origin')
  if (!origin || new URL(origin).origin !== getRequestURL(event).origin) {
    throw httpError(403, 'Pull request could not be verified.')
  }
  try {
    reservePull(workspace.id)
    const job = await startFullPull(workspace.id, event.context.requestId)
    return job
  } catch (error) {
    releasePullReservation(workspace.id)
    if (error instanceof PullJobError) throw httpError(error.statusCode, error.message)
    if (error instanceof Error && error.name === 'ProjectSelectionError' && 'statusCode' in error) {
      throw httpError(Number(error.statusCode), error.message)
    }
    throw error
  }
})
