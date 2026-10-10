import {
  composeDraftFields,
  diffDraftFields,
  hasDraftChanges,
  validateDraftFields,
  type DraftFields,
  type DraftOverrides,
} from '../../shared/drafts/rules'

type DraftRecord = {
  id: string
  summary: string | null
  gherkin: string | null
  baseSummary: string | null
  baseGherkin: string | null
  baseRemoteUpdatedAt: Date | null
  baseFingerprint: string | null
  baseAvailable: boolean
  updatedAt: Date
}

function overridesFromDraft(draft: DraftRecord | null): DraftOverrides {
  if (!draft) return { summary: null, gherkin: null }
  return { summary: draft.summary, gherkin: draft.gherkin }
}

function serializeDraft(base: DraftFields, draft: DraftRecord | null, count: number) {
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

async function authorizedTest(
  userId: string,
  workspaceId: string,
  projectId: string,
  testCaseId: string,
) {
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

export async function readUserTestDraft(
  userId: string,
  workspaceId: string,
  projectId: string,
  testCaseId: string,
) {
  const testCase = await authorizedTest(userId, workspaceId, projectId, testCaseId)
  const [draft, count] = await Promise.all([
    usePrisma().testCaseDraft.findUnique({ where: { userId_testCaseId: { userId, testCaseId } } }),
    usePrisma().testCaseDraft.count({ where: { userId, testCase: { projectId } } }),
  ])
  if (!draft && !testCase.snapshot)
    throw httpError(409, 'Load current test details before editing this test.')
  if (draft && !draft.baseAvailable)
    throw httpError(
      409,
      'This existing draft has no safe original baseline and cannot be edited here.',
    )
  if (testCase.testType?.toLocaleLowerCase() !== 'cucumber')
    throw httpError(409, 'Only Cucumber tests can be edited.')
  const base: DraftFields = draft
    ? { summary: draft.baseSummary ?? '', gherkin: draft.baseGherkin }
    : { summary: testCase.snapshot!.summary, gherkin: testCase.snapshot!.gherkin }
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
    if (
      testCase.drafts.length === 0 &&
      patch.summary === undefined &&
      patch.gherkin === undefined
    ) {
      throw httpError(400, 'Provide at least one draft field.')
    }

    const existing = await tx.testCaseDraft.findUnique({
      where: { userId_testCaseId: { userId, testCaseId } },
    })
    if (existing && !existing.baseAvailable) {
      throw httpError(
        409,
        'This existing draft has no safe original baseline and cannot be edited here.',
      )
    }
    if (!existing && !testCase.snapshot)
      throw httpError(409, 'Load current test details before editing this test.')

    const base: DraftFields = existing
      ? { summary: existing.baseSummary ?? '', gherkin: existing.baseGherkin }
      : { summary: testCase.snapshot!.summary, gherkin: testCase.snapshot!.gherkin }
    const current = composeDraftFields(base, overridesFromDraft(existing))
    const next: DraftFields = {
      summary: patch.summary ?? current.summary,
      gherkin: patch.gherkin === undefined ? current.gherkin : patch.gherkin,
    }
    const validation = validateDraftFields(next)
    if (!validation.valid)
      throw httpError(400, Object.values(validation.errors)[0] ?? 'Draft values are invalid.')
    if (next.gherkin === null && base.gherkin !== null)
      throw httpError(400, 'Gherkin cannot be removed from a Cucumber test.')

    const overrides = diffDraftFields(base, next)
    if (!hasDraftChanges(overrides)) {
      if (existing) await tx.testCaseDraft.delete({ where: { id: existing.id } })
      const count = await tx.testCaseDraft.count({ where: { userId, testCase: { projectId } } })
      return serializeDraft(base, null, count)
    }

    const draftData = { summary: overrides.summary, gherkin: overrides.gherkin }
    const draft = existing
      ? await tx.testCaseDraft.update({ where: { id: existing.id }, data: draftData })
      : await tx.testCaseDraft.create({
          data: {
            userId,
            testCaseId,
            ...draftData,
            baseSummary: base.summary,
            baseGherkin: base.gherkin,
            baseRemoteUpdatedAt: testCase.snapshot!.remoteUpdatedAt,
            baseFingerprint: testCase.snapshot!.fingerprint,
            baseAvailable: true,
          },
        })
    const count = await tx.testCaseDraft.count({ where: { userId, testCase: { projectId } } })
    return serializeDraft(base, draft, count)
  })
}

export async function removeUserTestDraft(
  userId: string,
  workspaceId: string,
  projectId: string,
  testCaseId: string,
) {
  return usePrisma().$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id" = ${projectId} FOR UPDATE`
    const access = await tx.workspaceProject.findFirst({
      where: { projectId, workspaceId },
      select: { id: true },
    })
    if (!access) throw httpError(404, 'Project not found or access is not authorized.')
    const testCase = await tx.testCase.findFirst({
      where: { id: testCaseId, projectId, origin: 'REMOTE' },
      select: { id: true },
    })
    if (!testCase) throw httpError(404, 'Test case not found in the active project index.')
    await tx.testCaseDraft.deleteMany({ where: { userId, testCaseId } })
    return { count: await tx.testCaseDraft.count({ where: { userId, testCase: { projectId } } }) }
  })
}
