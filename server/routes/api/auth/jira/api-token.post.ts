import { postLoginPath } from '#shared/ui/safe-next-path'
import { getHeader, getRequestURL, readBody } from 'h3'
import { z } from 'zod'
import {
  ApiTokenRateLimitExceeded,
  connectWithApiToken,
  JiraSiteAlreadyConnected,
} from '../../../../services/jira-api-token'

const bodySchema = z.object({
  siteUrl: z.string().min(1).max(512),
  email: z.email().max(320),
  apiToken: z.string().min(1).max(1024),
  next: z.string().max(2048).optional(),
})

export default defineEventHandler(async (event) => {
  const origin = getHeader(event, 'origin')
  const requestUrl = getRequestURL(event)
  if (!origin || new URL(origin).origin !== requestUrl.origin) {
    throw httpError(403, 'Sign-in request could not be verified.')
  }

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw httpError(400, 'Enter a Jira site URL, valid email, and API token.')
  const site = validateJiraSiteUrl(parsed.data.siteUrl)
  if (!site.success) throw httpError(400, site.message)

  try {
    ensureSessionConfig()
    const session = await connectWithApiToken(
      event,
      { origin: site.origin, hostname: site.hostname },
      parsed.data.email,
      parsed.data.apiToken,
    )
    await setAppSession(event, session)
    return { redirectTo: postLoginPath(parsed.data.next) }
  } catch (error) {
    if (error instanceof ApiTokenRateLimitExceeded) throw httpError(429, error.message)
    if (error instanceof JiraSiteAlreadyConnected) throw httpError(409, error.message)
    if (error instanceof Error && error.name === 'JiraApiTokenError') {
      throw httpError(error.message.includes('Jira rejected') ? 401 : 502, error.message)
    }
    throw error
  }
})
