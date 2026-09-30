import { getQuery, sendRedirect } from 'h3'
import { getMissingOAuthConfig } from '#shared/config/schema'
import { AtlassianOAuthError, exchangeCode } from '../../../integrations/jira/oauth'
import {
  createPendingGrant,
  persistSingleSiteGrant,
  resolveOAuthGrant,
} from '../../../services/jira-oauth'
import { getOAuthConfig } from '../../../utils/oauth-config'
import { clearOAuthState, setPendingFlow, readOAuthState } from '../../../utils/oauth-cookies'
import { setAppSession } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const error = typeof query.error === 'string' ? query.error : undefined
  const state = typeof query.state === 'string' ? query.state : undefined
  const cookieState = readOAuthState(event)
  clearOAuthState(event)
  if (!state || !cookieState || state !== cookieState) {
    setResponseStatus(event, 400)
    return sendRedirect(event, '/login?message=verification-failed', 302)
  }
  if (error === 'access_denied') {
    return sendRedirect(event, '/login?message=access-denied', 302)
  }

  const config = getOAuthConfig()
  const missing = getMissingOAuthConfig(config)
  if (missing.length > 0) {
    setResponseStatus(event, 503)
    return sendRedirect(
      event,
      `/login?message=configuration&missing=${encodeURIComponent(missing.join(', '))}`,
      302,
    )
  }

  const code = typeof query.code === 'string' ? query.code : undefined
  if (!code) return sendRedirect(event, '/login?message=verification-failed', 302)

  try {
    ensureSessionConfig()
    const tokens = await exchangeCode(config, code)
    const grant = await resolveOAuthGrant(config, tokens)
    if (grant.sites.length === 1) {
      const session = await persistSingleSiteGrant(grant)
      await setAppSession(event, session)
      return sendRedirect(event, resolvePostLoginPath(event), 302)
    }
    const pendingId = await createPendingGrant(grant)
    setPendingFlow(event, pendingId)
    return sendRedirect(event, '/auth/jira/select-site', 302)
  } catch (caught) {
    const message =
      caught instanceof AtlassianOAuthError && caught.code === 'invalid_grant'
        ? 'Atlassian authorization code was rejected. Please start sign-in again.'
        : 'Atlassian sign-in could not be completed. Please try again.'
    setResponseStatus(event, 502)
    return sendRedirect(
      event,
      `/login?message=oauth-failed&detail=${encodeURIComponent(message)}`,
      302,
    )
  }
})
