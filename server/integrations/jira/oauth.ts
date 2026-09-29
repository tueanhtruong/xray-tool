import { z } from 'zod'
import { logger } from '../../utils/logger'
import { resolveIntegrationUrls } from '../../utils/integration-urls'

export interface AtlassianOAuthConfig {
  atlassianAuthUrl?: string
  atlassianApiUrl?: string
  integrationTarget: 'live' | 'mock'
  mockServicesUrl: string
  atlassianClientId?: string
  atlassianClientSecret?: string
  atlassianRedirectUri?: string
}

export interface JiraSite {
  id: string
  url: string
  name: string
}

export interface AtlassianProfile {
  accountId: string
  name?: string
  email?: string
  avatarUrl?: string
}

export interface OAuthTokens {
  accessToken: string
  refreshToken: string
  expiresAt: Date
  scopes: string[]
}

export const ATLASSIAN_OAUTH_SCOPES = [
  'read:jira-work',
  'write:jira-work',
  'read:jira-user',
  'read:me',
  'offline_access',
] as const

const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().positive(),
  scope: z.string().optional().default(''),
})

const sitesSchema = z.array(
  z.object({
    id: z.string().min(1),
    url: z.url(),
    name: z.string().min(1),
  }),
)

const profileSchema = z.object({
  account_id: z.string().min(1),
  name: z.string().optional(),
  email: z.email().optional(),
  picture: z.url().optional(),
})

export class AtlassianOAuthError extends Error {
  constructor(
    message: string,
    readonly code: 'upstream' | 'invalid_grant' | 'invalid_response' = 'upstream',
  ) {
    super(message)
    this.name = 'AtlassianOAuthError'
  }
}

export function authorizationUrl(config: AtlassianOAuthConfig, state: string): string {
  const urls = resolveIntegrationUrls(config)
  const url = new URL(`${urls.atlassianAuthUrl.replace(/\/+$/, '')}/authorize`)
  url.search = new URLSearchParams({
    audience: 'api.atlassian.com',
    client_id: config.atlassianClientId ?? '',
    scope: ATLASSIAN_OAUTH_SCOPES.join(' '),
    redirect_uri: config.atlassianRedirectUri ?? '',
    response_type: 'code',
    prompt: 'consent',
    state,
  }).toString()
  return url.toString()
}

function oauthConfig(config: AtlassianOAuthConfig) {
  if (!config.atlassianClientId)
    throw new AtlassianOAuthError('NUXT_ATLASSIAN_CLIENT_ID is required.')
  if (!config.atlassianClientSecret)
    throw new AtlassianOAuthError('NUXT_ATLASSIAN_CLIENT_SECRET is required.')
  if (!config.atlassianRedirectUri)
    throw new AtlassianOAuthError('NUXT_ATLASSIAN_REDIRECT_URI is required.')
  return config as AtlassianOAuthConfig & {
    atlassianClientId: string
    atlassianClientSecret: string
    atlassianRedirectUri: string
  }
}

async function requestJson<T>(url: string, init: RequestInit, schema: z.ZodType<T>): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) })
  } catch (error) {
    logger.warn('Atlassian request failed', { url, error })
    throw new AtlassianOAuthError('Atlassian could not be reached. Please try again.')
  }
  if (!response.ok) {
    const status = response.status
    const body = await response.json().catch(() => ({}))
    const upstreamCode = typeof body?.error === 'string' ? body.error : undefined
    logger.warn('Atlassian request returned an error', { url, status, errorCode: upstreamCode })
    throw new AtlassianOAuthError(
      status === 401 || upstreamCode === 'invalid_grant'
        ? 'Atlassian sign-in has expired. Please sign in again.'
        : 'Atlassian could not complete the request. Please try again.',
      upstreamCode === 'invalid_grant' ? 'invalid_grant' : 'upstream',
    )
  }
  const result = schema.safeParse(await response.json())
  if (!result.success) {
    logger.warn('Atlassian returned an invalid response', { url })
    throw new AtlassianOAuthError('Atlassian returned an invalid response.', 'invalid_response')
  }
  return result.data
}

function tokenRequest(config: AtlassianOAuthConfig, body: URLSearchParams): Promise<OAuthTokens> {
  const required = oauthConfig(config)
  const urls = resolveIntegrationUrls(config)
  return requestJson(
    new URL(`${urls.atlassianAuthUrl.replace(/\/+$/, '')}/oauth/token`).toString(),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...Object.fromEntries(body),
        client_id: required.atlassianClientId,
        client_secret: required.atlassianClientSecret,
      }),
    },
    tokenSchema,
  ).then((token) => ({
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: new Date(Date.now() + token.expires_in * 1000),
    scopes: token.scope.split(' ').filter(Boolean),
  }))
}

export function exchangeCode(config: AtlassianOAuthConfig, code: string): Promise<OAuthTokens> {
  const required = oauthConfig(config)
  return tokenRequest(
    required,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: required.atlassianRedirectUri,
    }),
  )
}

export function refreshOAuthToken(
  config: AtlassianOAuthConfig,
  refreshToken: string,
): Promise<OAuthTokens> {
  return tokenRequest(
    config,
    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  )
}

export async function getAccessibleSites(
  config: AtlassianOAuthConfig,
  accessToken: string,
): Promise<JiraSite[]> {
  const urls = resolveIntegrationUrls(config)
  const result = await requestJson(
    new URL(
      `${urls.atlassianApiUrl.replace(/\/+$/, '')}/oauth/token/accessible-resources`,
    ).toString(),
    { headers: { authorization: `Bearer ${accessToken}` } },
    sitesSchema,
  )
  return result
}

export async function getAtlassianProfile(
  config: AtlassianOAuthConfig,
  accessToken: string,
): Promise<AtlassianProfile> {
  const urls = resolveIntegrationUrls(config)
  const profile = await requestJson(
    new URL(`${urls.atlassianApiUrl.replace(/\/+$/, '')}/me`).toString(),
    { headers: { authorization: `Bearer ${accessToken}` } },
    profileSchema,
  )
  return {
    accountId: profile.account_id,
    name: profile.name,
    email: profile.email,
    avatarUrl: profile.picture,
  }
}
