import { getQuery } from 'h3'
import { z } from 'zod'
import { getAppSession } from '../../utils/session'
import { requireAuthorizedProject } from '../../services/project-selection'
import { indexFilterSchema, testIndexWhere } from '../../services/test-index'

const querySchema = indexFilterSchema.extend({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).max(100_000).optional().default(0),
})

export default defineEventHandler(async (event) => {
  const session = await getAppSession(event)
  if (!session) throw httpError(401, 'Sign in to continue.')
  const workspace = await usePrisma().workspace.findFirst({
    where: { id: session.activeWorkspaceId, ownerId: session.userId },
    select: { id: true },
  })
  if (!workspace) throw httpError(404, 'Workspace not found.')
  const parsed = querySchema.safeParse(getQuery(event))
  if (!parsed.success) throw httpError(400, 'Test query parameters are invalid.')
  const params = parsed.data
  const projectId = getQuery(event).project
  if (typeof projectId !== 'string')
    throw httpError(409, 'Choose a project before opening the test repository.')
  const project = await requireAuthorizedProject(workspace.id, projectId)
  const where = testIndexWhere(projectId, params)
  const prisma = usePrisma()
  const [total, tests, drafts, draftCount] = await prisma.$transaction([
    prisma.testCase.count({ where: where as never }),
    prisma.testCase.findMany({
      where: where as never,
      orderBy: [{ key: 'asc' }, { id: 'asc' }],
      skip: params.offset,
      take: params.limit,
    }),
    prisma.testCaseDraft.findMany({
      where: { userId: session.userId, testCase: { projectId } },
      select: { testCaseId: true, summary: true, baseAvailable: true },
    }),
    prisma.testCaseDraft.count({ where: { userId: session.userId, testCase: { projectId } } }),
  ])
  const draftsByTest = new Map(drafts.map((draft) => [draft.testCaseId, draft]))
  return {
    values: tests.map((testCase) => {
      const draft = draftsByTest.get(testCase.id)
      return {
        id: testCase.id,
        issueId: testCase.issueId,
        key: testCase.key,
        summary:
          draft?.baseAvailable && draft.summary !== null ? draft.summary : (testCase.summary ?? ''),
        folderPath: testCase.folderPath,
        remoteDeletedAt: testCase.remoteDeletedAt,
        hasDraft: Boolean(draft?.baseAvailable),
      }
    }),
    total,
    limit: params.limit,
    offset: params.offset,
    nextOffset: params.offset + tests.length < total ? params.offset + tests.length : null,
    project: { id: project.id, key: project.jiraProjectKey, name: project.jiraProjectName },
    draftCount,
  }
})
