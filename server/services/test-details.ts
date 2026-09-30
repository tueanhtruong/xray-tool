import { getXrayTestDetailsByKey, type XrayTestDetails } from '../integrations/xray/client'

export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export interface NormalizedRemoteTest {
  summary: string
  labels: string[]
  status: string
  /** Xray test type name; undefined when Xray did not return one. */
  testType: string | undefined
  gherkin: string | null
  jira: Record<string, unknown>
}

/** Maps an Xray detail result to the plain fields the app works with. */
export function normalizeRemoteTest(remote: XrayTestDetails): NormalizedRemoteTest {
  const jira = asRecord(remote.jira)
  const status = asRecord(jira.status)
  return {
    summary: typeof jira.summary === 'string' ? jira.summary : '',
    labels: Array.isArray(jira.labels)
      ? jira.labels.filter((label): label is string => typeof label === 'string')
      : [],
    status: typeof status.name === 'string' ? status.name : '',
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
  jiraProjectId: string
}

/** Resolves the session's workspace and requires a ready project. Throws 404/409 otherwise. */
export async function requireReadyWorkspace(
  session: { userId: string; activeWorkspaceId: string },
  notReadyMessage: string,
): Promise<ReadyWorkspace> {
  const workspace = await usePrisma().workspace.findFirst({
    where: { id: session.activeWorkspaceId, ownerId: session.userId },
    select: { id: true, jiraProjectId: true, projectReadyAt: true },
  })
  if (!workspace) throw httpError(404, 'Workspace not found.')
  if (!workspace.projectReadyAt || !workspace.jiraProjectId) throw httpError(409, notReadyMessage)
  return { id: workspace.id, jiraProjectId: workspace.jiraProjectId }
}

export const NOT_READY_REPOSITORY_MESSAGE =
  'Select and verify a Jira/Xray project before opening the test repository.'

export interface IndexedTest {
  id: string
  issueId: string
  key: string
  summary: string | null
  folderPath: string | null
  remoteDeletedAt: Date | null
}

/** Fetches current Xray details for an indexed test and maps them. Persists nothing. */
export async function fetchFreshTestDetails(workspaceId: string, testCase: IndexedTest) {
  const remote = await getXrayTestDetailsByKey(workspaceId, testCase.key)
  if (remote.issueId !== testCase.issueId) {
    throw httpError(404, 'The indexed test no longer matches the requested Xray issue.')
  }
  const normalized = normalizeRemoteTest(remote)
  return {
    ...testCase,
    summary: normalized.summary,
    labels: normalized.labels,
    status: normalized.status,
    testType: normalized.testType ?? 'Unknown',
    gherkin: normalized.gherkin,
    readOnly: isReadOnlyTestType(normalized.testType),
  }
}
