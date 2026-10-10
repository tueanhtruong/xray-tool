import { getXrayTestDetailsByKey, type XrayTestDetails } from '../integrations/xray/client'
import { composeDraftFields } from '../../shared/drafts/rules'

export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export interface NormalizedRemoteTest {
  summary: string
  /** Xray test type name; undefined when Xray did not return one. */
  testType: string | undefined
  gherkin: string | null
  jira: Record<string, unknown>
}

/** Maps an Xray detail result to the plain fields the app works with. */
export function normalizeRemoteTest(remote: XrayTestDetails): NormalizedRemoteTest {
  const jira = asRecord(remote.jira)
  return {
    summary: typeof jira.summary === 'string' ? jira.summary : '',
    testType: remote.testType?.name,
    gherkin: remote.gherkin,
    jira,
  }
}

export const isReadOnlyTestType = (testType: string | undefined): boolean =>
  testType?.toLowerCase() !== 'cucumber'

/** Jira issue key shape; keys are validated before any lookup or remote call. */
export const JIRA_KEY_PATTERN = /^[A-Z][A-Z0-9_]*-\d+$/

export interface ReadyWorkspace {
  id: string
  projectId: string
  jiraProjectId: string
}

/** Resolves the session's workspace and requires a ready project. Throws 404/409 otherwise. */
export async function requireReadyWorkspace(
  session: { userId: string; activeWorkspaceId: string },
  projectId: string | undefined,
  notReadyMessage: string,
): Promise<ReadyWorkspace> {
  const workspace = await usePrisma().workspace.findFirst({
    where: { id: session.activeWorkspaceId, ownerId: session.userId },
    select: { id: true },
  })
  if (!workspace) throw httpError(404, 'Workspace not found.')
  if (!projectId) {
    const projects = await usePrisma().workspaceProject.findMany({
      where: { workspaceId: workspace.id },
      select: { projectId: true },
      take: 2,
    })
    if (projects.length === 1) projectId = projects[0]!.projectId
    else if (projects.length > 1) throw httpError(409, notReadyMessage)
    else throw httpError(404, 'Test not found.')
  }
  const access = await usePrisma().workspaceProject.findFirst({
    where: { workspaceId: workspace.id, projectId },
    include: { project: { select: { id: true, jiraProjectId: true } } },
  })
  if (!access) throw httpError(404, 'Project not found or access is not authorized.')
  return {
    id: workspace.id,
    projectId: access.project.id,
    jiraProjectId: access.project.jiraProjectId,
  }
}

export const NOT_READY_REPOSITORY_MESSAGE =
  'Select and verify a Jira/Xray project before opening the test repository.'

export interface IndexedTest {
  id: string
  issueId: string | null
  key: string
  summary: string | null
  folderPath: string | null
  remoteDeletedAt: Date | null
}

/** Fetches current Xray details for an indexed test and maps them. Persists nothing. */
export async function fetchFreshTestDetails(
  workspaceId: string,
  testCase: IndexedTest,
  projectId: string,
) {
  if (!testCase.issueId) throw httpError(404, 'Test not found.')
  const remote = await getXrayTestDetailsByKey(workspaceId, testCase.key, projectId)
  if (remote.issueId !== testCase.issueId) {
    throw httpError(404, 'The indexed test no longer matches the requested Xray issue.')
  }
  const normalized = normalizeRemoteTest(remote)
  const userId = (
    await usePrisma().workspace.findFirst({ where: { id: workspaceId }, select: { ownerId: true } })
  )?.ownerId
  const draft = userId
    ? await usePrisma().testCaseDraft.findUnique({
        where: { userId_testCaseId: { userId, testCaseId: testCase.id } },
      })
    : null
  const base = draft ? { summary: draft.baseSummary ?? '', gherkin: draft.baseGherkin } : null
  const fields =
    draft?.baseAvailable && base
      ? composeDraftFields(base, { summary: draft.summary, gherkin: draft.gherkin })
      : { summary: normalized.summary, gherkin: normalized.gherkin }
  return {
    ...testCase,
    summary: fields.summary,
    testType: normalized.testType ?? 'Unknown',
    gherkin: fields.gherkin,
    readOnly: isReadOnlyTestType(normalized.testType),
    base,
    fields,
    changed: Boolean(draft?.baseAvailable),
    draftAvailable: !draft || draft.baseAvailable,
  }
}
