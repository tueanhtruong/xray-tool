import { getRouterParam } from 'h3'
import { listUserAuthorizedProjectDrafts, requireAuthorizedProject } from '../../../../services/project-selection'
import { getAppSession } from '../../../../utils/session'

export default defineEventHandler(async (event) => {
  const session = await getAppSession(event)
  if (!session) throw httpError(401, 'Sign in to continue.')
  const workspace = await usePrisma().workspace.findFirst({
    where: { id: session.activeWorkspaceId, ownerId: session.userId },
    select: { id: true },
  })
  if (!workspace) throw httpError(404, 'Workspace not found.')
  const projectId = getRouterParam(event, 'projectId')
  const project = await requireAuthorizedProject(workspace.id, projectId)
  const drafts = await listUserAuthorizedProjectDrafts(session.userId, project.id)
  return {
    project: { id: project.id, key: project.jiraProjectKey, name: project.jiraProjectName },
    count: drafts.length,
    values: drafts.map(({ id: draftId, updatedAt, testCase, summary, labels, status, gherkin, ...fields }) => ({
      ...testCase,
      ...fields,
      draftId,
      updatedAt,
      localFields: { summary, labels, status, gherkin },
    })),
  }
})
