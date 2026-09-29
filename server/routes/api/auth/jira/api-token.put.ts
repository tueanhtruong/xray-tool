import { getHeader, getRequestURL, readBody } from 'h3'
import { z } from 'zod'
import { replaceWorkspaceApiToken } from '../../../../services/jira-api-token'
import { getAppSession } from '../../../../utils/session'

const bodySchema = z.object({ apiToken: z.string().min(1).max(1024) })

export default defineEventHandler(async (event) => {
  const session = await getAppSession(event)
  if (!session) throw httpError(401, 'Sign in to continue.')
  const origin = getHeader(event, 'origin')
  if (!origin || new URL(origin).origin !== getRequestURL(event).origin) {
    throw httpError(403, 'Token replacement could not be verified.')
  }
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw httpError(400, 'Enter a valid Jira API token.')
  const workspace = await usePrisma().workspace.findFirst({
    where: { id: session.activeWorkspaceId, ownerId: session.userId },
    include: { jiraConnection: true },
  })
  if (!workspace?.jiraConnection || workspace.jiraConnection.authMethod !== 'API_TOKEN') {
    throw httpError(409, 'This workspace does not use an API-token connection.')
  }
  const site = validateJiraSiteUrl(workspace.siteUrl)
  if (!site.success) throw httpError(400, 'The saved Jira site URL is no longer allowed.')
  try {
    await replaceWorkspaceApiToken(
      workspace.id,
      { origin: site.origin, hostname: site.hostname },
      workspace.jiraConnection.apiEmail ?? '',
      parsed.data.apiToken,
    )
  } catch (error) {
    if (error instanceof Error && error.name === 'JiraApiTokenError') {
      throw httpError(error.message.includes('Jira rejected') ? 401 : 502, error.message)
    }
    if (
      error instanceof Error &&
      (error.message.includes('Replacement credentials') || error.message.includes('connection not found'))
    ) {
      throw httpError(400, error.message)
    }
    throw error
  }
  return { status: 'ok' }
})
