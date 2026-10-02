import { getQuery } from 'h3'
import { getAppSession } from '../../../utils/session'
import { getPullJob } from '../../../services/pull-jobs'
import { requireAuthorizedProject } from '../../../services/project-selection'

export default defineEventHandler(async (event) => {
  const session = await getAppSession(event)
  if (!session) throw httpError(401, 'Sign in to continue.')
  const workspace = await usePrisma().workspace.findFirst({
    where: { id: session.activeWorkspaceId, ownerId: session.userId },
    select: { id: true },
  })
  if (!workspace) throw httpError(404, 'Workspace not found.')
  const projectId = getQuery(event).project
  let resolvedProjectId: string | undefined
  if (typeof projectId === 'string') {
    resolvedProjectId = (await requireAuthorizedProject(workspace.id, projectId)).id
  } else {
    const accesses = await usePrisma().workspaceProject.findMany({ where: { workspaceId: workspace.id }, select: { projectId: true }, take: 2 })
    if (accesses.length === 1) resolvedProjectId = accesses[0]!.projectId
  }
  if (!resolvedProjectId) return { state: 'idle', fetched: 0, total: null, folders: null }
  const job = getPullJob(resolvedProjectId)
  if (!job) {
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
