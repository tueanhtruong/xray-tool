import { getAppSession } from '../../../utils/session'
import { getPullJob } from '../../../services/pull-jobs'

export default defineEventHandler(async (event) => {
  const session = await getAppSession(event)
  if (!session) throw httpError(401, 'Sign in to continue.')
  const workspace = await usePrisma().workspace.findFirst({
    where: { id: session.activeWorkspaceId, ownerId: session.userId },
    select: { id: true, jiraProjectId: true },
  })
  if (!workspace) throw httpError(404, 'Workspace not found.')
  const job = getPullJob(workspace.id)
  if (!job || job.projectId && job.projectId !== workspace.jiraProjectId) {
    return { state: 'idle', fetched: 0, total: null, folders: null }
  }
  return {
    id: job.id,
    state: job.state,
    fetched: job.fetched,
    total: job.total,
    folders: job.folders,
    kind: job.kind,
    message: job.message,
    requestId: job.requestId,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
  }
})
