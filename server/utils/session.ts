import type { H3Event } from 'h3'

export interface AppSession {
  userId: string
  activeWorkspaceId: string
}

export async function setAppSession(event: H3Event, session: AppSession): Promise<void> {
  ensureSessionConfig()
  await replaceUserSession(event, { ...session })
}

export async function getAppSession(event: H3Event): Promise<AppSession | undefined> {
  try {
    const session = await getUserSession(event)
    if (typeof session.userId !== 'string' || typeof session.activeWorkspaceId !== 'string') {
      return undefined
    }
    return { userId: session.userId, activeWorkspaceId: session.activeWorkspaceId }
  } catch {
    return undefined
  }
}

export async function clearAppSession(event: H3Event): Promise<void> {
  await clearUserSession(event)
}
