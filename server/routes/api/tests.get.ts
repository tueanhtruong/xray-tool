import { getQuery } from 'h3'
import { z } from 'zod'
import { getAppSession } from '../../utils/session'

const querySchema = z.object({
  q: z.string().trim().max(200).optional().default(''),
  folder: z.string().max(512).optional(),
  includeDescendants: z.enum(['true', 'false']).optional().default('false'),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).max(100_000).optional().default(0),
})

export default defineEventHandler(async (event) => {
  const session = await getAppSession(event)
  if (!session) throw httpError(401, 'Sign in to continue.')
  const workspace = await usePrisma().workspace.findFirst({
    where: { id: session.activeWorkspaceId, ownerId: session.userId },
    select: { id: true, jiraProjectId: true, projectReadyAt: true },
  })
  if (!workspace) throw httpError(404, 'Workspace not found.')
  if (!workspace.projectReadyAt || !workspace.jiraProjectId) throw httpError(409, 'Select and verify a Jira/Xray project before opening the test repository.')
  const parsed = querySchema.safeParse(getQuery(event))
  if (!parsed.success) throw httpError(400, 'Test query parameters are invalid.')
  const params = parsed.data
  const where: Record<string, unknown> = {
    workspaceId: workspace.id,
    jiraProjectId: workspace.jiraProjectId,
    origin: 'REMOTE',
  }
  const and: Record<string, unknown>[] = []
  if (params.folder && params.includeDescendants === 'true') {
    and.push({ OR: [
      { folderPath: params.folder },
      { folderPath: { startsWith: `${params.folder === '/' ? '' : params.folder}/` } },
    ] })
  } else if (params.folder) {
    where.folderPath = params.folder
  }
  if (params.q) {
    and.push({ OR: [
      { key: { contains: params.q, mode: 'insensitive' } },
      { summary: { contains: params.q, mode: 'insensitive' } },
    ] })
  }
  if (and.length > 0) where.AND = and
  const prisma = usePrisma()
  const [total, tests] = await prisma.$transaction([
    prisma.testCase.count({ where: where as never }),
    prisma.testCase.findMany({
      where: where as never,
      orderBy: [{ key: 'asc' }, { id: 'asc' }],
      skip: params.offset,
      take: params.limit,
    }),
  ])
  return {
    values: tests.map((testCase) => ({
      id: testCase.id,
      issueId: testCase.issueId,
      key: testCase.key,
      summary: testCase.summary ?? '',
      folderPath: testCase.folderPath,
      remoteDeletedAt: testCase.remoteDeletedAt,
    })),
    total,
    limit: params.limit,
    offset: params.offset,
    nextOffset: params.offset + tests.length < total ? params.offset + tests.length : null,
  }
})
