import { getHeader, getRequestURL } from 'h3'
import { getAppSession } from '../../../utils/session'
import { getPullJob, PullJobError, releasePullReservation, reservePull, startFolderPull } from '../../../services/pull-jobs'

export default defineEventHandler(async (event) => {
  const session = await getAppSession(event)
  if (!session) throw httpError(401, 'Sign in to continue.')
  const workspace = await usePrisma().workspace.findFirst({
    where: { id: session.activeWorkspaceId, ownerId: session.userId },
    select: { id: true, projectReadyAt: true, jiraProjectId: true },
  })
  if (!workspace) throw httpError(404, 'Workspace not found.')
  if (!workspace.projectReadyAt || !workspace.jiraProjectId) {
    throw httpError(409, 'Select and verify a Jira/Xray project before pulling folders.')
  }
  const existing = getPullJob(workspace.id)
  if (existing?.state === 'running') throw httpError(409, 'A pull is already running')
  try {
    reservePull(workspace.id)
  } catch (error) {
    if (error instanceof PullJobError) throw httpError(error.statusCode, error.message)
    throw error
  }
  const origin = getHeader(event, 'origin')
  if (!origin || new URL(origin).origin !== getRequestURL(event).origin) {
    releasePullReservation(workspace.id)
    throw httpError(403, 'Pull request could not be verified.')
  }
  try {
    const job = await startFolderPull(workspace.id, event.context.requestId)
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
