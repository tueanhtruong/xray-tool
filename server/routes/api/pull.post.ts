import { getHeader, getQuery, getRequestURL } from 'h3'
import { requireAuthorizedProject } from '../../services/project-selection'
import { getPullJob, PullJobError, releasePullReservation, reservePull, startFullPull } from '../../services/pull-jobs'
import { getAppSession } from '../../utils/session'

export default defineEventHandler(async (event) => {
  const session = await getAppSession(event)
  if (!session) throw httpError(401, 'Sign in to continue.')
  const workspace = await usePrisma().workspace.findFirst({
    where: { id: session.activeWorkspaceId, ownerId: session.userId },
    select: { id: true },
  })
  if (!workspace) throw httpError(404, 'Workspace not found.')
  const projectId = getQuery(event).project
  const projects = typeof projectId === 'string'
    ? [await requireAuthorizedProject(workspace.id, projectId)]
    : await usePrisma().project.findMany({
        where: { workspaceAccess: { some: { workspaceId: workspace.id } } },
        take: 2,
      })
  if (projects.length !== 1) throw httpError(409, 'Choose a project before refreshing its tests.')
  const project = projects[0]!
  if (getPullJob(project.id)?.state === 'running') throw httpError(409, 'A pull is already running')
  const origin = getHeader(event, 'origin')
  if (!origin || new URL(origin).origin !== getRequestURL(event).origin) throw httpError(403, 'Pull request could not be verified.')
  try {
    reservePull(project.id)
    return await startFullPull(workspace.id, project.id, event.context.requestId)
  } catch (error) {
    releasePullReservation(project.id)
    if (error instanceof PullJobError) throw httpError(error.statusCode, error.message)
    if (error instanceof Error && error.name === 'ProjectSelectionError' && 'statusCode' in error) {
      throw httpError(Number(error.statusCode), error.message)
    }
    throw error
  }
})
