import { getMissingOAuthConfig } from '#shared/config/schema'
import { safeNextPath } from '#shared/ui/safe-next-path'
import { getQuery, sendRedirect } from 'h3'
import { authorizationUrl } from '../../../integrations/jira/oauth'
import { getOAuthConfig } from '../../../utils/oauth-config'
import { clearLoginNext, newOAuthState, setLoginNext, setOAuthState } from '../../../utils/oauth-cookies'

export default defineEventHandler((event) => {
  const config = getOAuthConfig()
  const missing = getMissingOAuthConfig(config)
  if (missing.length > 0) {
    setResponseStatus(event, 503)
    return {
      statusCode: 503,
      message: `Sign-in is not configured. Set ${missing.join(', ')} in .env.`,
    }
  }

  try {
    ensureSessionConfig()
  } catch (error) {
    setResponseStatus(event, 503)
    return { statusCode: 503, message: (error as Error).message }
  }

  const state = newOAuthState()
  setOAuthState(event, state)
  const next = safeNextPath(getQuery(event).next)
  if (next) setLoginNext(event, next)
  else clearLoginNext(event)
  return sendRedirect(event, authorizationUrl(config, state), 302)
})
