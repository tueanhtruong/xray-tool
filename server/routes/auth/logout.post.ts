import { createError, getHeader, sendRedirect } from 'h3'
import { clearAppSession } from '../../utils/session'

export default defineEventHandler(async (event) => {
  const origin = getHeader(event, 'origin')
  const host = getHeader(event, 'host')
  if (!origin || !host || new URL(origin).host !== host) {
    throw createError({ statusCode: 403, statusMessage: 'Sign-out request could not be verified.' })
  }
  await clearAppSession(event)
  return sendRedirect(event, '/login', 303)
})
