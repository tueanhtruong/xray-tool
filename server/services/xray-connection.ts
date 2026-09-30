import type { XrayRegion } from '#shared/xray/regions'
import { verifyXrayCredentials } from '../integrations/xray/client'
import { registerSecret } from '../utils/logger'

const CLIENT_ID_CONTEXT = 'XrayConnection:clientId'
const CLIENT_SECRET_CONTEXT = 'XrayConnection:clientSecret'
const JWT_CONTEXT = 'XrayConnection:jwt'

export interface XrayConnectionStatus {
  region: XrayRegion
  configuredAt: Date
  verifiedAt: Date
}

export async function getWorkspaceXrayConnectionStatus(
  workspaceId: string,
): Promise<XrayConnectionStatus | undefined> {
  const connection = await usePrisma().xrayConnection.findUnique({
    where: { workspaceId },
    select: { region: true, configuredAt: true, verifiedAt: true },
  })
  return connection ?? undefined
}

export async function connectWorkspaceToXray(
  workspaceId: string,
  region: XrayRegion,
  clientId: string,
  clientSecret: string,
): Promise<XrayConnectionStatus> {
  registerSecret(clientId)
  registerSecret(clientSecret)
  const verified = await verifyXrayCredentials(region, clientId, clientSecret)
  const configuredAt = new Date()
  const encryptedClientId = encryptSecret(clientId, {
    context: `${CLIENT_ID_CONTEXT}:${workspaceId}`,
  })
  const encryptedClientSecret = encryptSecret(clientSecret, {
    context: `${CLIENT_SECRET_CONTEXT}:${workspaceId}`,
  })
  const encryptedJwt = encryptSecret(verified.jwt, { context: `${JWT_CONTEXT}:${workspaceId}` })
  const saved = await usePrisma().xrayConnection.upsert({
    where: { workspaceId },
    create: {
      workspaceId,
      region,
      clientId: encryptedClientId,
      clientSecret: encryptedClientSecret,
      jwt: encryptedJwt,
      jwtExpiresAt: verified.expiresAt,
      configuredAt,
      verifiedAt: configuredAt,
    },
    update: {
      region,
      clientId: encryptedClientId,
      clientSecret: encryptedClientSecret,
      jwt: encryptedJwt,
      jwtExpiresAt: verified.expiresAt,
      configuredAt,
      verifiedAt: configuredAt,
    },
    select: { region: true, configuredAt: true, verifiedAt: true },
  })
  return saved
}
