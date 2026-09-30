import { getQuery } from 'h3'
import { z } from 'zod'
import { JiraProjectApiError } from '../../../integrations/jira/projects'
import { searchWorkspaceProjects } from '../../../services/project-selection'
import { getAppSession } from '../../../utils/session'

const querySchema = z.object({
  query: z.string().trim().max(100).optional().default(''),
  startAt: z.coerce.number().int().min(0).max(10_000).optional().default(0),
  maxResults: z.coerce.number().int().min(1).max(50).optional().default(20),
})

export default defineEventHandler(async (event) => {
  const session = await getAppSession(event)
  if (!session) throw httpError(401, 'Sign in to continue.')
  const workspace = await usePrisma().workspace.findFirst({
    where: { id: session.activeWorkspaceId, ownerId: session.userId },
    select: { id: true },
  })
  if (!workspace) throw httpError(404, 'Workspace not found.')
  const parsed = querySchema.safeParse(getQuery(event))
  if (!parsed.success) throw httpError(400, 'Enter a valid project search and page.')
  try {
    return await searchWorkspaceProjects(
      workspace.id,
      parsed.data.query,
      parsed.data.startAt,
      parsed.data.maxResults,
    )
  } catch (error) {
    if (error instanceof JiraProjectApiError) throw httpError(error.statusCode, error.message)
    throw error
  }
})
