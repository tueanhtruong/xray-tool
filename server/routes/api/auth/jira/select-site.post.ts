import { createError, readBody, sendRedirect } from 'h3'
import { z } from 'zod'
import { completePendingGrant } from '../../../../services/jira-oauth'
import { clearPendingFlow, readPendingFlow } from '../../../../utils/oauth-cookies'
import { setAppSession } from '../../../../utils/session'

const bodySchema = z.object({ cloudId: z.string().min(1).max(256) })

export default defineEventHandler(async (event) => {
  const origin = getHeader(event, 'origin')
  const host = getHeader(event, 'host')
  if (!origin || !host || new URL(origin).host !== host) {
    throw createError({ statusCode: 403, statusMessage: 'Site selection could not be verified.' })
  }
  const id = readPendingFlow(event)
  if (!id)
    throw createError({
      statusCode: 401,
      statusMessage: 'Sign-in flow expired. Please sign in again.',
    })
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success)
    throw createError({ statusCode: 400, statusMessage: 'Choose a Jira site to continue.' })

  const session = await completePendingGrant(id, parsed.data.cloudId)
  if (!session) {
    clearPendingFlow(event)
    throw createError({
      statusCode: 400,
      statusMessage: 'That Jira site is not available in this sign-in.',
    })
  }
  clearPendingFlow(event)
  await setAppSession(event, session)
  return sendRedirect(event, '/', 303)
})
