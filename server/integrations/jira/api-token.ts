import { z } from 'zod'
import { logger } from '../../utils/logger'
import { getOAuthConfig } from '../../utils/oauth-config'
import { resolveIntegrationUrls } from '../../utils/integration-urls'

const profileSchema = z.object({
  accountId: z.string().min(1),
  displayName: z.string().optional(),
  emailAddress: z.email().optional(),
  self: z.url().optional(),
})

export interface JiraApiTokenProfile {
  accountId: string
  name?: string
  email?: string
  siteUrl: string
}

export class JiraApiTokenError extends Error {
  constructor(
    message: string,
    readonly code: 'invalid_credentials' | 'upstream' | 'invalid_response',
  ) {
    super(message)
    this.name = 'JiraApiTokenError'
  }
}

export async function verifyJiraApiToken(
  site: { origin: string; hostname: string },
  email: string,
  apiToken: string,
): Promise<JiraApiTokenProfile> {
  let response: Response
  try {
    const mockOrigin = resolveIntegrationUrls(getOAuthConfig()).mockJiraSiteUrl
    const targetOrigin = mockOrigin && site.origin.endsWith('.atlassian.net')
      ? mockOrigin
      : site.origin
    response = await fetch(`${targetOrigin}/rest/api/3/myself`, {
      headers: {
        authorization: `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`,
        accept: 'application/json',
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw new JiraApiTokenError('Jira could not be reached. Please try again.', 'upstream')
  }

  if (response.status === 401 || response.status === 403) {
    throw new JiraApiTokenError(
      'Jira rejected these credentials. Check the email and create a new API token at id.atlassian.com.',
      'invalid_credentials',
    )
  }
  if (!response.ok) {
    logger.warn('Jira API-token verification returned an error', {
      hostname: site.hostname,
      status: response.status,
    })
    throw new JiraApiTokenError('Jira could not complete the request. Please try again.', 'upstream')
  }

  const parsed = profileSchema.safeParse(await response.json().catch(() => undefined))
  if (!parsed.success) {
    logger.warn('Jira API-token verification returned an invalid profile', {
      hostname: site.hostname,
    })
    throw new JiraApiTokenError('Jira returned an invalid profile. Please try again.', 'invalid_response')
  }

  return {
    accountId: parsed.data.accountId,
    name: parsed.data.displayName,
    email: parsed.data.emailAddress ?? email,
    siteUrl: site.origin,
  }
}
