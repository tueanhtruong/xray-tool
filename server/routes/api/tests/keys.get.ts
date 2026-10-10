import { getQuery } from 'h3'
import { getAppSession } from '../../../utils/session'
import { requireAuthorizedProject } from '../../../services/project-selection'
import { indexFilterSchema, MAX_SELECT_ALL, testIndexWhere } from '../../../services/test-index'

export default defineEventHandler(async (event) => {
  const session = await getAppSession(event)
  if (!session) throw httpError(401, 'Sign in to continue.')
  const workspace = await usePrisma().workspace.findFirst({
    where: { id: session.activeWorkspaceId, ownerId: session.userId },
    select: { id: true },
  })
  if (!workspace) throw httpError(404, 'Workspace not found.')
  const projectId = getQuery(event).project
  if (typeof projectId !== 'string')
    throw httpError(409, 'Choose a project before selecting tests.')
  const project = await requireAuthorizedProject(workspace.id, projectId)
  const parsed = indexFilterSchema.safeParse(getQuery(event))
  if (!parsed.success) throw httpError(400, 'Test query parameters are invalid.')
  const where = testIndexWhere(project.id, parsed.data)
  const prisma = usePrisma()
  const total = await prisma.testCase.count({ where: where as never })
  if (total > MAX_SELECT_ALL)
    throw httpError(409, `Narrow the search to select at most ${MAX_SELECT_ALL} tests.`)
  const tests = await prisma.testCase.findMany({
    where: where as never,
    select: { id: true, key: true, folderPath: true },
    orderBy: [{ key: 'asc' }, { id: 'asc' }],
  })
  return {
    tests: tests.map((testCase) => ({
      id: testCase.id,
      key: testCase.key,
      folderPath: testCase.folderPath,
    })),
    total,
  }
})
