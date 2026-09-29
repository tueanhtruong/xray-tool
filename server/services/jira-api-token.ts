import type { Prisma } from '../generated/prisma/client'
import type { H3Event } from 'h3'
import { verifyJiraApiToken, type JiraApiTokenProfile } from '../integrations/jira/api-token'
import type { AppSession } from '../utils/session'
import { consumeApiTokenSignInAttempt } from './api-token-rate-limit'

const API_TOKEN_CONTEXT = 'JiraConnection:apiToken'

export class ApiTokenRateLimitExceeded extends Error {
  constructor() {
    super('Too many sign-in attempts. Wait one minute, then try again.')
    this.name = 'ApiTokenRateLimitExceeded'
  }
}

export class JiraSiteAlreadyConnected extends Error {
  constructor() {
    super(
      'This Jira site already has a connection. Sign in with Atlassian to open its settings, disconnect it, then connect with an API token.',
    )
    this.name = 'JiraSiteAlreadyConnected'
  }
}

function basicProfileUpdate(tx: Prisma.TransactionClient, profile: JiraApiTokenProfile) {
  return tx.user.upsert({
    where: { accountId: profile.accountId },
    create: {
      accountId: profile.accountId,
      name: profile.name,
      email: profile.email,
    },
    update: {
      name: profile.name,
      email: profile.email,
    },
  })
}

async function persistProfile(
  profile: JiraApiTokenProfile,
  apiToken: string,
): Promise<AppSession> {
  return usePrisma().$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { accountId: profile.accountId } })
    if (!user) {
      const collision = await tx.workspace.findFirst({
        where: { owner: { accountId: { not: profile.accountId } }, siteOrigin: profile.siteUrl },
      })
      if (collision) throw new Error('Jira site identity is already connected to another account.')
    }
    const ownerId = user?.id ?? ''
    const existing = await tx.workspace.findUnique({
      where: { ownerId_siteOrigin: { ownerId, siteOrigin: profile.siteUrl } },
      include: { jiraConnection: true },
    })
    if (!user && existing) {
      throw new Error('Jira site identity is already connected to another account.')
    }
    if (existing?.cloudId) {
      const cloudWorkspace = await tx.workspace.findUnique({
        where: { ownerId_cloudId: { ownerId: existing.ownerId, cloudId: existing.cloudId } },
        include: { jiraConnection: true },
      })
      if (cloudWorkspace?.jiraConnection?.authMethod === 'OAUTH') {
        throw new JiraSiteAlreadyConnected()
      }
    }
    if (existing?.jiraConnection && existing.jiraConnection.authMethod !== 'API_TOKEN') {
      throw new JiraSiteAlreadyConnected()
    }
    const persistedUser = user ?? (await basicProfileUpdate(tx, profile))

    const workspace = existing
      ? await tx.workspace.update({
          where: { id: existing.id },
          data: { cloudId: null, siteUrl: profile.siteUrl, name: profile.siteUrl },
        })
      : await tx.workspace.create({
          data: {
            ownerId: persistedUser.id,
            cloudId: null,
            siteOrigin: profile.siteUrl,
            siteUrl: profile.siteUrl,
            name: profile.siteUrl,
          },
        })

    const encrypted = encryptSecret(apiToken, {
      context: `${API_TOKEN_CONTEXT}:${workspace.id}`,
    })
    await tx.jiraConnection.upsert({
      where: { workspaceId: workspace.id },
      create: {
        workspaceId: workspace.id,
        authMethod: 'API_TOKEN',
        apiToken: encrypted,
        apiEmail: profile.email,
        tokenSavedAt: new Date(),
        scopes: [],
      },
      update: {
        authMethod: 'API_TOKEN',
        accessToken: null,
        refreshToken: null,
        expiresAt: null,
        scopes: [],
        apiToken: encrypted,
        apiEmail: profile.email,
        tokenSavedAt: new Date(),
        invalidatedAt: null,
      },
    })
    return { userId: persistedUser.id, activeWorkspaceId: workspace.id }
  })
}

export async function connectWithApiToken(
  event: H3Event,
  site: { origin: string; hostname: string },
  email: string,
  apiToken: string,
): Promise<AppSession> {
  if (!(await consumeApiTokenSignInAttempt(event))) throw new ApiTokenRateLimitExceeded()
  const profile = await verifyJiraApiToken(site, email, apiToken)
  return persistProfile(profile, apiToken)
}

export async function replaceWorkspaceApiToken(
  workspaceId: string,
  site: { origin: string; hostname: string },
  email: string,
  apiToken: string,
): Promise<void> {
  const profile = await verifyJiraApiToken(site, email, apiToken)
  const prisma = usePrisma()
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "JiraConnection" WHERE "workspaceId" = ${workspaceId} FOR UPDATE`
    const connection = await tx.jiraConnection.findUnique({
      where: { workspaceId },
      include: { workspace: { include: { owner: true } } },
    })
    if (!connection || connection.authMethod !== 'API_TOKEN') {
      throw new Error('API-token Jira connection not found.')
    }
    if (connection.workspace.siteOrigin !== profile.siteUrl || connection.apiEmail !== email) {
      throw new Error('Replacement credentials must belong to the connected Jira site and email.')
    }
    if (connection.workspace.owner.accountId !== profile.accountId) {
      throw new Error('Replacement credentials must belong to the connected Atlassian account.')
    }
    await tx.jiraConnection.update({
      where: { workspaceId },
      data: {
        apiToken: encryptSecret(apiToken, { context: `${API_TOKEN_CONTEXT}:${workspaceId}` }),
        tokenSavedAt: new Date(),
        invalidatedAt: null,
      },
    })
  })
}
