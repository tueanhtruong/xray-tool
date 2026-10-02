import { getHeader, getQuery, getRequestURL, readBody } from 'h3'
import { z } from 'zod'
import { getXrayTestDetailsByKeys } from '../../../integrations/xray/client'
import { fingerprintTestCase } from '../../../../shared/fingerprint'
import { asRecord, isReadOnlyTestType, normalizeRemoteTest } from '../../../services/test-details'
import { getAppSession } from '../../../utils/session'
import { requireAuthorizedProject } from '../../../services/project-selection'

const bodySchema = z.object({ ids: z.array(z.string().min(1).max(64)).min(1).max(100) })

function parseRemoteDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? null : date
}

export default defineEventHandler(async (event) => {
  const session = await getAppSession(event)
  if (!session) throw httpError(401, 'Sign in to continue.')
  const origin = getHeader(event, 'origin')
  if (!origin || new URL(origin).origin !== getRequestURL(event).origin) throw httpError(403, 'Selection request could not be verified.')
  const workspace = await usePrisma().workspace.findFirst({
    where: { id: session.activeWorkspaceId, ownerId: session.userId },
    select: { id: true, ownerId: true },
  })
  if (!workspace) throw httpError(404, 'Workspace not found.')
  const requestedProjectId = getQuery(event).project
  let authorizedProject = typeof requestedProjectId === 'string'
    ? await requireAuthorizedProject(workspace.id, requestedProjectId)
    : undefined
  if (!authorizedProject) {
    const projects = await usePrisma().workspaceProject.findMany({
      where: { workspaceId: workspace.id },
      select: { projectId: true },
    })
    if (projects.length !== 1) throw httpError(409, 'Choose a project before selecting tests.')
    authorizedProject = await requireAuthorizedProject(workspace.id, projects[0]!.projectId)
  }
  if (!authorizedProject) throw httpError(409, 'Choose a project before selecting tests.')
  const jiraProjectId = authorizedProject.jiraProjectId
  const sharedProjectId = authorizedProject.id
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success || new Set(parsed.data.ids).size !== parsed.data.ids.length) throw httpError(400, 'Choose valid, unique test cases.')

  const prisma = usePrisma()
  const testCases = await prisma.testCase.findMany({
    where: {
      id: { in: parsed.data.ids },
      projectId: sharedProjectId,
      origin: 'REMOTE',
      remoteDeletedAt: null,
    },
    include: { snapshot: true, drafts: { where: { userId: workspace.ownerId } } },
  })
  if (testCases.length !== parsed.data.ids.length) throw httpError(404, 'One or more tests are not in the active project index.')

  const remoteTests = await getXrayTestDetailsByKeys(workspace.id, testCases.map((testCase) => testCase.key), jiraProjectId)
  const remoteByKey = new Map(remoteTests.map((remote) => [asRecord(remote.jira).key, remote]))
  const details = await Promise.all(testCases.map(async (testCase) => {
    const remote = remoteByKey.get(testCase.key)
    if (!remote || remote.issueId !== testCase.issueId) throw httpError(409, `Xray identity changed for ${testCase.key}; pull the repository and retry.`)
    const { summary, labels, status: remoteStatus, jira, testType: remoteTestType } = normalizeRemoteTest(remote)
    if (!remoteTestType || !remoteStatus) throw httpError(502, `Xray returned incomplete details for ${testCase.key}.`)
    return {
      testCase,
      values: {
        summary,
        labels,
        status: remoteStatus,
        gherkin: remote.gherkin,
        remoteUpdatedAt: parseRemoteDate(remote.lastModified) ?? parseRemoteDate(jira.updated),
        fingerprint: await fingerprintTestCase({ summary, labels, status: remoteStatus, gherkin: remote.gherkin }),
      },
      testType: remoteTestType,
    }
  }))

  const pulledAt = new Date()
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id" = ${sharedProjectId} FOR UPDATE`
    const current = await tx.workspaceProject.findUnique({ where: { workspaceId_projectId: { workspaceId: workspace.id, projectId: sharedProjectId } }, select: { id: true } })
    if (!current) throw httpError(409, 'Project access changed while loading tests. Retry from the current project.')
    const latestCases = await tx.testCase.findMany({
      where: {
        id: { in: parsed.data.ids },
        projectId: sharedProjectId,
        origin: 'REMOTE',
        remoteDeletedAt: null,
      },
      include: { snapshot: true, drafts: { where: { userId: workspace.ownerId } } },
    })
    if (latestCases.length !== parsed.data.ids.length) throw httpError(409, 'A selected test changed while loading. Refresh the repository and retry.')
    const latestById = new Map(latestCases.map((testCase) => [testCase.id, testCase]))
    for (const { testCase, values, testType } of details) {
      const latest = latestById.get(testCase.id)
      if (!latest) throw httpError(409, 'A selected test changed while loading. Refresh the repository and retry.')
      if (latest.key !== testCase.key || latest.issueId !== testCase.issueId) {
        throw httpError(409, 'A selected test changed while loading. Refresh the repository and retry.')
      }
      await tx.testCase.update({ where: { id: latest.id }, data: { testType } })
      if (!latest.snapshot) {
        await tx.testCaseSnapshot.create({ data: { testCaseId: latest.id, ...values, pulledAt } })
      } else if (latest.snapshot.fingerprint !== values.fingerprint && latest.drafts.length === 0) {
        await tx.testCaseSnapshot.update({ where: { testCaseId: latest.id }, data: { ...values, pulledAt } })
      }
    }
  })

  return { values: details.map(({ testCase, values, testType }) => ({
    id: testCase.id,
    key: testCase.key,
    testType,
    ...values,
    readOnly: isReadOnlyTestType(testType),
  })) }
})
