import { getMissingOAuthConfig } from '#shared/config/schema'
import { sendRedirect } from 'h3'
import { authorizationUrl } from '../../../integrations/jira/oauth'
import { getOAuthConfig } from '../../../utils/oauth-config'
import { newOAuthState, setOAuthState } from '../../../utils/oauth-cookies'

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
  return sendRedirect(event, authorizationUrl(config, state), 302)
})
