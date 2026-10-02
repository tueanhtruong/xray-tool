import { getHeader, getRequestURL, readBody } from 'h3'
import { z } from 'zod'
import { JiraProjectApiError } from '../../integrations/jira/projects'
import { ProjectSelectionError, selectWorkspaceProject } from '../../services/project-selection'
import { getAppSession } from '../../utils/session'

const bodySchema = z.object({
  projectId: z.string().regex(/^\d+$/).max(32),
})

export default defineEventHandler(async (event) => {
  const session = await getAppSession(event)
  if (!session) throw httpError(401, 'Sign in to continue.')
  const origin = getHeader(event, 'origin')
  if (!origin || new URL(origin).origin !== getRequestURL(event).origin) {
    throw httpError(403, 'Project selection request could not be verified.')
  }
  const workspace = await usePrisma().workspace.findFirst({
    where: { id: session.activeWorkspaceId, ownerId: session.userId },
    select: { id: true },
  })
  if (!workspace) throw httpError(404, 'Workspace not found.')
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw httpError(400, 'Choose a valid Jira project.')
  try {
    const selected = await selectWorkspaceProject(workspace.id, parsed.data.projectId)
    return { status: 'ready', projectId: selected.id, jiraProjectId: parsed.data.projectId }
  } catch (error) {
    if (error instanceof ProjectSelectionError || error instanceof JiraProjectApiError) {
      throw httpError(error.statusCode, error.message)
    }
    throw error
  }
})
