import { getHeader, getRequestURL, readBody } from 'h3'
import { z } from 'zod'
import { JiraProjectApiError } from '../../integrations/jira/projects'
import {
  getWorkspaceProjectReadiness,
  ProjectSelectionError,
  selectWorkspaceProject,
} from '../../services/project-selection'
import { getAppSession } from '../../utils/session'

const bodySchema = z.object({
  projectId: z.string().regex(/^\d+$/).max(32),
  confirmChange: z.boolean().optional().default(false),
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
  const previous = await getWorkspaceProjectReadiness(workspace.id)
  if (
    previous?.projectReadyAt && previous.jiraProjectId !== parsed.data.projectId &&
    !parsed.data.confirmChange
  ) throw httpError(409, 'Confirm changing the selected Jira project.')
  try {
    await selectWorkspaceProject(workspace.id, parsed.data.projectId, parsed.data.confirmChange)
    return { status: 'ready' }
  } catch (error) {
    if (error instanceof ProjectSelectionError || error instanceof JiraProjectApiError) {
      throw httpError(error.statusCode, error.message)
    }
    throw error
  }
})
