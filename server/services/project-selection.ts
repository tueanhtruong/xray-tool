import type { Prisma } from '../generated/prisma/client'
import {
  getJiraProjectMetadata,
  searchJiraProjects,
  type JiraProjectPage,
} from '../integrations/jira/projects'
import { getWorkspaceJiraClient } from '../integrations/jira/client'
import { getXrayProjectRoot, XrayError } from '../integrations/xray/client'

export const PROJECT_NOT_READY_MESSAGE =
  'Select and verify a Jira/Xray project before opening the test repository.'
export const PROJECT_DRAFTS_BLOCK_MESSAGE =
  'Sync or discard unsynced drafts before changing projects.'

export class ProjectSelectionError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message)
    this.name = 'ProjectSelectionError'
  }
}

export async function searchWorkspaceProjects(
  workspaceId: string,
  query: string,
  startAt: number,
  maxResults: number,
): Promise<JiraProjectPage> {
  return searchJiraProjects(getWorkspaceJiraClient(workspaceId), query, startAt, maxResults)
}

export async function getWorkspaceProjectReadiness(workspaceId: string) {
  return usePrisma().workspace.findUnique({
    where: { id: workspaceId },
    select: {
      jiraProjectKey: true,
      jiraProjectId: true,
      jiraProjectName: true,
      projectReadyAt: true,
      testIssueTypeId: true,
      testIssueTypeName: true,
      projectStatuses: true,
    },
  })
}

export async function requireWorkspaceProject(workspaceId: string) {
  const project = await getWorkspaceProjectReadiness(workspaceId)
  if (!project?.projectReadyAt || !project.jiraProjectId) {
    throw new ProjectSelectionError(PROJECT_NOT_READY_MESSAGE, 409)
  }
  return project
}

export async function workspaceHasPendingDrafts(
  workspaceId: string,
  jiraProjectId: string,
  tx: Prisma.TransactionClient,
): Promise<boolean> {
  const draft = await tx.testCaseDraft.findFirst({
    where: {
      testCase: {
        workspaceId,
        jiraProjectId,
      },
    },
    select: { id: true },
  })
  return draft !== null
}

/** Delete project-owned rows; TestCase deletion cascades to its snapshot and draft. */
async function clearProjectCache(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  jiraProjectId: string,
): Promise<void> {
  await tx.folder.deleteMany({ where: { workspaceId, jiraProjectId } })
  await tx.testCase.deleteMany({ where: { workspaceId, jiraProjectId } })
}

export async function selectWorkspaceProject(
  workspaceId: string,
  projectId: string,
  confirmChange: boolean,
): Promise<void> {
  const workspace = await usePrisma().workspace.findUnique({
    where: { id: workspaceId },
    select: {
      id: true,
      jiraProjectId: true,
      jiraConnection: { select: { id: true } },
      xrayConnection: { select: { id: true } },
    },
  })
  if (!workspace) throw new ProjectSelectionError('Workspace not found.', 404)
  if (!workspace.jiraConnection)
    throw new ProjectSelectionError('Connect Jira before selecting a project.', 409)
  if (!workspace.xrayConnection)
    throw new ProjectSelectionError('Connect Xray Cloud before selecting a project.', 409)
  if (!/^\d+$/.test(projectId)) throw new ProjectSelectionError('Choose a valid Jira project.', 400)

  const jira = getWorkspaceJiraClient(workspaceId)
  const metadata = await getJiraProjectMetadata(jira, projectId)
  try {
    await getXrayProjectRoot(workspaceId, metadata.id)
  } catch (error) {
    if (
      error instanceof XrayError &&
      /permission|forbidden|not authorized|not permitted/i.test(error.message)
    ) {
      throw new ProjectSelectionError(
        `Xray cannot access project ${metadata.key}. Check the API key's project permissions in Xray settings.`,
        403,
      )
    }
    if (error instanceof XrayError) {
      throw new ProjectSelectionError(
        'Xray could not verify this project. Check the Xray connection and try again.',
        502,
      )
    }
    throw error
  }

  const prisma = usePrisma()
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Workspace" WHERE "id" = ${workspaceId} FOR UPDATE`
    const current = await tx.workspace.findUnique({
      where: { id: workspaceId },
      select: { jiraProjectId: true, ownerId: true },
    })
    if (!current) throw new ProjectSelectionError('Workspace not found.', 404)
    if (current.jiraProjectId && current.jiraProjectId !== metadata.id && !confirmChange) {
      throw new ProjectSelectionError('Confirm changing the selected Jira project.', 409)
    }
    if (current.jiraProjectId && current.jiraProjectId !== metadata.id) {
      if (await workspaceHasPendingDrafts(workspaceId, current.jiraProjectId, tx)) {
        throw new ProjectSelectionError(PROJECT_DRAFTS_BLOCK_MESSAGE, 409)
      }
      await clearProjectCache(tx, workspaceId, current.jiraProjectId)
    }
    await tx.workspace.update({
      where: { id: workspaceId },
      data: {
        jiraProjectKey: metadata.key,
        jiraProjectId: metadata.id,
        jiraProjectName: metadata.name,
        projectReadyAt: new Date(),
        testIssueTypeId: metadata.testIssueType.id,
        testIssueTypeName: metadata.testIssueType.name,
        projectStatuses: metadata.statuses as Prisma.InputJsonValue,
      },
    })
  })
}
