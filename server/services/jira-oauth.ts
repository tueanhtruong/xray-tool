import { randomBytes } from 'node:crypto'
import type { Prisma } from '../generated/prisma/client'
import type {
  AtlassianOAuthConfig,
  AtlassianProfile,
  JiraSite,
  OAuthTokens,
} from '../integrations/jira/oauth'
import { getAccessibleSites, getAtlassianProfile } from '../integrations/jira/oauth'

const ACCESS_CONTEXT = 'JiraConnection:accessToken'
const REFRESH_CONTEXT = 'JiraConnection:refreshToken'
const PENDING_ACCESS_CONTEXT = 'PendingOAuthGrant:accessToken'
const PENDING_REFRESH_CONTEXT = 'PendingOAuthGrant:refreshToken'
export const PENDING_GRANT_TTL_MS = 10 * 60 * 1000

export interface OAuthGrant {
  profile: AtlassianProfile
  sites: JiraSite[]
  tokens: OAuthTokens
}

export async function resolveOAuthGrant(
  config: AtlassianOAuthConfig,
  tokens: OAuthTokens,
): Promise<OAuthGrant> {
  const [profile, sites] = await Promise.all([
    getAtlassianProfile(config, tokens.accessToken),
    getAccessibleSites(config, tokens.accessToken),
  ])
  if (sites.length === 0) throw new Error('No Jira sites are available for this Atlassian account.')
  return { profile, sites, tokens }
}

async function upsertUser(tx: Prisma.TransactionClient, profile: AtlassianProfile) {
  return tx.user.upsert({
    where: { accountId: profile.accountId },
    create: {
      accountId: profile.accountId,
      name: profile.name,
      email: profile.email,
      avatarUrl: profile.avatarUrl,
    },
    update: {
      name: profile.name,
      email: profile.email,
      avatarUrl: profile.avatarUrl,
    },
  })
}

async function upsertConnection(
  tx: Prisma.TransactionClient,
  ownerId: string,
  site: JiraSite,
  tokens: OAuthTokens,
) {
  const siteOrigin = new URL(site.url).origin.toLowerCase()
  const existingByOrigin = await tx.workspace.findUnique({
    where: { ownerId_siteOrigin: { ownerId, siteOrigin } },
    include: { jiraConnection: true },
  })
  if (existingByOrigin?.jiraConnection?.authMethod === 'API_TOKEN') {
    throw new Error('Disconnect the API-token connection before connecting this Jira site with OAuth.')
  }
  const workspace = existingByOrigin && !existingByOrigin.jiraConnection
    ? await tx.workspace.update({
        where: { id: existingByOrigin.id },
        data: { cloudId: site.id, siteUrl: site.url, name: site.name },
      })
    : await tx.workspace.upsert({
        where: { ownerId_cloudId: { ownerId, cloudId: site.id } },
        create: {
          ownerId,
          cloudId: site.id,
          siteOrigin,
          siteUrl: site.url,
          name: site.name,
        },
        update: {
          siteOrigin,
          siteUrl: site.url,
          name: site.name,
        },
      })
  const connectionData = {
    accessToken: encryptSecret(tokens.accessToken, {
      context: `${ACCESS_CONTEXT}:${workspace.id}`,
    }),
    refreshToken: encryptSecret(tokens.refreshToken, {
      context: `${REFRESH_CONTEXT}:${workspace.id}`,
    }),
    expiresAt: tokens.expiresAt,
    scopes: tokens.scopes,
    invalidatedAt: null,
  }
  await tx.jiraConnection.upsert({
    where: { workspaceId: workspace.id },
    create: { workspaceId: workspace.id, ...connectionData },
    update: connectionData,
  })
  return workspace
}

export async function persistSingleSiteGrant(grant: OAuthGrant) {
  if (grant.sites.length !== 1) throw new Error('Expected exactly one Jira site.')
  const site = grant.sites[0]
  if (!site) throw new Error('No Jira site is available.')
  return usePrisma().$transaction(async (tx) => {
    const user = await upsertUser(tx, grant.profile)
    const workspace = await upsertConnection(tx, user.id, site, grant.tokens)
    return { userId: user.id, activeWorkspaceId: workspace.id }
  })
}

export async function createPendingGrant(grant: OAuthGrant): Promise<string> {
  const id = randomBytes(32).toString('base64url')
  await usePrisma().$transaction(async (tx) => {
    await upsertUser(tx, grant.profile)
    await tx.pendingOAuthGrant.create({
      data: {
        id,
        accountId: grant.profile.accountId,
        name: grant.profile.name,
        email: grant.profile.email,
        avatarUrl: grant.profile.avatarUrl,
        accessToken: encryptSecret(grant.tokens.accessToken, {
          context: `${PENDING_ACCESS_CONTEXT}:${id}`,
        }),
        refreshToken: encryptSecret(grant.tokens.refreshToken, {
          context: `${PENDING_REFRESH_CONTEXT}:${id}`,
        }),
        accessExpiresAt: grant.tokens.expiresAt,
        scopes: grant.tokens.scopes,
        expiresAt: new Date(Date.now() + PENDING_GRANT_TTL_MS),
        sites: grant.sites.map((site) => ({ ...site })) as unknown as Prisma.InputJsonValue,
      },
    })
  })
  return id
}

export async function listPendingSites(id: string): Promise<JiraSite[] | undefined> {
  const pending = await usePrisma().pendingOAuthGrant.findUnique({ where: { id } })
  if (!pending) return undefined
  if (pending.expiresAt <= new Date()) {
    await usePrisma().pendingOAuthGrant.deleteMany({ where: { id } })
    return undefined
  }
  if (!Array.isArray(pending.sites)) return undefined
  return pending.sites as unknown as JiraSite[]
}

export async function completePendingGrant(id: string, cloudId: string) {
  return usePrisma().$transaction(async (tx) => {
    const pending = await tx.pendingOAuthGrant.findUnique({ where: { id } })
    if (!pending || pending.expiresAt <= new Date()) {
      if (pending) await tx.pendingOAuthGrant.delete({ where: { id } })
      return undefined
    }
    if (!Array.isArray(pending.sites)) return undefined
    const site = (pending.sites as unknown as JiraSite[]).find(
      (candidate) => candidate.id === cloudId,
    )
    if (!site) return undefined

    const tokens: OAuthTokens = {
      accessToken: decryptSecret(pending.accessToken, {
        context: `${PENDING_ACCESS_CONTEXT}:${id}`,
      }),
      refreshToken: decryptSecret(pending.refreshToken, {
        context: `${PENDING_REFRESH_CONTEXT}:${id}`,
      }),
      expiresAt: pending.accessExpiresAt,
      scopes: pending.scopes,
    }
    const user = await upsertUser(tx, {
      accountId: pending.accountId,
      name: pending.name ?? undefined,
      email: pending.email ?? undefined,
      avatarUrl: pending.avatarUrl ?? undefined,
    })
    const workspace = await upsertConnection(tx, user.id, site, tokens)
    await tx.pendingOAuthGrant.delete({ where: { id } })
    return { userId: user.id, activeWorkspaceId: workspace.id }
  })
}
