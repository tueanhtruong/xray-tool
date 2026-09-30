import { getHeader, getRequestURL, readBody } from 'h3'
import { z } from 'zod'
import { XrayError } from '../../../integrations/xray/client'
import { connectWorkspaceToXray } from '../../../services/xray-connection'
import { getAppSession } from '../../../utils/session'

const bodySchema = z.object({
  region: z.enum(['GLOBAL', 'US', 'EU', 'AU']),
  clientId: z.string().trim().min(1).max(512),
  clientSecret: z.string().min(1).max(1024),
})

export default defineEventHandler(async (event) => {
  const session = await getAppSession(event)
  if (!session) throw httpError(401, 'Sign in to continue.')
  const origin = getHeader(event, 'origin')
  if (!origin || new URL(origin).origin !== getRequestURL(event).origin) {
    throw httpError(403, 'Xray connection request could not be verified.')
  }
  const workspace = await usePrisma().workspace.findFirst({
    where: { id: session.activeWorkspaceId, ownerId: session.userId },
    select: { id: true },
  })
  if (!workspace) throw httpError(404, 'Workspace not found.')
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw httpError(400, 'Enter an Xray client ID, client secret, and supported region.')
  }
  try {
    const result = await connectWorkspaceToXray(
      workspace.id,
      parsed.data.region,
      parsed.data.clientId,
      parsed.data.clientSecret,
    )
    return { status: 'connected', ...result }
  } catch (error) {
    if (error instanceof XrayError) {
      throw httpError(error.statusCode === 401 || error.statusCode === 403 ? 401 : 502, error.message)
    }
    throw error
  }
})
