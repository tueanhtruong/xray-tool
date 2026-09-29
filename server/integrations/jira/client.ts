import type { H3Event } from 'h3'
import { isTokenExpiring } from '#shared/auth/token-expiry'
import { refreshOAuthToken, AtlassianOAuthError } from './oauth'
import { getOAuthConfig } from '../../utils/oauth-config'
import { resolveIntegrationUrls } from '../../utils/integration-urls'
import { clearAppSession } from '../../utils/session'
import { hasValidJiraCredentialShape } from '#shared/auth/jira-credential-shape'

const ACCESS_CONTEXT = 'JiraConnection:accessToken'
const REFRESH_CONTEXT = 'JiraConnection:refreshToken'
const API_TOKEN_CONTEXT = 'JiraConnection:apiToken'

const refreshes = new Map<string, Promise<string>>()

export class JiraReauthenticationRequired extends Error {
  constructor() {
    super('Your Jira connection has expired. Please sign in again.')
    this.name = 'JiraReauthenticationRequired'
  }
}

async function refreshForWorkspace(workspaceId: string): Promise<string> {
  const prisma = usePrisma()
  const token = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "JiraConnection" WHERE "workspaceId" = ${workspaceId} FOR UPDATE`
    const connection = await tx.jiraConnection.findUnique({ where: { workspaceId } })
    if (
      !connection || connection.invalidatedAt || !connection.accessToken ||
      !connection.refreshToken || !connection.expiresAt
    ) return null
    if (!isTokenExpiring(connection.expiresAt)) {
      return decryptSecret(connection.accessToken, {
        context: `${ACCESS_CONTEXT}:${workspaceId}`,
      })
    }
    const refreshToken = decryptSecret(connection.refreshToken, {
      context: `${REFRESH_CONTEXT}:${workspaceId}`,
    })
    let tokens
    try {
      tokens = await refreshOAuthToken(getOAuthConfig(), refreshToken)
    } catch (error) {
      if (error instanceof AtlassianOAuthError && error.code === 'invalid_grant') {
        await tx.jiraConnection.update({
          where: { workspaceId },
          data: { invalidatedAt: new Date() },
        })
        return null
      }
      throw error
    }

    const [access, refresh] = [
      encryptSecret(tokens.accessToken, { context: `${ACCESS_CONTEXT}:${workspaceId}` }),
      encryptSecret(tokens.refreshToken, { context: `${REFRESH_CONTEXT}:${workspaceId}` }),
    ]
    await tx.jiraConnection.update({
      where: { workspaceId },
      data: { accessToken: access, refreshToken: refresh, expiresAt: tokens.expiresAt },
    })
    return tokens.accessToken
  })
  if (!token) throw new JiraReauthenticationRequired()
  return token
}

async function accessToken(workspaceId: string): Promise<string> {
  const connection = await usePrisma().jiraConnection.findUnique({ where: { workspaceId } })
  if (!connection || connection.invalidatedAt) throw new JiraReauthenticationRequired()
  if (
    connection.authMethod !== 'OAUTH' ||
    !connection.accessToken ||
    !connection.refreshToken ||
    !connection.expiresAt
  ) throw new JiraReauthenticationRequired()
  if (!isTokenExpiring(connection.expiresAt)) {
    return decryptSecret(connection.accessToken, { context: `${ACCESS_CONTEXT}:${workspaceId}` })
  }

  let pending = refreshes.get(workspaceId)
  if (!pending) {
    pending = refreshForWorkspace(workspaceId)
      .catch(async (error) => {
        // A concurrent waiter may have observed the old expiry before another worker completed.
        // Re-read after a losing refresh transaction; use the newly persisted access token.
        const latest = await usePrisma().jiraConnection.findUnique({ where: { workspaceId } })
        if (
          latest && !latest.invalidatedAt && latest.accessToken && latest.expiresAt &&
          !isTokenExpiring(latest.expiresAt)
        ) {
          return decryptSecret(latest.accessToken, { context: `${ACCESS_CONTEXT}:${workspaceId}` })
        }
        throw error
      })
      .finally(() => refreshes.delete(workspaceId))
    refreshes.set(workspaceId, pending)
  }
  return pending
}

export interface WorkspaceJiraClient {
  fetch(path: string, init?: RequestInit): Promise<Response>
}

export function getWorkspaceJiraClient(workspaceId: string, event?: H3Event): WorkspaceJiraClient {
  return {
    async fetch(path, init = {}) {
      try {
        const workspace = await usePrisma().workspace.findUnique({
          where: { id: workspaceId },
          include: { jiraConnection: true },
        })
        const connection = workspace?.jiraConnection
        if (!workspace || !connection || connection.invalidatedAt) {
          throw new JiraReauthenticationRequired()
        }
        if (!hasValidJiraCredentialShape(workspace, connection)) {
          throw new JiraReauthenticationRequired()
        }
        const pathOnly = path.split(/[?#]/, 1)[0] ?? ''
        if (
          path.startsWith('//') ||
          /^[a-z][a-z\d+.-]*:/i.test(path) ||
          path.includes('\\') ||
          pathOnly.split('/').some((part) => part === '.' || part === '..')
        ) {
          throw httpError(400, 'Jira client paths must be relative.')
        }
        let url: URL
        let authorization: string
        if (connection.authMethod === 'API_TOKEN') {
          if (!connection.apiToken || !connection.apiEmail) {
            throw new JiraReauthenticationRequired()
          }
          const apiPath = path.replace(/^\/rest\/api\/3(?=\/|$)/, '').replace(/^\/+/, '')
          const config = getOAuthConfig()
          const mockOrigin = resolveIntegrationUrls(config).mockJiraSiteUrl
          const siteOrigin = mockOrigin ?? workspace.siteOrigin
          url = new URL(`${siteOrigin.replace(/\/+$/, '')}/rest/api/3/${apiPath}`)
          const token = decryptSecret(connection.apiToken, {
            context: `${API_TOKEN_CONTEXT}:${workspaceId}`,
          })
          authorization = `Basic ${Buffer.from(`${connection.apiEmail}:${token}`).toString('base64')}`
        } else {
          if (!workspace.cloudId) throw new JiraReauthenticationRequired()
          const token = await accessToken(workspaceId)
          const config = getOAuthConfig()
          const baseUrl = resolveIntegrationUrls(config).atlassianApiUrl.replace(/\/+$/, '')
          url = new URL(
            `${baseUrl}/ex/jira/${encodeURIComponent(workspace.cloudId)}${path.startsWith('/') ? path : `/${path}`}`,
          )
          authorization = `Bearer ${token}`
        }
        return await fetch(url, {
          ...init,
          redirect: connection.authMethod === 'API_TOKEN' ? 'manual' : init.redirect,
          headers: {
            ...Object.fromEntries(
              [...new Headers(init.headers)].filter(([key]) => key.toLowerCase() !== 'authorization'),
            ),
            authorization,
          },
          signal: init.signal ?? AbortSignal.timeout(10_000),
        })
      } catch (error) {
        if (error instanceof JiraReauthenticationRequired) {
          if (event) await clearAppSession(event)
          throw error
        }
        throw error
      }
    },
  }
}
