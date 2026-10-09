import { Prisma } from '../generated/prisma/client'
import {
  composeDraftFields,
  diffDraftFields,
  hasDraftChanges,
  normalizeLabels,
  validateDraftFields,
  type DraftFields,
  type DraftOverrides,
} from '../../shared/drafts/rules'

type DraftRecord = {
  id: string
  summary: string | null
  labels: Prisma.JsonValue | null
  status: string | null
  baseSummary: string | null
  baseLabels: string[]
  baseStatus: string | null
  baseGherkin: string | null
  baseRemoteUpdatedAt: Date | null
  baseFingerprint: string | null
  baseAvailable: boolean
  updatedAt: Date
}

function labelsFromJson(value: Prisma.JsonValue | null): string[] | null {
  if (!Array.isArray(value) || !value.every((label) => typeof label === 'string')) return null
  return normalizeLabels(value)
}

function overridesFromDraft(draft: DraftRecord | null): DraftOverrides {
  if (!draft) return { summary: null, labels: null, status: null }
  return {
    summary: draft.summary,
    labels: labelsFromJson(draft.labels),
    status: draft.status,
  }
}

function serializeDraft(
  base: DraftFields,
  draft: DraftRecord | null,
  count: number,
) {
  const overrides = overridesFromDraft(draft)
  return {
    base,
    fields: composeDraftFields(base, overrides),
    changed: Boolean(draft && hasDraftChanges(overrides)),
    draftId: draft?.id ?? null,
    updatedAt: draft?.updatedAt ?? null,
    count,
  }
}

async function authorizedTest(userId: string, workspaceId: string, projectId: string, testCaseId: string) {
  const access = await usePrisma().workspaceProject.findFirst({
    where: { projectId, workspaceId },
    select: { id: true },
  })
  if (!access) throw httpError(404, 'Project not found or access is not authorized.')
  const testCase = await usePrisma().testCase.findFirst({
    where: { id: testCaseId, projectId, origin: 'REMOTE', remoteDeletedAt: null },
    include: { snapshot: true, drafts: { where: { userId } } },
  })
  if (!testCase) throw httpError(404, 'Test case not found in the active project index.')
  return testCase
}

export async function readUserTestDraft(userId: string, workspaceId: string, projectId: string, testCaseId: string) {
  const testCase = await authorizedTest(userId, workspaceId, projectId, testCaseId)
  const [draft, count] = await Promise.all([
    usePrisma().testCaseDraft.findUnique({ where: { userId_testCaseId: { userId, testCaseId } } }),
    usePrisma().testCaseDraft.count({ where: { userId, testCase: { projectId } } }),
  ])
  if (!draft && !testCase.snapshot) throw httpError(409, 'Load current test details before editing this test.')
  if (draft && !draft.baseAvailable) throw httpError(409, 'This existing draft has no safe original baseline and cannot be edited here.')
  if (testCase.testType?.toLocaleLowerCase() !== 'cucumber') throw httpError(409, 'Only Cucumber tests can be edited.')
  const base: DraftFields = draft
    ? {
        summary: draft.baseSummary ?? '',
        labels: draft.baseLabels,
        status: draft.baseStatus ?? '',
      }
    : {
        summary: testCase.snapshot!.summary,
        labels: normalizeLabels(testCase.snapshot!.labels),
        status: testCase.snapshot!.status,
      }
  return serializeDraft(base, draft, count)
}

export async function saveUserTestDraft(
  userId: string,
  workspaceId: string,
  projectId: string,
  testCaseId: string,
  patch: Partial<DraftFields>,
) {
  return usePrisma().$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id" = ${projectId} FOR UPDATE`
    const access = await tx.workspaceProject.findFirst({
      where: { projectId, workspaceId },
      select: { id: true },
    })
    if (!access) throw httpError(404, 'Project not found or access is not authorized.')
    const testCase = await tx.testCase.findFirst({
      where: { id: testCaseId, projectId, origin: 'REMOTE', remoteDeletedAt: null },
      include: { snapshot: true, drafts: { where: { userId } } },
    })
    if (!testCase) throw httpError(404, 'Test case not found in the active project index.')
    if (testCase.testType?.toLocaleLowerCase() !== 'cucumber') {
      throw httpError(409, 'Only Cucumber tests can be edited.')
    }
    if (testCase.drafts.length === 0 && patch.summary === undefined && patch.labels === undefined && patch.status === undefined) {
      throw httpError(400, 'Provide at least one draft field.')
    }

    const statusesJson = await tx.project.findUnique({ where: { id: projectId }, select: { projectStatuses: true, testIssueTypeId: true } })
    const statuses = Array.isArray(statusesJson?.projectStatuses)
      ? (statusesJson.projectStatuses as Array<{ name?: unknown }>)
      : []
    const allowedStatuses = statuses
      .map((status) => status.name)
      .filter((name): name is string => typeof name === 'string')

    const existing = await tx.testCaseDraft.findUnique({
      where: { userId_testCaseId: { userId, testCaseId } },
    })
    if (existing && !existing.baseAvailable) {
      throw httpError(409, 'This existing draft has no safe original baseline and cannot be edited here.')
    }
    if (!existing && !testCase.snapshot) throw httpError(409, 'Load current test details before editing this test.')

    const base: DraftFields = existing
      ? { summary: existing.baseSummary ?? '', labels: existing.baseLabels, status: existing.baseStatus ?? '' }
      : {
          summary: testCase.snapshot!.summary,
          labels: normalizeLabels(testCase.snapshot!.labels),
          status: testCase.snapshot!.status,
        }
    const currentOverrides = overridesFromDraft(existing)
    const current = composeDraftFields(base, currentOverrides)
    const next: DraftFields = {
      summary: patch.summary ?? current.summary,
      labels: patch.labels === undefined ? current.labels : normalizeLabels(patch.labels),
      status: patch.status ?? current.status,
    }
    const validation = validateDraftFields(next, allowedStatuses)
    if (!validation.valid) throw httpError(400, Object.values(validation.errors)[0] ?? 'Draft values are invalid.')

    const overrides = diffDraftFields(base, next)
    if (!hasDraftChanges(overrides)) {
      if (existing) await tx.testCaseDraft.delete({ where: { id: existing.id } })
      const count = await tx.testCaseDraft.count({ where: { userId, testCase: { projectId } } })
      return serializeDraft(base, null, count)
    }

    const draftData = {
      summary: overrides.summary,
      labels: overrides.labels === null ? Prisma.DbNull : overrides.labels as Prisma.InputJsonValue,
      status: overrides.status,
    }
    const draft = existing
      ? await tx.testCaseDraft.update({ where: { id: existing.id }, data: draftData })
      : await tx.testCaseDraft.create({
          data: {
            userId,
            testCaseId,
            ...draftData,
            baseSummary: base.summary,
            baseLabels: base.labels,
            baseStatus: base.status,
            baseGherkin: testCase.snapshot!.gherkin,
            baseRemoteUpdatedAt: testCase.snapshot!.remoteUpdatedAt,
            baseFingerprint: testCase.snapshot!.fingerprint,
            baseAvailable: true,
          },
        })
    const count = await tx.testCaseDraft.count({ where: { userId, testCase: { projectId } } })
    return serializeDraft(base, draft, count)
  })
}

export async function removeUserTestDraft(userId: string, workspaceId: string, projectId: string, testCaseId: string) {
  return usePrisma().$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id" = ${projectId} FOR UPDATE`
    const access = await tx.workspaceProject.findFirst({
      where: { projectId, workspaceId },
      select: { id: true },
    })
    if (!access) throw httpError(404, 'Project not found or access is not authorized.')
    const testCase = await tx.testCase.findFirst({ where: { id: testCaseId, projectId, origin: 'REMOTE' }, select: { id: true } })
    if (!testCase) throw httpError(404, 'Test case not found in the active project index.')
    await tx.testCaseDraft.deleteMany({ where: { userId, testCaseId } })
    return { count: await tx.testCaseDraft.count({ where: { userId, testCase: { projectId } } }) }
  })
}
