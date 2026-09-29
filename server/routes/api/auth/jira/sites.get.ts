import { createError } from 'h3'
import { listPendingSites } from '../../../../services/jira-oauth'
import { clearPendingFlow, readPendingFlow } from '../../../../utils/oauth-cookies'

export default defineEventHandler(async (event) => {
  const id = readPendingFlow(event)
  if (!id)
    throw createError({
      statusCode: 401,
      statusMessage: 'Sign-in flow expired. Please sign in again.',
    })
  const sites = await listPendingSites(id)
  if (!sites) {
    clearPendingFlow(event)
    throw createError({
      statusCode: 410,
      statusMessage: 'Sign-in flow expired. Please sign in again.',
    })
  }
  return { sites: sites.map(({ id: cloudId, name, url }) => ({ cloudId, name, url })) }
})
