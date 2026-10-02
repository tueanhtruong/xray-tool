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
  constructor(message: string, readonly statusCode: number) {
    super(message)
    this.name = 'ProjectSelectionError'
  }
}

export interface AuthorizedProject {
  id: string
  jiraProjectId: string
  jiraProjectKey: string
  jiraProjectName: string
  projectReadyAt: Date
  testIssueTypeId: string
  testIssueTypeName: string
  projectStatuses: Prisma.JsonValue
  foldersPulledAt: Date | null
  tenantIdentityKind: 'CLOUD_ID' | 'SITE_ORIGIN'
  tenantIdentity: string
  workspaceId: string
}

export async function searchWorkspaceProjects(
  workspaceId: string,
  query: string,
  startAt: number,
  maxResults: number,
): Promise<JiraProjectPage> {
  return searchJiraProjects(getWorkspaceJiraClient(workspaceId), query, startAt, maxResults)
}

export async function listWorkspaceProjects(workspaceId: string) {
  const rows = await usePrisma().workspaceProject.findMany({
    where: { workspaceId },
    include: { project: true },
    orderBy: { project: { jiraProjectKey: 'asc' } },
  })
  return rows.map(({ project }) => project)
}

export async function countUserProjectDrafts(userId: string, projectId: string): Promise<number> {
  return usePrisma().testCaseDraft.count({ where: { userId, testCase: { projectId } } })
}

export async function listUserAuthorizedProjectDrafts(userId: string, projectId: string) {
  return usePrisma().testCaseDraft.findMany({
    where: { userId, testCase: { projectId } },
    include: { testCase: { select: { id: true, key: true, summary: true, folderPath: true, remoteDeletedAt: true } } },
    orderBy: { updatedAt: 'desc' },
  })
}

export async function requireAuthorizedProject(
  workspaceId: string,
  projectId: string | undefined,
): Promise<AuthorizedProject> {
  if (!projectId || projectId.length > 64) {
    throw new ProjectSelectionError(PROJECT_NOT_READY_MESSAGE, 409)
  }
  const association = await usePrisma().workspaceProject.findFirst({
    where: { workspaceId, projectId },
    include: { project: true },
  })
  if (!association) throw new ProjectSelectionError('Project not found or access is not authorized.', 404)
  return { ...association.project, workspaceId }
}

export async function getWorkspaceProjectReadiness(workspaceId: string, projectId?: string) {
  if (projectId) {
    const project = await requireAuthorizedProject(workspaceId, projectId)
    return {
      jiraProjectKey: project.jiraProjectKey,
      jiraProjectId: project.jiraProjectId,
      jiraProjectName: project.jiraProjectName,
      projectReadyAt: project.projectReadyAt,
      testIssueTypeId: project.testIssueTypeId,
      testIssueTypeName: project.testIssueTypeName,
      projectStatuses: project.projectStatuses,
      projectRecordId: project.id,
      foldersPulledAt: project.foldersPulledAt,
    }
  }
  const projects = await listWorkspaceProjects(workspaceId)
  if (projects.length !== 1) return null
  const project = projects[0]!
  return {
    jiraProjectKey: project.jiraProjectKey,
    jiraProjectId: project.jiraProjectId,
    jiraProjectName: project.jiraProjectName,
    projectReadyAt: project.projectReadyAt,
    testIssueTypeId: project.testIssueTypeId,
    testIssueTypeName: project.testIssueTypeName,
    projectStatuses: project.projectStatuses,
    projectRecordId: project.id,
    foldersPulledAt: project.foldersPulledAt,
  }
}

export async function requireWorkspaceProject(workspaceId: string, projectId?: string) {
  const project = await getWorkspaceProjectReadiness(workspaceId, projectId)
  if (!project?.projectReadyAt || !project.jiraProjectId) {
    throw new ProjectSelectionError(PROJECT_NOT_READY_MESSAGE, 409)
  }
  return project
}

export async function workspaceHasPendingDrafts(
  workspaceId: string,
  projectId: string,
  tx: Prisma.TransactionClient,
): Promise<boolean> {
  const draft = await tx.testCaseDraft.findFirst({
    where: { testCase: { projectId }, user: { workspaces: { some: { id: workspaceId } } } },
    select: { id: true },
  })
  return draft !== null
}

export async function selectWorkspaceProject(
  workspaceId: string,
  jiraProjectId: string,
): Promise<{ id: string }> {
  const workspace = await usePrisma().workspace.findUnique({
    where: { id: workspaceId },
    select: {
      id: true,
      cloudId: true,
      siteOrigin: true,
      jiraConnection: { select: { id: true } },
      xrayConnection: { select: { id: true } },
    },
  })
  if (!workspace) throw new ProjectSelectionError('Workspace not found.', 404)
  if (!workspace.jiraConnection) throw new ProjectSelectionError('Connect Jira before selecting a project.', 409)
  if (!workspace.xrayConnection) throw new ProjectSelectionError('Connect Xray Cloud before selecting a project.', 409)
  if (!/^\d+$/.test(jiraProjectId)) throw new ProjectSelectionError('Choose a valid Jira project.', 400)

  const metadata = await getJiraProjectMetadata(getWorkspaceJiraClient(workspaceId), jiraProjectId)
  try {
    await getXrayProjectRoot(workspaceId, metadata.id)
  } catch (error) {
    if (error instanceof XrayError && /permission|forbidden|not authorized|not permitted/i.test(error.message)) {
      throw new ProjectSelectionError(
        `Xray cannot access project ${metadata.key}. Check the API key's project permissions in Xray settings.`,
        403,
      )
    }
    if (error instanceof XrayError) {
      throw new ProjectSelectionError('Xray could not verify this project. Check the Xray connection and try again.', 502)
    }
    throw error
  }

  const tenantIdentityKind = workspace.cloudId ? 'CLOUD_ID' : 'SITE_ORIGIN'
  const tenantIdentity = workspace.cloudId ?? workspace.siteOrigin.replace(/\/+$/, '').toLowerCase()
  return usePrisma().$transaction(async (tx) => {
    const project = await tx.project.upsert({
      where: {
        tenantIdentityKind_tenantIdentity_jiraProjectId: {
          tenantIdentityKind,
          tenantIdentity,
          jiraProjectId: metadata.id,
        },
      },
      create: {
        tenantIdentityKind,
        tenantIdentity,
        jiraProjectId: metadata.id,
        jiraProjectKey: metadata.key,
        jiraProjectName: metadata.name,
        projectReadyAt: new Date(),
        testIssueTypeId: metadata.testIssueType.id,
        testIssueTypeName: metadata.testIssueType.name,
        projectStatuses: metadata.statuses as Prisma.InputJsonValue,
      },
      update: {
        jiraProjectKey: metadata.key,
        jiraProjectName: metadata.name,
        projectReadyAt: new Date(),
        testIssueTypeId: metadata.testIssueType.id,
        testIssueTypeName: metadata.testIssueType.name,
        projectStatuses: metadata.statuses as Prisma.InputJsonValue,
      },
    })
    await tx.workspaceProject.upsert({
      where: { workspaceId_projectId: { workspaceId, projectId: project.id } },
      create: { workspaceId, projectId: project.id, verifiedAt: new Date() },
      update: { verifiedAt: new Date() },
    })
    return { id: project.id }
  })
}
