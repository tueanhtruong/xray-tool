import type { IntegrationTarget } from '#shared/config/schema'
import { isXrayJwtReusable, xrayJwtExpiresAt, type XrayRegion } from '#shared/xray/regions'
import { resolveXrayBaseUrl } from '../../utils/integration-urls'
import { registerSecret } from '../../utils/logger'
import { decryptSecret, encryptSecret } from '../../utils/crypto'

const CLIENT_ID_CONTEXT = 'XrayConnection:clientId'
const CLIENT_SECRET_CONTEXT = 'XrayConnection:clientSecret'
const JWT_CONTEXT = 'XrayConnection:jwt'
const AUTH_TIMEOUT_MS = 10_000
const MAX_GRAPHQL_ATTEMPTS = 3
const MAX_RETRY_DELAY_MS = 30_000

const authentications = new Map<string, Promise<string>>()

export class XrayError extends Error {
  readonly statusCode?: number

  constructor(message: string, statusCode?: number) {
    super(message)
    this.name = 'XrayError'
    this.statusCode = statusCode
  }
}

interface XrayConnectionRecord {
  workspaceId: string
  region: XrayRegion
  clientId: string
  clientSecret: string
  jwt: string | null
  jwtExpiresAt: Date | null
}

function baseUrl(region: XrayRegion): string {
  const config = useRuntimeConfig()
  return resolveXrayBaseUrl({
    integrationTarget: (config.integrationTarget || 'live') as IntegrationTarget,
    mockServicesUrl: config.mockServicesUrl || 'http://localhost:4010',
    atlassianAuthUrl: config.atlassianAuthUrl || undefined,
    atlassianApiUrl: config.atlassianApiUrl || undefined,
    xrayBaseUrl: config.xrayBaseUrl || undefined,
  }, region)
}

function safeAuthMessage(status: number): string {
  return status === 401 || status === 403
    ? 'Xray rejected these API keys. Create a key in Jira > Apps > Xray > API Keys.'
    : 'Xray authentication could not be completed. Check the Xray service and try again.'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function readXrayToken(response: Response): Promise<string> {
  if (!response.ok) throw new XrayError(safeAuthMessage(response.status), response.status)
  let raw: string
  try {
    raw = await response.text()
  } catch {
    throw new XrayError('Xray returned an invalid authentication response.')
  }
  let value: unknown = raw
  try {
    value = JSON.parse(raw) as unknown
  } catch {
    // Xray deployments may return either a JSON string or the raw JWT response body.
  }
  const token = typeof value === 'string'
    ? value
    : isRecord(value) && typeof value.token === 'string'
      ? value.token
      : undefined
  if (!token || !xrayJwtExpiresAt(token)) {
    throw new XrayError('Xray returned an invalid or expired JSON Web Token.')
  }
  registerSecret(token)
  return token
}

async function authenticate(
  region: XrayRegion,
  clientId: string,
  clientSecret: string,
): Promise<string> {
  registerSecret(clientId)
  registerSecret(clientSecret)
  const response = await fetch(new URL('api/v2/authenticate', `${baseUrl(region)}/`), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
    signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
  })
  return readXrayToken(response)
}

async function loadConnection(workspaceId: string): Promise<XrayConnectionRecord> {
  const connection = await usePrisma().xrayConnection.findUnique({ where: { workspaceId } })
  if (!connection) throw new XrayError('Connect this workspace to Xray Cloud before continuing.', 409)
  return connection
}

async function decryptCredentials(connection: XrayConnectionRecord) {
  const { workspaceId } = connection
  return {
    clientId: decryptSecret(connection.clientId, {
      context: `${CLIENT_ID_CONTEXT}:${workspaceId}`,
    }),
    clientSecret: decryptSecret(connection.clientSecret, {
      context: `${CLIENT_SECRET_CONTEXT}:${workspaceId}`,
    }),
  }
}

async function authenticateAndPersist(workspaceId: string): Promise<string> {
  const latest = await loadConnection(workspaceId)
  if (latest.jwt && isXrayJwtReusable(latest.jwtExpiresAt ?? undefined)) {
    return decryptSecret(latest.jwt, { context: `${JWT_CONTEXT}:${workspaceId}` })
  }
  const credentials = await decryptCredentials(latest)
  const token = await authenticate(latest.region, credentials.clientId, credentials.clientSecret)
  const expiresAt = xrayJwtExpiresAt(token)
  if (!expiresAt) throw new XrayError('Xray returned an invalid JSON Web Token.')
  const encryptedJwt = encryptSecret(token, { context: `${JWT_CONTEXT}:${workspaceId}` })
  const updated = await usePrisma().xrayConnection.updateMany({
    where: {
      workspaceId,
      clientId: latest.clientId,
      clientSecret: latest.clientSecret,
    },
    data: { jwt: encryptedJwt, jwtExpiresAt: expiresAt },
  })
  if (updated.count === 0) {
    const after = await loadConnection(workspaceId)
    if (after.jwt && isXrayJwtReusable(after.jwtExpiresAt ?? undefined)) {
      return decryptSecret(after.jwt, { context: `${JWT_CONTEXT}:${workspaceId}` })
    }
    throw new XrayError('Xray credentials changed during authentication. Please retry.')
  }
  return token
}

async function getJwt(workspaceId: string): Promise<string> {
  const connection = await loadConnection(workspaceId)
  if (connection.jwt && isXrayJwtReusable(connection.jwtExpiresAt ?? undefined)) {
    return decryptSecret(connection.jwt, { context: `${JWT_CONTEXT}:${workspaceId}` })
  }
  let pending = authentications.get(workspaceId)
  if (!pending) {
    pending = authenticateAndPersist(workspaceId).catch(async (error) => {
      const latest = await loadConnection(workspaceId)
      if (latest.jwt && isXrayJwtReusable(latest.jwtExpiresAt ?? undefined)) {
        return decryptSecret(latest.jwt, { context: `${JWT_CONTEXT}:${workspaceId}` })
      }
      throw error
    })
      .finally(() => authentications.delete(workspaceId))
    authentications.set(workspaceId, pending)
  }
  return pending
}

async function invalidateJwt(workspaceId: string, jwt: string): Promise<void> {
  const connection = await loadConnection(workspaceId)
  if (!connection.jwt) return
  const currentJwt = decryptSecret(connection.jwt, { context: `${JWT_CONTEXT}:${workspaceId}` })
  if (currentJwt !== jwt) return
  await usePrisma().xrayConnection.updateMany({
    where: { workspaceId, jwt: connection.jwt },
    data: { jwt: null, jwtExpiresAt: null },
  })
}

export function retryAfterMs(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  const delay = Number.isFinite(seconds) && seconds >= 0
    ? seconds * 1000
    : Date.parse(value) - now
  if (!Number.isFinite(delay) || delay < 0) return undefined
  return Math.min(delay, MAX_RETRY_DELAY_MS)
}

function backoffMs(retryIndex: number): number {
  return Math.min(250 * 2 ** retryIndex, MAX_RETRY_DELAY_MS)
}

async function wait(ms: number): Promise<void> {
  if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms))
}

export function safeGraphqlMessage(value: unknown): string {
  if (!isRecord(value) || typeof value.message !== 'string') {
    return 'Xray GraphQL request failed. Check the Xray API key permissions and try again.'
  }
  const message = value.message
  if (/permission|forbidden|not authorized|not permitted/i.test(message)) {
    const project = message.match(/project\s+([A-Z][A-Z0-9_-]{0,63})/i)?.[1]
    return project
      ? `Xray API key lacks permission for project ${project}. Check the key's project permissions.`
      : 'Xray API key lacks permission for this operation. Check the key permissions.'
  }
  return 'Xray could not complete this GraphQL operation. Check the API key permissions and try again.'
}

async function graphQlAttempt(
  region: XrayRegion,
  jwt: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<{ response: Response; body: unknown }> {
  const response = await fetch(new URL('api/v2/graphql', `${baseUrl(region)}/`), {
    method: 'POST',
    headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
  })
  let body: unknown
  try {
    body = await response.json()
  } catch {
    body = undefined
  }
  return { response, body }
}

export interface WorkspaceXrayClient {
  graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T>
}

export function getWorkspaceXrayClient(workspaceId: string): WorkspaceXrayClient {
  return {
    async graphql<T>(query: string, variables?: Record<string, unknown>) {
      let connection = await loadConnection(workspaceId)
      let reauthenticated = false
      let transientRetries = 0
      for (let attempt = 0; attempt < MAX_GRAPHQL_ATTEMPTS; attempt += 1) {
        const jwt = await getJwt(workspaceId)
        const { response, body } = await graphQlAttempt(connection.region, jwt, query, variables)

        if (response.status === 401 && !reauthenticated && attempt < MAX_GRAPHQL_ATTEMPTS - 1) {
          reauthenticated = true
          await invalidateJwt(workspaceId, jwt)
          await getJwt(workspaceId)
          connection = await loadConnection(workspaceId)
          continue
        }

        if ((response.status === 429 || response.status === 503) && attempt < MAX_GRAPHQL_ATTEMPTS - 1) {
          const delay = retryAfterMs(response.headers.get('retry-after')) ?? backoffMs(transientRetries)
          transientRetries += 1
          await wait(delay)
          continue
        }

        if (!response.ok) {
          throw new XrayError(
            response.status === 401
              ? 'Xray rejected the request. Recheck the API key and its permissions.'
              : 'Xray GraphQL request failed. Please try again.',
            response.status,
          )
        }
        if (isRecord(body) && Array.isArray(body.errors) && body.errors.length > 0) {
          throw new XrayError(safeGraphqlMessage(body.errors[0]))
        }
        if (!isRecord(body) || !('data' in body)) {
          throw new XrayError('Xray returned an invalid GraphQL response.')
        }
        return body.data as T
      }
      throw new XrayError('Xray GraphQL request failed after the retry limit.')
    },
  }
}

export async function verifyXrayCredentials(
  region: XrayRegion,
  clientId: string,
  clientSecret: string,
): Promise<{ jwt: string; expiresAt: Date }> {
  try {
    const jwt = await authenticate(region, clientId, clientSecret)
    const expiresAt = xrayJwtExpiresAt(jwt)
    if (!expiresAt) throw new XrayError('Xray returned an invalid or expired JSON Web Token.')
    return { jwt, expiresAt }
  } catch (error) {
    if (error instanceof XrayError) throw error
    throw new XrayError('Xray authentication could not be completed. Check the Xray service and try again.')
  }
}

export const XRAY_RETRY_POLICY = {
  maxAttempts: MAX_GRAPHQL_ATTEMPTS,
  maxRetryDelayMs: MAX_RETRY_DELAY_MS,
} as const
