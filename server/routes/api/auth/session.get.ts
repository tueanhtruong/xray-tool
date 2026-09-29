import { createError } from 'h3'
import { getAppSession } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  const session = await getAppSession(event)
  if (!session) throw createError({ statusCode: 401, statusMessage: 'Sign in to continue.' })
  const workspace = await usePrisma().workspace.findFirst({
    where: { id: session.activeWorkspaceId, ownerId: session.userId },
    select: { id: true, name: true, siteUrl: true },
  })
  if (!workspace) throw createError({ statusCode: 401, statusMessage: 'Sign in to continue.' })
  return { workspace }
})
