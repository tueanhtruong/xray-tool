import { getHeader, getQuery, getRequestURL, getRouterParam, readBody } from 'h3'
import { z } from 'zod'
import { saveUserTestDraft } from '../../../services/drafts'
import { requireReadyWorkspace, NOT_READY_REPOSITORY_MESSAGE } from '../../../services/test-details'
import { getAppSession } from '../../../utils/session'

const patchSchema = z.object({
  summary: z.string().max(255).optional(),
  labels: z.array(z.string().max(255)).max(100).optional(),
  status: z.string().max(100).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'Provide at least one draft field.')

export default defineEventHandler(async (event) => {
  const session = await getAppSession(event)
  if (!session) throw httpError(401, 'Sign in to continue.')
  const origin = getHeader(event, 'origin')
  if (!origin || new URL(origin).origin !== getRequestURL(event).origin) throw httpError(403, 'Draft request could not be verified.')
  const project = getQuery(event).project
  const workspace = await requireReadyWorkspace(session, typeof project === 'string' ? project : undefined, NOT_READY_REPOSITORY_MESSAGE)
  const testCaseId = getRouterParam(event, 'testCaseId')
  if (!testCaseId || testCaseId.length > 64) throw httpError(400, 'Choose a valid test case.')
  const parsed = patchSchema.safeParse(await readBody(event))
  if (!parsed.success) throw httpError(400, 'Draft values are invalid.')
  const result = await saveUserTestDraft(session.userId, workspace.id, workspace.projectId, testCaseId, parsed.data)
  await setResponseHeader(event, 'x-draft-count', String(result.count))
  return result
})
